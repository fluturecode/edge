import { NextRequest, NextResponse } from "next/server";

const PUBLISHERS = [
  "https://walrus-mainnet-publisher.nami.cloud/GfYcdOZbB7wLdVPdbUAd",
  "https://walrus-mainnet-publisher-1.staketab.org:443",
];

async function tryPublisher(publisher: string, data: string) {
  const res = await fetch(`${publisher}/v1/blobs`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: data,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${publisher} returned ${res.status}`);
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = JSON.stringify(body);

    for (const publisher of PUBLISHERS) {
      try {
        const result = await tryPublisher(publisher, data);
        console.log("Walrus write SUCCESS via", publisher, result);
        return NextResponse.json(result);
      } catch (err) {
        console.log("Walrus publisher failed, trying next:", publisher, err);
      }
    }

    throw new Error("All publishers failed");

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
