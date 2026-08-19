// Guard for /api/agent, the LLM proxy route — calls out to Anthropic/Google
// using this app's own API keys with no user auth in front of it. Without
// this, anyone who finds the URL can spend those credits indefinitely.
// This is the minimum viable defense for a public demo, not a substitute
// for real auth:
//
// - Origin/Referer check only stops browsers that honor CORS/fetch
//   semantics — a client that sets its own headers (curl, a script) can
//   spoof Origin and get past this. It raises the bar for casual abuse,
//   it doesn't stop a targeted one.
// - The rate limiter is in-memory and per-instance on purpose (no new
//   dependency, per the ask) — it resets on cold start and doesn't share
//   state across concurrent instances, so it's a soft limit, not a hard
//   spend cap.
//
// For a real deployment, prefer binding these routes to the app's own
// zkLogin session (require a valid idToken/session proof, not just a
// matching Origin) and/or a hard daily spend cap tracked server-side —
// neither is in scope here.

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = new Set(
  [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter((v): v is string => !!v)
);

function requestOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin');
  if (origin) return origin;
  const referer = req.headers.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function checkOrigin(req: NextRequest): boolean {
  const origin = requestOrigin(req);
  return origin !== null && ALLOWED_ORIGINS.has(origin);
}

// Fixed-window counter, one bucket per client IP.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for; if it's ever missing, every caller shares
  // one bucket rather than the check silently doing nothing.
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

export const MAX_PROMPT_LENGTH = 4000;

/** Runs the origin + rate-limit checks; returns a response to short-circuit
 *  with, or null if the request should proceed. */
export function guardRequest(req: NextRequest): NextResponse | null {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  return null;
}
