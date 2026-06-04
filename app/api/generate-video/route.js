import { NextResponse } from 'next/server';

export async function POST(request) {
  const { prompt, duration = 10, aspectRatio = '9:16' } = await request.json();

  // Start video generation
  const response = await fetch('https://api.x.ai/v1/videos/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-imagine-video',
      prompt,
      duration,
      aspect_ratio: aspectRatio,
      resolution: '720p',
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: data }, { status: response.status });
  }

  // Poll for completion
  const requestId = data.request_id;
  if (requestId) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollResponse = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
        headers: { 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
      });
      const pollData = await pollResponse.json();
      if (pollData.status === 'done') {
        return NextResponse.json({ data: [{ url: pollData.video.url }] });
      }
      if (pollData.status === 'error') {
        return NextResponse.json({ error: 'Video generation failed' }, { status: 500 });
      }
    }
    return NextResponse.json({ error: 'Video generation timed out' }, { status: 504 });
  }

  return NextResponse.json(data);
}