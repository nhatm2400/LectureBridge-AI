import { NextRequest } from 'next/server';

const BACKEND_BASE_URL = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000'
).replace(/\/$/, '');

const RESPONSE_HEADER_ALLOWLIST = [
  'accept-ranges',
  'cache-control',
  'content-disposition',
  'content-length',
  'content-range',
  'content-type',
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const upstreamHeaders = new Headers();

  const cookie = request.headers.get('cookie');
  const range = request.headers.get('range');
  if (cookie) upstreamHeaders.set('cookie', cookie);
  if (range) upstreamHeaders.set('range', range);

  try {
    const upstream = await fetch(
      `${BACKEND_BASE_URL}/api/videos/${encodeURIComponent(id)}/stream`,
      {
        headers: upstreamHeaders,
        cache: 'no-store',
        redirect: 'follow',
        signal: request.signal,
      }
    );

    const responseHeaders = new Headers();
    for (const name of RESPONSE_HEADER_ALLOWLIST) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set('cache-control', 'private, no-store');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: 'Video service unavailable' }, { status: 502 });
  }
}
