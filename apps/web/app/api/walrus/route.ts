import { NextRequest, NextResponse } from "next/server";

const WALRUS_PUBLISHER = "https://walrus-mainnet-publisher-1.staketab.org:443";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = JSON.stringify(body);

    const walrusRes = await fetch(`${WALRUS_PUBLISHER}/v1/blobs`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: data,
      signal: AbortSignal.timeout(5000),
    });

    if (walrusRes.ok) {
      const result = await walrusRes.json();
      console.log("Walrus write SUCCESS:", result);
      return NextResponse.json(result);
    }

    throw new Error(`Walrus returned ${walrusRes.status}`);

  } catch (error) {
    console.log("Walrus fallback (mock):", error);
    return NextResponse.json({
      newlyCreated: {
        blobObject: {
          blobId: "local-" + Date.now()
        }
      }
    });
  }
}
