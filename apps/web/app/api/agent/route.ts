export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

const GEMINI_MODELS = [
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
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
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  return { content: [{ type: 'text', text }], model, provider: 'anthropic' };
}

function parseDecisions(text: string): any[] {
  const clean = text.replace(/```json|```/g, '').trim();

  // Try JSON array first
  try {
    const arr = JSON.parse(clean);
    if (Array.isArray(arr)) return arr;
  } catch {}

  // Try newline-delimited objects
  const decisions: any[] = [];
  for (const line of clean.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.thinking && obj.merchant && obj.amount !== undefined && obj.reasoning) {
        decisions.push(obj);
      }
    } catch {}
  }

  return decisions;
}

export async function POST(req: NextRequest) {
  try {
    const { system, message, model = 'claude-sonnet-4-6', stream = false } = await req.json();
    const isGemini = GEMINI_MODELS.includes(model);

    // Non-streaming path
    if (!stream) {
      const data = isGemini
        ? await callGemini(model, system, message)
        : await callAnthropic(model, system, message);
      return NextResponse.json(data);
    }

    // Streaming path — identical for Claude and Gemini:
    // Get full response, parse decisions, stream with 120ms delay between each.
    // This matches Gemini's smooth UX for Claude — cards fire progressively.
    const data = isGemini
      ? await callGemini(model, system, message)
      : await callAnthropic(model, system, message);

    const decisions = parseDecisions(data.content?.[0]?.text || '');

    if (decisions.length === 0) {
      return NextResponse.json({ error: 'No decisions parsed' }, { status: 500 });
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for (const decision of decisions) {
          controller.enqueue(encoder.encode(JSON.stringify(decision) + '\n'));
          await new Promise(r => setTimeout(r, 120));
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
