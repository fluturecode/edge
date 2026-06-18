import { NextRequest, NextResponse } from 'next/server';

const WALRUS_PUBLISHER = 'https://walrus-mainnet-publisher-1.staketab.org:443';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const response = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=3`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: text }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: `Walrus write failed: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
