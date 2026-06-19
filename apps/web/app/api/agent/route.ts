export const runtime = 'edge';

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
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { content: [{ type: 'text', text }], model, provider: 'google' };
}

/**
 * Extract complete JSON objects from streaming text using brace counting.
 * Correctly handles strings containing braces, escape sequences, and partial objects.
 * Returns complete objects found so far and the remaining unparsed tail.
 */
function extractCompleteObjects(text: string): { objects: any[]; remaining: string } {
  const objects: any[] = [];
  let i = 0;

  while (i < text.length) {
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

    if (depth > 0) break;
  }

  return { objects, remaining: text.slice(i) };
}

export async function POST(req: NextRequest) {
  try {
    const { system, message, model = 'claude-sonnet-4-6', stream = false } = await req.json();

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
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Accel-Buffering': 'no',
          'Cache-Control': 'no-cache, no-transform',
        },
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

    // Streaming Anthropic path — edge runtime ensures no buffering
    // Brace-counting parser emits each decision the moment Claude completes it
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

    if (!claudeResponse.ok) throw new Error(await claudeResponse.text());

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = claudeResponse.body!.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let jsonBuffer = '';

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
                const { objects, remaining } = extractCompleteObjects(jsonBuffer);
                jsonBuffer = remaining;
                for (const obj of objects) {
                  controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
                }
              }
            } catch {}
          }
        }

        // Final pass
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
        'Cache-Control': 'no-cache, no-transform',
      },
    });

  } catch (e) {
    console.error('Agent route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
