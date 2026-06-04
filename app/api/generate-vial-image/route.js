import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '../../../lib/supabase-admin';

// ── Config ────────────────────────────────────────────────────────
// NOTE: This is a legacy "product on background" route. The template/product
// images must live in YOUR upsurge-assets bucket. TODO: upload a product
// template + logo and update these paths. Uses the new project's Supabase URL.
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const BLANK_VIAL_URL = `${SUPA}/storage/v1/object/public/upsurge-assets/brand-assets/product-template.png`;
const LOGO_URL = 'https://upsurgesupps.com/cdn/shop/files/UpSurge_Supp_Logo_small_background_7628e0a2-c5f5-4bad-a70c-62c6d570f944.png';

// Vial measurements (from 2000x1333 source image, measured from Glutathione reference)
const VIAL_SOURCE = { width: 2000, height: 1333 };
const VIAL_BOX = { x: 752, y: 164, w: 451, h: 1039 }; // bounding box of the vial itself
const LABEL_BAND = { yStart: 0.382, yEnd: 0.952 }; // dark label area (38.2%–95.2% of vial height)
const TEXT_ZONE = { yCenter: 0.726, xCenter: 932 }; // where product name sits (Glutathione reference: 70.3%–74.9%)

// ── Remove black background → transparent ─────────────────────────
async function removeBlackBackground(imageBuffer, threshold = 25) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    // If pixel is near-black, make it transparent
    if (r < threshold && g < threshold && b < threshold) {
      pixels[i + 3] = 0; // set alpha to 0
    }
  }

  return await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).png().toBuffer();
}

// ── Overlay text onto vial label area ─────────────────────────────
async function addTextToVial(vialBuffer, productName, subtitle) {
  const meta = await sharp(vialBuffer).metadata();
  const imgW = meta.width;
  const imgH = meta.height;

  // Scale factors if image isn't the original 2000x1333
  const scaleX = imgW / VIAL_SOURCE.width;
  const scaleY = imgH / VIAL_SOURCE.height;

  // Text position — based on measured Glutathione vial reference
  const textCenterX = Math.round(TEXT_ZONE.xCenter * scaleX);
  const textCenterY = Math.round((VIAL_BOX.y + VIAL_BOX.h * TEXT_ZONE.yCenter) * scaleY);

  // Font sizing relative to vial width (451px at source scale)
  const vialWidth = Math.round(VIAL_BOX.w * scaleX);
  const mainFontSize = Math.round(vialWidth * 0.11); // ~50px at source scale
  const subFontSize = Math.round(vialWidth * 0.065);
  const lineGap = Math.round(vialWidth * 0.06);

  const svgParts = [];
  let yOffset = textCenterY;

  if (productName) {
    svgParts.push(
      `<text x="${textCenterX}" y="${yOffset}" text-anchor="middle" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="${mainFontSize}" font-weight="500" fill="white" letter-spacing="1.5">${escapeXml(productName)}</text>`
    );
    yOffset += mainFontSize + lineGap;
  }

  if (subtitle) {
    svgParts.push(
      `<text x="${textCenterX}" y="${yOffset}" text-anchor="middle" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="${subFontSize}" font-weight="300" fill="#AAAAAA" letter-spacing="1">${escapeXml(subtitle)}</text>`
    );
  }

  if (svgParts.length === 0) return vialBuffer;

  const svgOverlay = Buffer.from(
    `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">${svgParts.join('')}</svg>`
  );

  return await sharp(vialBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0, blend: 'over' }])
    .png()
    .toBuffer();
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Generate background scene with Grok (no vial) ────────────────
async function generateBackground(scenePrompt, platform) {
  const aspectMap = {
    instagram: '1:1',
    facebook: '16:9',
    linkedin: '1:1',
    tiktok: '9:16',
  };

  const bgPrompt = `Create a premium cinematic background scene for a fitness supplements brand. NO product, NO bottle, NO tub, NO text in the image — ONLY the environment and atmosphere.

SCENE: ${scenePrompt}

STYLE: Dark, moody, premium energetic fitness-brand aesthetic. Deep blacks, subtle aqua-to-violet accent lighting (#5EEBEB → #C983F3), volumetric atmosphere, shallow depth of field background blur. The center of the image should have space for a product to be placed there later.

COLORS: Deep black #0A0A14, dark charcoal #141420, accent aqua #5EEBEB, accent violet #C983F3. No warm tones.

COMPOSITION: Leave the center 40% of the frame relatively clear/dark for product placement. Environmental elements (light rays, particles, surfaces, reflections) should frame the center, not fill it.

QUALITY: 8K photorealistic, cinematic lighting, Phase One camera quality.

ABSOLUTE PROHIBITION: Do NOT include any bottle, vial, container, product, person, text, logo, or UI element. This is ONLY a background environment.`;

  const response = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-imagine-image-pro',
      prompt: bgPrompt,
      n: 1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Grok API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const imageUrl = data.data?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL returned from Grok');

  const imgResponse = await fetch(imageUrl);
  return Buffer.from(await imgResponse.arrayBuffer());
}

