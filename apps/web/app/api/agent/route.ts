import { NextRequest, NextResponse } from 'next/server';

const GEMINI_MODELS = [
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
];

async function callGemini(model: string, system: string, message: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Gemini error:', err);
    throw new Error(err);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { content: [{ type: 'text', text }], model, provider: 'google' };
}

/**
 * Extract complete JSON objects from a streaming text buffer using brace counting.
 * Returns { objects: parsed[], remaining: string } where remaining is the unparsed tail.
 * This correctly handles nested braces, strings with braces, and partial objects.
 */
function extractCompleteObjects(text: string): { objects: any[]; remaining: string } {
  const objects: any[] = [];
  let i = 0;

  while (i < text.length) {
    // Find the start of a JSON object
    const start = text.indexOf('{', i);
    if (start === -1) break;

    let depth = 0;
    let inString = false;
    let escape = false;
    let j = start;

    while (j < text.length) {
      const ch = text[j];

      if (escape) {
        escape = false;
      } else if (ch === '\\' && inString) {
        escape = true;
      } else if (ch === '"') {
        inString = !inString;
      } else if (!inString) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            // Found a complete object
            try {
              const obj = JSON.parse(text.slice(start, j + 1));
              if (obj.thinking && obj.merchant && obj.amount !== undefined && obj.reasoning) {
                objects.push(obj);
              }
            } catch {}
            i = j + 1;
            break;
          }
        }
      }
      j++;
    }

    // If we didn't find a closing brace, the object is incomplete — stop here
    if (depth > 0) break;
    if (j === text.length && depth > 0) break;
  }

  return { objects, remaining: text.slice(i) };
}

export async function POST(req: NextRequest) {
  try {
    const { system, message, model = 'claude-sonnet-4-6', stream = false } = await req.json();
    console.log('Agent route called:', { model, stream });

    // Gemini — collect full response then stream decisions one by one
    if (GEMINI_MODELS.includes(model)) {
      const data = await callGemini(model, system, message);
      if (!stream) return NextResponse.json(data);

      const text = data.content?.[0]?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      let decisions: any[] = [];
      try { decisions = JSON.parse(clean); } catch {
        return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
      }

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          for (const decision of decisions) {
            controller.enqueue(encoder.encode(JSON.stringify(decision) + '\n'));
            await new Promise(r => setTimeout(r, 50));
          }
          controller.close();
        },
      });
      return new Response(readable, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Accel-Buffering': 'no' },
      });
    }

    // Non-streaming Anthropic path
    if (!stream) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          system,
          messages: [{ role: 'user', content: message }],
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return NextResponse.json(await response.json());
    }

    // TRUE streaming Anthropic path
    // Calls Claude with stream:true, parses SSE events, extracts complete JSON
    // objects using brace-counting as they accumulate — emits each decision
    // the moment it's complete rather than waiting for all 6.
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        stream: true,
        system,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      console.error('Anthropic streaming error:', err);
      throw new Error(err);
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = claudeResponse.body!.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';   // SSE line buffer
        let jsonBuffer = '';  // accumulates Claude's text output

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                jsonBuffer += event.delta.text;

                // Extract any complete objects from the accumulated text
                const { objects, remaining } = extractCompleteObjects(jsonBuffer);
                jsonBuffer = remaining;

                for (const obj of objects) {
                  console.log('Streaming decision:', obj.merchant);
                  controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
                }
              }
            } catch {}
          }
        }

        // Final pass on any remaining buffer
        if (jsonBuffer.trim()) {
          const { objects } = extractCompleteObjects(jsonBuffer);
          for (const obj of objects) {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
          }
        }

        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (e) {
    console.error('Agent route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
