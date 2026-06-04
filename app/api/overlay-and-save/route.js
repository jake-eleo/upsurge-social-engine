import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '../../../lib/supabase-admin';

// UpSurge logo used as the overlay watermark fallback.
// TODO: update this to your uploaded logo in the upsurge-assets Supabase bucket
// (e.g. https://<project>.supabase.co/storage/v1/object/public/upsurge-assets/brand-assets/<file>.png).
// For now it points at the live upsurgesupps.com logo.
const UPSURGE_LOGO_URL = 'https://upsurgesupps.com/cdn/shop/files/UpSurge_Supp_Logo_small_background_7628e0a2-c5f5-4bad-a70c-62c6d570f944.png';


// ── Analyze a corner region for brightness + complexity ───────────
// Returns { brightness: 0-255, complexity: 0-1, score: 0-1 }
// Lower score = better placement (dark + simple)
async function analyzeCorner(imageBuffer, region) {
  const { left, top, width, height } = region;
  const cornerBuffer = await sharp(imageBuffer)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = cornerBuffer;
  const channels = info.channels;
  const pixelCount = info.width * info.height;

  // Calculate average brightness
  let totalBrightness = 0;
  for (let i = 0; i < data.length; i += channels) {
    // Luminance formula: 0.299R + 0.587G + 0.114B
    totalBrightness += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  const avgBrightness = totalBrightness / pixelCount;

  // Calculate complexity (standard deviation of brightness = how "busy" the area is)
  let sumSquaredDiff = 0;
  for (let i = 0; i < data.length; i += channels) {
    const px = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    sumSquaredDiff += (px - avgBrightness) ** 2;
  }
  const stdDev = Math.sqrt(sumSquaredDiff / pixelCount);
  // Normalize: stdDev of 0 = perfectly uniform, 80+ = very busy
  const complexity = Math.min(stdDev / 80, 1);

  // Combined score: we want LOW brightness (dark) + LOW complexity (simple)
  // Weight brightness more heavily since dark backgrounds hide logos best
  const brightnessNorm = avgBrightness / 255;
  // Weight complexity MORE heavily — a dark but busy area (typography, anatomy) is worse than a mid-brightness but simple area
  const score = brightnessNorm * 0.4 + complexity * 0.6;

  return { brightness: avgBrightness, complexity, score };
}

// ── Find the best corner for logo placement ───────────────────────
async function findBestCorner(imageBuffer, imgWidth, imgHeight, logoW, logoH, padding) {
  // Sample regions slightly larger than the logo to check surrounding area
  // Sample a larger region so we correctly detect busy areas like anatomical overlays or typography
  const sampleW = Math.min(Math.round(logoW * 2.2), Math.round(imgWidth * 0.45));
  const sampleH = Math.min(Math.round(logoH * 2.2), Math.round(imgHeight * 0.45));

  const corners = [
    { name: 'top-left',     left: 0,                      top: 0,                       logoLeft: padding,                  logoTop: padding },
    { name: 'top-right',    left: imgWidth - sampleW,     top: 0,                       logoLeft: imgWidth - logoW - padding, logoTop: padding },
  ];

  let bestCorner = corners[1]; // default: top-right
  let bestScore = Infinity;

  for (const corner of corners) {
    try {
      const analysis = await analyzeCorner(imageBuffer, {
        left: Math.max(0, corner.left),
        top: Math.max(0, corner.top),
        width: Math.min(sampleW, imgWidth - Math.max(0, corner.left)),
        height: Math.min(sampleH, imgHeight - Math.max(0, corner.top)),
      });
      corner.analysis = analysis;

      if (analysis.score < bestScore) {
        bestScore = analysis.score;
        bestCorner = corner;
      }
    } catch (e) {
      console.warn(`Corner analysis failed for ${corner.name}:`, e.message);
      corner.analysis = { brightness: 128, complexity: 0.5, score: 0.5 };
    }
  }

  console.log('Corner analysis:', corners.map(c => `${c.name}: brightness=${c.analysis.brightness.toFixed(0)} complexity=${c.analysis.complexity.toFixed(2)} score=${c.analysis.score.toFixed(2)}`).join(' | '));
  console.log('Best corner:', bestCorner.name, 'score:', bestScore.toFixed(2));

  return bestCorner;
}

// ── Tint logo for dark or light backgrounds ───────────────────────
// If background is light (brightness > threshold), darken the logo
// If background is dark, keep the logo as-is (assumes logo is light/gradient)
async function adaptLogoForBackground(logoBuffer, backgroundBrightness) {
  // Light background (> 160): tint logo darker so it's visible
  if (backgroundBrightness > 160) {
    return await sharp(logoBuffer)
      .modulate({ brightness: 0.6 }) // darken
      .toBuffer();
  }
  // Medium background (100-160): slight darken for safety
  if (backgroundBrightness > 100) {
    return await sharp(logoBuffer)
      .modulate({ brightness: 0.85 })
      .toBuffer();
  }
  // Dark background: logo is fine as-is
  return logoBuffer;
}

export async function POST(request) {
  try {
    const { imageUrl, postId, logoUrl: requestLogoUrl } = await request.json();
    const logoUrl = requestLogoUrl || UPSURGE_LOGO_URL;

    const imageResponse = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    const logoResponse = await fetch(logoUrl);
    const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());

    const imageMetadata = await sharp(imageBuffer).metadata();
    const imgWidth = imageMetadata.width || 1080;
    const imgHeight = imageMetadata.height || 1080;

    const logoSize = Math.round(imgWidth * 0.1);
    // Remove black background from logo (make dark pixels transparent)
    const rawLogo = await sharp(logoBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = rawLogo;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // If pixel is dark (close to black), make it transparent
      if (r < 30 && g < 30 && b < 40) {
        data[i + 3] = 0; // alpha = 0
      }
    }

    const transparentLogo = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
      .png()
      .toBuffer();

    // Resize the logo
    const sizedLogo = await sharp(transparentLogo)
      .resize(logoSize, logoSize, { fit: 'inside' })
      .png()
      .toBuffer();

    // Apply 50% opacity to the logo so it reads as a subtle watermark
    const { data: logoPixels, info: logoInfo } = await sharp(sizedLogo)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let i = 3; i < logoPixels.length; i += 4) {
      // Multiply existing alpha by 0.5 — preserves transparent areas, halves opaque pixels
      logoPixels[i] = Math.round(logoPixels[i] * 0.4);
    }

    const resizedLogo = await sharp(logoPixels, {
      raw: { width: logoInfo.width, height: logoInfo.height, channels: 4 }
    })
      .png()
      .toBuffer();

    const logoMeta = await sharp(resizedLogo).metadata();
    const logoW = logoMeta.width || logoSize;
    const logoH = logoMeta.height || logoSize;

    const padding = Math.round(imgWidth * 0.03);

    // ── Smart corner detection ──
    const bestCorner = await findBestCorner(imageBuffer, imgWidth, imgHeight, logoW, logoH, padding);

    // ── Adapt logo brightness for background ──
    const adaptedLogo = await adaptLogoForBackground(resizedLogo, bestCorner.analysis.brightness);

    const result = await sharp(imageBuffer)
      .composite([
        {
          input: adaptedLogo,
          left: bestCorner.logoLeft,
          top: bestCorner.logoTop,
          blend: 'over',
        },
      ])
      .jpeg({ quality: 95 })
      .toBuffer();
      
    const filename = `posts/${postId}_branded.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('upsurge-assets')
      .upload(filename, result, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from('upsurge-assets')
      .getPublicUrl(filename);

    await supabaseAdmin
      .from('upsurge_posts')
      .update({ image_url: urlData.publicUrl, image_type: 'image', updated_at: new Date().toISOString() })
      .eq('id', postId);

    return NextResponse.json({
      permanentUrl: urlData.publicUrl,
      logoPlacement: bestCorner.name,
      backgroundBrightness: Math.round(bestCorner.analysis.brightness),
    });
  } catch (e) {
    console.error('Overlay and save error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}