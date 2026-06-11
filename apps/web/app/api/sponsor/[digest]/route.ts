import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ digest: string }> }
) {
  const { digest } = await params;
  const { signature } = await req.json();

  const res = await fetch(
    `https://api.enoki.mystenlabs.com/v1/transaction-blocks/sponsor/${digest}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ENOKI_SECRET_KEY}`,
      },
      body: JSON.stringify({ signature }),
    }
  );

  const data = await res.json();
  console.log('execute response:', JSON.stringify(data));
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json(data);
}
