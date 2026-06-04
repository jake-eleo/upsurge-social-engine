import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '../../../lib/supabase-admin';

// Composites a REAL product image onto an AI-generated background — the product
// is pixel-identical to your photo (never re-rendered by the model). Best results
// come from product PNGs with a TRANSPARENT background; a product shot on solid
// white will composite as a white rectangle.
//
// Body: { backgroundUrl, productUrl, postId, scale? }  (scale = product width as
// fraction of canvas width, default 0.62)
export async function POST(request) {
  try {
    const { backgroundUrl, productUrl, postId, scale = 0.62 } = await request.json();
    if (!backgroundUrl || !productUrl) {
      return NextResponse.json({ error: 'backgroundUrl and productUrl are required' }, { status: 400 });
    }

    const [bgResp, prodResp] = await Promise.all([fetch(backgroundUrl), fetch(productUrl)]);
    if (!bgResp.ok)   return NextResponse.json({ error: `background fetch ${bgResp.status}` }, { status: 502 });
    if (!prodResp.ok) return NextResponse.json({ error: `product fetch ${prodResp.status}` }, { status: 502 });

    const bgBuf   = Buffer.from(await bgResp.arrayBuffer());
    const prodBuf = Buffer.from(await prodResp.arrayBuffer());

    const bgMeta = await sharp(bgBuf).metadata();
    const W = bgMeta.width  || 1080;
    const H = bgMeta.height || 1080;

    // Scale the product to a share of the canvas width, preserving aspect ratio
    // and keeping its alpha channel (transparency) intact.
    const targetW = Math.round(W * Math.min(Math.max(scale, 0.2), 0.9));
    const product = await sharp(prodBuf)
      .ensureAlpha()
      .resize({ width: targetW, withoutEnlargement: false })
      .toBuffer();
    const pMeta = await sharp(product).metadata();
    const pW = pMeta.width  || targetW;
    const pH = pMeta.height || targetW;

    // Center horizontally; sit slightly below middle so any background headline
    // up top stays readable.
    const left = Math.round((W - pW) / 2);
    const top  = Math.round((H - pH) / 2 + H * 0.04);

    // Soft contact shadow under the product for grounding.
    const shadow = await sharp({
      create: { width: pW, height: Math.round(pH * 0.18), channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.45 } },
    }).png().blur(18).toBuffer();

    const result = await sharp(bgBuf)
      .composite([
        { input: shadow,  left: Math.max(0, left), top: Math.min(H - 1, top + pH - Math.round(pH * 0.10)), blend: 'over' },
        { input: product, left: Math.max(0, left), top: Math.max(0, top), blend: 'over' },
      ])
      .jpeg({ quality: 95 })
      .toBuffer();

    const filename = `posts/${postId || 'composite_' + Math.round(W)}_product.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('upsurge-assets')
      .upload(filename, result, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from('upsurge-assets')
      .getPublicUrl(filename);

    return NextResponse.json({ url: urlData.publicUrl, permanentUrl: urlData.publicUrl });
  } catch (e) {
    console.error('composite-product error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