// ── Composite vial onto background ────────────────────────────────
async function compositeVialOnBackground(bgBuffer, vialBuffer, platform) {
  const bgMeta = await sharp(bgBuffer).metadata();
  const bgW = bgMeta.width || 1024;
  const bgH = bgMeta.height || 1024;

  // Size vial to ~40-50% of background height, maintaining aspect ratio
  const vialTargetH = Math.round(bgH * 0.70);
  const resizedVial = await sharp(vialBuffer)
    .resize(null, vialTargetH, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  const vialMeta = await sharp(resizedVial).metadata();
  const vialW = vialMeta.width;
  const vialH = vialMeta.height;

  // Center the vial on the background
  const left = Math.round((bgW - vialW) / 2);
  const top = Math.round((bgH - vialH) / 2) + Math.round(bgH * 0.02); // slightly below center

  return await sharp(bgBuffer)
    .composite([{ input: resizedVial, left, top, blend: 'over' }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

// ── Smart corner detection (same as overlay-and-save) ─────────────
async function analyzeCorner(imageBuffer, region) {
  const { left, top, width, height } = region;
  const cornerBuffer = await sharp(imageBuffer)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = cornerBuffer;
  const channels = info.channels;
  const pixelCount = info.width * info.height;

  let totalBrightness = 0;
  for (let i = 0; i < data.length; i += channels) {
    totalBrightness += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  const avgBrightness = totalBrightness / pixelCount;

  let sumSquaredDiff = 0;
  for (let i = 0; i < data.length; i += channels) {
    const px = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    sumSquaredDiff += (px - avgBrightness) ** 2;
  }
  const complexity = Math.min(Math.sqrt(sumSquaredDiff / pixelCount) / 80, 1);
  const score = (avgBrightness / 255) * 0.65 + complexity * 0.35;

  return { brightness: avgBrightness, complexity, score };
}

async function addLogoSmartCorner(imageBuffer) {
  const logoResponse = await fetch(LOGO_URL);
  const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());

  const meta = await sharp(imageBuffer).metadata();
  const imgW = meta.width || 1080;
  const imgH = meta.height || 1080;

  const logoSize = Math.round(imgW * 0.15);
  const resizedLogo = await sharp(logoBuffer)
    .resize(logoSize, logoSize, { fit: 'inside' })
    .png()
    .toBuffer();

  const logoMeta = await sharp(resizedLogo).metadata();
  const logoW = logoMeta.width || logoSize;
  const logoH = logoMeta.height || logoSize;
  const padding = Math.round(imgW * 0.03);

  const corners = [
    { name: 'top-left', sLeft: 0, sTop: 0, logoLeft: padding, logoTop: padding },
    { name: 'top-right', sLeft: imgW - Math.round(imgW * 0.25), sTop: 0, logoLeft: imgW - logoW - padding, logoTop: padding },
    { name: 'bottom-left', sLeft: 0, sTop: imgH - Math.round(imgH * 0.25), logoLeft: padding, logoTop: imgH - logoH - padding },
    { name: 'bottom-right', sLeft: imgW - Math.round(imgW * 0.25), sTop: imgH - Math.round(imgH * 0.25), logoLeft: imgW - logoW - padding, logoTop: imgH - logoH - padding },
  ];

  let best = corners[1];
  let bestScore = Infinity;

  for (const c of corners) {
    try {
      const sW = Math.min(Math.round(imgW * 0.25), imgW - c.sLeft);
      const sH = Math.min(Math.round(imgH * 0.25), imgH - c.sTop);
      const analysis = await analyzeCorner(imageBuffer, { left: c.sLeft, top: c.sTop, width: sW, height: sH });
      c.analysis = analysis;
      if (analysis.score < bestScore) { bestScore = analysis.score; best = c; }
    } catch (e) {
      c.analysis = { brightness: 128, complexity: 0.5, score: 0.5 };
    }
  }

  // Adapt logo brightness for background
  let finalLogo = resizedLogo;
  if (best.analysis.brightness > 160) {
    finalLogo = await sharp(resizedLogo).modulate({ brightness: 0.6 }).toBuffer();
  } else if (best.analysis.brightness > 100) {
    finalLogo = await sharp(resizedLogo).modulate({ brightness: 0.85 }).toBuffer();
  }

  return await sharp(imageBuffer)
    .composite([{ input: finalLogo, left: best.logoLeft, top: best.logoTop, blend: 'over' }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

// ── Parse vial text from suggestedImage field ─────────────────────
// Expected format: "BLANK_VIAL_NO_BACKGROUND + Testosterone Cypionate | Subtitle text"
// or: "BLANK_VIAL_NO_BACKGROUND + Product Name"
function parseVialText(suggestedImage) {
  // Remove any asset ID prefix (handles BLANK_VIAL_WITH_ELEO_LOGO_NO_BACKGROUND and similar)
  const cleaned = suggestedImage
    .replace(/^[A-Z_]+VIAL[A-Z_]*\s*/i, '')
    .replace(/^\+?\s*/, '')
    .trim();

  if (!cleaned) return { productName: null, subtitle: null };

  // Split on | for product name + subtitle
  const parts = cleaned.split('|').map(s => s.trim());
  return {
    productName: parts[0] || null,
    subtitle: parts[1] || null,
  };
}

// ── Main handler ──────────────────────────────────────────────────
export async function POST(request) {
  try {
    const { suggestedImage, platform, pillar, postId, sceneDescription, productName: passedProductName } = await request.json();

    console.log('Vial pipeline started:', { suggestedImage, platform, postId });

    // 1. Parse text to put on vial
    const parsed = parseVialText(suggestedImage || '');
    const productName = passedProductName || parsed.productName;
    const subtitle = parsed.subtitle;
    console.log('Vial text:', { productName, subtitle });

    // 2. Fetch the blank vial
    const vialResponse = await fetch(BLANK_VIAL_URL);
    const vialBuffer = Buffer.from(await vialResponse.arrayBuffer());

    // 3. Skip background removal — source PNGs already have alpha transparency
    const transparentVial = vialBuffer;
    console.log('Using native alpha transparency from source PNG');

    // 4. Add text overlay to vial label
    const labeledVial = await addTextToVial(transparentVial, productName, subtitle);
    console.log('Text overlaid on vial');

    // 5. Generate background scene with Grok
    const scenePrompt = sceneDescription || suggestedImage || `Premium clinical laboratory setting with volumetric blue-green lighting for ${pillar || 'lifestyle'} content`;
    const bgBuffer = await generateBackground(scenePrompt, platform || 'instagram');
    console.log('Background generated by Grok');

    // 6. Composite vial onto background
    const compositedBuffer = await compositeVialOnBackground(bgBuffer, labeledVial, platform);
    console.log('Vial composited onto background');

    // 7. Skip logo — the blank vial already has the ELEO logo baked in
    const finalBuffer = compositedBuffer;
    console.log('Skipping logo overlay — vial has built-in ELEO logo');

    // 8. Upload to Supabase
    const filename = `posts/${postId}_vial_branded.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('upsurge-assets')
      .upload(filename, finalBuffer, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from('upsurge-assets')
      .getPublicUrl(filename);

    // 9. Update post record
    await supabaseAdmin
      .from('upsurge_posts')
      .update({ image_url: urlData.publicUrl, image_type: 'image', updated_at: new Date().toISOString() })
      .eq('id', postId);

    return NextResponse.json({
      permanentUrl: urlData.publicUrl,
      pipeline: 'vial-composite',
      vialText: { productName, subtitle },
    });
  } catch (e) {
    console.error('Vial pipeline error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}