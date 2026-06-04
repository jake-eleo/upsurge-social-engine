import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { url } = await request.json();
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString('base64');
    const contentType = response.headers.get('content-type') || 'image/png';
    return NextResponse.json({ base64, mediaType: contentType });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}