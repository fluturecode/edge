import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-haiku-4-5-20251001',
];

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

  const data = await response.json();
  // Return in Anthropic format
  return data;
}

async function callGemini(model: string, system: string, message: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: system }],
      },
      contents: [
        { role: 'user', parts: [{ text: message }] }
      ],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Gemini error:', err);
    throw new Error(err);
  }

  const data = await response.json();

  // Normalize Gemini response to Anthropic format so frontend works the same
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return {
    content: [{ type: 'text', text }],
    model,
    provider: 'google',
  };
}

export async function POST(req: NextRequest) {
  try {
    const { system, message, model = 'claude-sonnet-4-6' } = await req.json();

    console.log(`Agent route: using model ${model}`);

    let data;

    if (GEMINI_MODELS.includes(model)) {
      data = await callGemini(model, system, message);
    } else {
      // Default to Anthropic for Claude models and unknown models
      data = await callAnthropic(model, system, message);
    }

    return NextResponse.json(data);

  } catch (e) {
    console.error('Agent route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
