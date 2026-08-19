import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Convert seconds to VTT timestamp format: HH:MM:SS.mmm
function toVTTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: videoId } = await params;
  const requestedLang = (request.nextUrl.searchParams.get('lang') || 'vi').toLowerCase();
  const cookie = request.headers.get('cookie');

  try {
    const res = await fetch(`${API_BASE}/api/videos/${encodeURIComponent(videoId)}/transcript`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) {
      return new NextResponse('WEBVTT\n\n', {
        status: res.status,
        headers: {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      });
    }
    const data = await res.json();

    const segments = data?.segments_by_language?.[requestedLang] || [];
    if (!segments || segments.length === 0) {
      // Return empty VTT if no transcript
      const emptyVTT = 'WEBVTT\n\n';
      return new NextResponse(emptyVTT, {
        status: 200,
        headers: {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // Build WebVTT content
    let vtt = 'WEBVTT\n\n';

    segments.forEach((seg: { start: number; end: number; text: string }, i: number) => {
      vtt += `${i + 1}\n`;
      vtt += `${toVTTTime(seg.start)} --> ${toVTTTime(seg.end)}\n`;
      vtt += `${seg.text.trim()}\n\n`;
    });

    return new NextResponse(vtt, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    const fallback = 'WEBVTT\n\n';
    return new NextResponse(fallback, {
      status: 502,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  }
}
