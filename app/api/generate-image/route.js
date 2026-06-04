import { NextResponse } from 'next/server';

// xAI image models. grok-imagine-image-pro was deprecated 2026-05-15, so we lead
// with the recommended "quality" model and keep pro as a fallback. The image
// EDITS endpoint (image->image) is what lets Grok actually use your product photo.
const EDIT_MODELS = ['grok-imagine-image-quality', 'grok-imagine-image-pro'];
const GEN_MODELS  = ['grok-imagine-image-quality', 'grok-imagine-image-pro'];

const GEN_URL  = 'https://api.x.ai/v1/images/generations';
const EDIT_URL = 'https://api.x.ai/v1/images/edits';

export async function POST(request) {
  const body = await request.json();
  const { prompt, referenceImageUrls, aspectRatio, model } = body;

  const refs = Array.isArray(referenceImageUrls)
    ? referenceImageUrls.filter(Boolean).slice(0, 3)   // xAI edits supports up to 3 source images
    : [];
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
  };
  // aspect_ratio (e.g. "1:1", "16:9", "9:16") controls output dimensions. For
  // edits, the output otherwise follows the INPUT image's ratio, so we must send
  // it explicitly to get the right per-platform shape.
  const aspectField = aspectRatio ? { aspect_ratio: aspectRatio } : {};

  // ── IMAGE-TO-IMAGE (edits): Grok actually SEES the product photo(s) ──
  if (refs.length > 0) {
    const imageField = refs.length === 1
      ? { url: refs[0], type: 'image_url' }
      : refs.map(u => ({ url: u, type: 'image_url' }));

    const models = model ? [model] : EDIT_MODELS;
    for (const m of models) {
      const res = await fetch(EDIT_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: m, prompt, image: imageField, ...aspectField }),
      });
      if (res.ok) {
        console.log('[generate-image] EDIT ok via', m, '| refs:', refs.length, '| aspect:', aspectRatio || 'default');
        return NextResponse.json(await res.json());
      }
      const err = await res.text();
      console.warn(`[generate-image] EDIT failed (${m}) ${res.status}: ${err.slice(0, 200)}`);
    }
    console.warn('[generate-image] All edit models failed; falling back to text-to-image generation.');
  }

  // ── TEXT-TO-IMAGE (generations): no reference, or edits unavailable ──
  const models = model ? [model] : GEN_MODELS;
  let lastErr = '', lastStatus = 500;
  for (const m of models) {
    const res = await fetch(GEN_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: m, prompt, n: 1, ...aspectField }),
    });
    if (res.ok) {
      console.log('[generate-image] GEN ok via', m, '| aspect:', aspectRatio || 'default');
      return NextResponse.json(await res.json());
    }
    lastErr = await res.text();
    lastStatus = res.status;
    console.warn(`[generate-image] GEN failed (${m}) ${res.status}: ${lastErr.slice(0, 200)}`);
  }
  return NextResponse.json({ error: lastErr }, { status: lastStatus });
}
