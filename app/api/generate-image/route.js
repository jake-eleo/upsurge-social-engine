import { NextResponse } from 'next/server';

// xAI image models. Generations (text->image) uses the Pro model. The image
// EDITS (image->image) endpoint is what actually lets Grok use your real product
// photos; we try the Pro model first and fall back to the "quality" model name
// since xAI's edit docs reference that one.
const GEN_MODEL = 'grok-imagine-image-pro';
const EDIT_MODELS = ['grok-imagine-image-pro', 'grok-imagine-image-quality'];

const GEN_URL  = 'https://api.x.ai/v1/images/generations';
const EDIT_URL = 'https://api.x.ai/v1/images/edits';

export async function POST(request) {
  const body = await request.json();
  const { prompt, referenceImageUrls, model } = body;

  const refs = Array.isArray(referenceImageUrls)
    ? referenceImageUrls.filter(Boolean).slice(0, 3)   // xAI edits supports up to 3 source images
    : [];
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
  };

  // ── IMAGE-TO-IMAGE (edits): Grok actually SEES the product photo(s) ──
  if (refs.length > 0) {
    // xAI edit image object: { url, type: 'image_url' }. Single object for one
    // image; array for multi-image compose (up to 3).
    const imageField = refs.length === 1
      ? { url: refs[0], type: 'image_url' }
      : refs.map(u => ({ url: u, type: 'image_url' }));

    let lastErr = '';
    for (const m of EDIT_MODELS) {
      const res = await fetch(EDIT_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: m, prompt, image: imageField }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[generate-image] EDIT ok via', m, '| refs:', refs.length);
        return NextResponse.json(data);
      }
      lastErr = await res.text();
      console.warn(`[generate-image] EDIT failed (${m}) ${res.status}: ${lastErr.slice(0, 200)}`);
    }
    // Edits failed entirely — fall through to plain generation so the post still
    // gets an image (it just won't match the product as closely).
    console.warn('[generate-image] All edit models failed; falling back to text-to-image generation.');
  }

  // ── TEXT-TO-IMAGE (generations): no reference, or edits unavailable ──
  const res = await fetch(GEN_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: model || GEN_MODEL, prompt, n: 1 }),
  });
  if (!res.ok) {
    const error = await res.text();
    console.error('[generate-image] Grok generation error:', res.status, error);
    return NextResponse.json({ error }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
