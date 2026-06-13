import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();

  console.log('ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY);
  console.log('ANTHROPIC_API_KEY prefix:', process.env.ANTHROPIC_API_KEY?.slice(0, 15));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  console.log('Anthropic status:', res.status);
  console.log('Anthropic response:', JSON.stringify(data));
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json({ text: data.content?.[0]?.text || '' });
}
