import { NextResponse } from 'next/server';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import * as opentypeNS from 'opentype.js';
import { supabaseAdmin } from '../../../lib/supabase-admin';

// opentype.js interop: Turbopack sees named exports, Node ESM nests them under
// .default. This resolves the function object in both.
const opentype = opentypeNS.default || opentypeNS;

const XAI_API_KEY = process.env.XAI_API_KEY;
// UpSurge logo for the reel cover overlay. TODO: swap to your uploaded logo in the
// upsurge-assets bucket once it exists; for now uses the live upsurgesupps.com logo.
const DEFAULT_LOGO_URL =
  'https://upsurgesupps.com/cdn/shop/files/UpSurge_Supp_Logo_small_background_7628e0a2-c5f5-4bad-a70c-62c6d570f944.png';

// Bundled font, loaded once. We render text as VECTOR PATHS (not <text> with a
// font-family) so it doesn't depend on fonts being installed on the host —
// Vercel's Linux runtime has none, which renders system-font text as boxes.
let FONT = null;
function getFont() {
  if (!FONT) {
    const buf = fs.readFileSync(path.join(process.cwd(), 'assets', 'fonts', 'Poppins-Bold.ttf'));
    // opentype.parse needs an ArrayBuffer; slice to the exact view the Buffer wraps.
    FONT = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return FONT;
}
// Convert a string to centered SVG path data at a given baseline.
function textToPath(font, text, centerX, baselineY, fontSize) {
  const w = font.getAdvanceWidth(text, fontSize);
  return font.getPath(text, centerX - w / 2, baselineY, fontSize).toPathData(1);
}

// ── Build a subject-themed, ON-BRAND, TEXT-FREE background prompt ──
// We overlay the logo + hook + URL ourselves, so the generated image must
// contain NO text/letters/logos of its own.
function buildCoverBackgroundPrompt({ hook, suggestedImage, pillar }) {
  const subject = [suggestedImage, hook].filter(Boolean).join('. ').slice(0, 400);
  const pillarMood = {
    education: 'ingredient science made beautiful — clean macro shots of supplement powder/capsules/ingredients, modern fitness-brand infographic feel',
    social_proof: 'a fit, healthy adult (man or woman) in their element at golden hour — sharp, confident, energetic, cinematic warm-cool contrast',
    lifestyle: 'the training life — gym energy, motion, sweat, early-morning runs, fueling up, cinematic volumetric light, aspirational',
    offer: 'premium supplement product hero — studio-grade lighting, energetic glow, bold and inviting',
  }[pillar] || 'premium fitness-supplement brand campaign, cinematic and aspirational';

  return `Vertical 9:16 cinematic background image for a social media reel cover. Subject/theme: ${subject || pillarMood}.
Mood: ${pillarMood}.
UpSurge brand look: near-black #0A0A14 / deep charcoal #141420 base, electric-aqua #5EEBEB to vivid-violet #C983F3 accent gradient, clean whites. Premium, energetic, high-end fitness-supplement brand campaign.
Composition: leave the vertical center comparatively clean/uncluttered and slightly darker so overlaid text stays readable; visual interest toward the edges and lower third.
Technical: 8K photorealistic, shot on Phase One, 85mm, shallow depth of field, three-point cinematic lighting, rich shadow detail.
CRITICAL — ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO typography, NO captions, NO logos, NO watermarks, NO signage anywhere in the image. A purely visual background only.
Forbidden: clinical/hospital/medical imagery, prescription framing, muddy tones, generic stock teal, any "Research Use Only"/lab/hazard labels.`;
}

// ── Generate the background via Grok and return a Buffer ──
async function generateBackground(prompt) {
  const res = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${XAI_API_KEY}` },
    body: JSON.stringify({ model: 'grok-imagine-image-pro', prompt, n: 1 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok background failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  const url = data?.data?.[0]?.url;
  const b64 = data?.data?.[0]?.b64_json;
  if (url) {
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error(`Background download failed: ${imgRes.status}`);
    return Buffer.from(await imgRes.arrayBuffer());
  }
  if (b64) return Buffer.from(b64, 'base64');
  throw new Error('Grok returned no image');
}

// ── Logo with its black background knocked out to transparent ──
async function loadTransparentLogo(logoUrl) {
  const res = await fetch(logoUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r < 30 && g < 30 && b < 40) data[i + 3] = 0; // dark → transparent
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// ── Word-wrap the hook (measured with the real font) and pick a fitting size ──
function layoutHook(hook, usableWidth, maxTextHeight) {
  const font = getFont();
  const words = String(hook || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [], fontSize: 0, lineHeight: 0 };

  const wrapAt = (fontSize) => {
    const lines = [];
    let cur = '';
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (font.getAdvanceWidth(cand, fontSize) <= usableWidth) cur = cand;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const candidates = [96, 88, 80, 72, 64, 56, 50, 44];
  for (const fontSize of candidates) {
    const lines = wrapAt(fontSize);
    const lineHeight = Math.round(fontSize * 1.18);
    const tooWide = lines.some(l => font.getAdvanceWidth(l, fontSize) > usableWidth);
    if (!tooWide && lines.length * lineHeight <= maxTextHeight && lines.length <= 6) {
      return { lines, fontSize, lineHeight };
    }
  }
  const fontSize = 44;
  return { lines: wrapAt(fontSize).slice(0, 7), fontSize, lineHeight: Math.round(fontSize * 1.18) };
}

// ── Build the full-canvas SVG: scrim gradient + hook + upsurgesupps.com (as paths) ──
function buildOverlaySvg({ W, H, hook }) {
  const font = getFont();
  const sidePad = Math.round(W * 0.075);
  const usableWidth = W - sidePad * 2;
  const { lines, fontSize, lineHeight } = layoutHook(hook, usableWidth, Math.round(H * 0.5));

  // Vertically center the hook block, biased slightly above center.
  const blockHeight = lines.length * lineHeight;
  const centerY = Math.round(H * 0.52);
  const firstBaseline = Math.round(centerY - blockHeight / 2 + fontSize * 0.82);
  const hookPaths = lines
    .map((line, i) => `<path d="${textToPath(font, line, W / 2, firstBaseline + i * lineHeight, fontSize)}"/>`)
    .join('');

  const urlFont = Math.round(W * 0.040);
  const urlBaseline = H - Math.round(H * 0.045);
  const urlPath = `<path d="${textToPath(font, 'upsurgesupps.com', W / 2, urlBaseline, urlFont)}"/>`;

  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0.78"/>
      <stop offset="22%"  stop-color="#000000" stop-opacity="0.34"/>
      <stop offset="50%"  stop-color="#000000" stop-opacity="0.42"/>
      <stop offset="78%"  stop-color="#000000" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000000" flood-opacity="0.85"/>
    </filter>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#5EEBEB"/>
      <stop offset="100%" stop-color="#C983F3"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#scrim)"/>
  <g fill="#FFFFFF" filter="url(#textShadow)">${hookPaths}</g>
  <rect x="${W / 2 - Math.round(W * 0.07)}" y="${urlBaseline - urlFont - Math.round(H * 0.020)}"
        width="${Math.round(W * 0.14)}" height="4" rx="2" fill="url(#accent)"/>
  <g fill="#FFFFFF" filter="url(#textShadow)">${urlPath}</g>
</svg>`);
}

