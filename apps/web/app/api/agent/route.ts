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
  return {
    content: [{ type: 'text', text }],
    model,
    provider: 'google',
  };
}

export async function POST(req: NextRequest) {
  try {
    const { system, message, model = 'claude-sonnet-4-6', stream = false } = await req.json();
    console.log('Agent route called:', { model, stream, hasAnthropic: !!process.env.ANTHROPIC_API_KEY, hasGoogle: !!process.env.GOOGLE_API_KEY });

    // Gemini — no streaming support, use non-streaming path
    if (GEMINI_MODELS.includes(model)) {
      const data = await callGemini(model, system, message);

      if (!stream) return NextResponse.json(data);

      // For Gemini streaming — parse and stream decisions from completed response
      const text = data.content?.[0]?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      let decisions: any[] = [];
      try { decisions = JSON.parse(clean); } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

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

      if (!response.ok) {
        const err = await response.text();
        console.error('Anthropic error:', err);
        throw new Error(err);
      }

      return NextResponse.json(await response.json());
    }

    // TRUE streaming Anthropic path — stream Claude's output and parse decisions in real time
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
        let buffer = '';
        let fullText = '';

        // Parse Claude's SSE stream and accumulate text
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                fullText += event.delta.text;

                // Try to parse complete JSON objects as they accumulate
                // Look for complete decision objects: {...}
                const objectRegex = /\{[^{}]*"thinking"[^{}]*"merchant"[^{}]*"amount"[^{}]*"reasoning"[^{}]*\}/g;
                const matches = fullText.match(objectRegex);
                if (matches) {
                  for (const match of matches) {
                    try {
                      const decision = JSON.parse(match);
                      if (decision.thinking && decision.merchant && decision.amount && decision.reasoning) {
                        controller.enqueue(encoder.encode(JSON.stringify(decision) + '\n'));
                        // Remove matched decision from fullText to avoid re-processing
                        fullText = fullText.replace(match, '✓');
                      }
                    } catch {}
                  }
                }
              }
            } catch {}
          }
        }

        // Final pass — parse any remaining decisions from complete text
        try {
          const clean = fullText.replace(/✓/g, '').replace(/```json|```/g, '').trim();
          // Extract array content
          const arrayMatch = clean.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            const decisions = JSON.parse(arrayMatch[0]);
            for (const decision of decisions) {
              if (decision.thinking && decision.merchant) {
                controller.enqueue(encoder.encode(JSON.stringify(decision) + '\n'));
              }
            }
          }
        } catch {}

        controller.close();
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Accel-Buffering': 'no' },
    });

  } catch (e) {
    console.error('Agent route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
