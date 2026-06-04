import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const path = (await params).path.join('/');
  // Uses the new project's Supabase URL from env (not a hardcoded project).
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseUrl = `${base}/storage/v1/object/public/upsurge-assets/${path}`;

  const response = await fetch(supabaseUrl);
  if (!response.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = await response.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}