export async function POST(request) {
  if (!XAI_API_KEY) {
    return NextResponse.json({ error: 'XAI_API_KEY not set' }, { status: 500 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { postId, hook, suggestedImage, pillar, logoUrl } = body || {};
  if (!postId) return NextResponse.json({ error: 'postId is required' }, { status: 400 });
  if (!hook || !String(hook).trim()) {
    return NextResponse.json({ error: 'A hook line is required to build a cover.' }, { status: 400 });
  }

  // Reel covers are vertical 9:16.
  const W = 1080;
  const H = 1920;

  try {
    // 1. Subject-themed background
    const bgPrompt = buildCoverBackgroundPrompt({ hook, suggestedImage, pillar });
    const bgBuffer = await generateBackground(bgPrompt);

    // 2. Cover-crop background to the canvas
    const base = await sharp(bgBuffer).resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer();

    // 3. Logo (top center)
    let logoComposite = [];
    try {
      const transparentLogo = await loadTransparentLogo(logoUrl || DEFAULT_LOGO_URL);
      const logoW = Math.round(W * 0.42);
      const sizedLogo = await sharp(transparentLogo).resize(logoW, logoW, { fit: 'inside' }).png().toBuffer();
      const logoMeta = await sharp(sizedLogo).metadata();
      logoComposite.push({
        input: sizedLogo,
        top: Math.round(H * 0.07),
        left: Math.round((W - (logoMeta.width || logoW)) / 2),
        blend: 'over',
      });
    } catch (e) {
      console.warn('🖼 Cover logo failed, continuing without logo:', e.message);
    }

    // 4. Text overlay (scrim + hook + upsurgesupps.com)
    const overlaySvg = buildOverlaySvg({ W, H, hook });

    const result = await sharp(base)
      .composite([
        { input: overlaySvg, top: 0, left: 0 },
        ...logoComposite,
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    // 5. Upload (timestamped so regenerations bust the CDN cache)
    const storagePath = `posts/${postId}_cover_${Date.now()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('upsurge-assets')
      .upload(storagePath, result, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage.from('upsurge-assets').getPublicUrl(storagePath);
    const coverUrl = urlData?.publicUrl;

    // 6. Persist on the post
    const { error: updateError } = await supabaseAdmin
      .from('upsurge_posts')
      .update({ cover_url: coverUrl, updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (updateError) console.error('🖼 cover_url update failed:', updateError.message);

    console.log('🖼 Cover generated for post', postId, '→', coverUrl);
    return NextResponse.json({ coverUrl });
  } catch (e) {
    console.error('generate-cover error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
