import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json();
  const { prompt, image } = body;

  const requestBody = {
    model: 'grok-imagine-image-pro',
    prompt,
    n: 1,
  };

  // Pass reference image through to xAI if provided
  if (image && image.data) {
    requestBody.image = image;
  }

  console.log('[generate-image] Prompt length:', prompt?.length, 'Has ref image:', !!image);

  const response = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[generate-image] Grok error:', response.status, error);
    return NextResponse.json({ error }, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}