import { NextRequest, NextResponse } from 'next/server';

const GEMINI_MODELS = [
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
];

async function callAnthropic(model: string, system: string, message: string) {
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

  return response.json();
}

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

// Streaming endpoint — returns decisions one at a time as newline-delimited JSON
export async function POST(req: NextRequest) {
  try {
    const { system, message, model = 'claude-sonnet-4-6', stream = false } = await req.json();
    console.log('Agent route called:', { model, stream, hasAnthropic: !!process.env.ANTHROPIC_API_KEY, hasGoogle: !!process.env.GOOGLE_API_KEY });

    // Non-streaming path (fallback)
    if (!stream) {
      const data = GEMINI_MODELS.includes(model)
        ? await callGemini(model, system, message)
        : await callAnthropic(model, system, message);
      return NextResponse.json(data);
    }

    // Streaming path — fetch all decisions then stream them one by one
    const data = GEMINI_MODELS.includes(model)
      ? await callGemini(model, system, message)
      : await callAnthropic(model, system, message);

    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();

    let decisions: any[] = [];
    try {
      decisions = JSON.parse(clean);
    } catch (e) {
      return NextResponse.json({ error: 'Failed to parse decisions' }, { status: 500 });
    }

    // Stream each decision with a small delay so the UI can render progressively
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for (const decision of decisions) {
          controller.enqueue(encoder.encode(JSON.stringify(decision) + '\n'));
          // Small delay between decisions so UI can render each one
          await new Promise(r => setTimeout(r, 100));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (e) {
    console.error('Agent route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
