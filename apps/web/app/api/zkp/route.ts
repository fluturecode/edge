import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_API_KEY!;

  // Try Authorization: Bearer format
  const res = await fetch('https://api.enoki.mystenlabs.com/v1/zklogin/zkp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'zklogin-jwt': body.idToken,
    },
    body: JSON.stringify({
      network: body.network,
      ephemeralPublicKey: body.ephemeralPublicKey,
      maxEpoch: body.maxEpoch,
      randomness: body.randomness,
    }),
  });

  const data = await res.json();
  console.log('Enoki response status:', res.status, JSON.stringify(data).slice(0, 100));
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json(data);
}
