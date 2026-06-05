// ================================================================
// UpSurge Social Media Engine — Production Ready
// (Cloned & rebranded from the ELEO Social Engine. Brand-specific values
//  live in ../brand.config.js — edit that file to rebrand again.)
//
// Stack: React + Anthropic Claude API + xAI Grok Imagine Pro (video via Grok)
// Scheduling: STUBBED (local only) — see scheduleToGHL() + /api/schedule-ghl/route.js
//
// BAKED IN:
//   1. Post persistence — Supabase upsert on every change
//   2. Auth — Supabase Auth (see IMPLEMENTATION_GUIDE Step 8)
//   3. Image URL persistence — /api/save-image route (see guide Step 4d)
//   4. GHL Social Account ID mapping — see /api/schedule-ghl/route.js
//   5. Sequential image queue — generates one at a time, no rate limit hits
//   6. Image-to-image — passes actual ELEO brand assets as reference to Grok
//   7. Mobile responsive — list view on small screens, calendar on desktop
//   8. Bulk image generation — "Generate All Images" button in drafts queue
//   9. Post variations — generate 3 hook variants per post, pick the best
//  10. Analytics dashboard — performance by platform, pillar, format + trends
//  11. Optimal post time — auto-assigns platform best-time when post is created
// ================================================================

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { supabase } from '../lib/supabase';
import StyleReplicator from './StyleReplicator';
import { BRAND } from '../brand.config';

// Brand accent gradients (derived from brand.config.js — change colors there to rebrand)
const BRAND_GRADIENT   = BRAND.colors.gradient;   // linear-gradient(135deg, primary, secondary)
const BRAND_GRADIENT_H = BRAND.colors.gradientH;  // linear-gradient(90deg, primary, secondary)

// ── Config ────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#E1306C" },
  { id: "facebook",  label: "Facebook",  color: "#1877F2" },
  { id: "linkedin",  label: "LinkedIn",  color: "#0A66C2" },
  { id: "tiktok",    label: "TikTok",    color: "#69C9D0" },
];

const PILLARS = [
  { id: "education",    label: "Education",    color: "#3B82F6" },
  { id: "social_proof", label: "Social Proof", color: "#10B981" },
  { id: "lifestyle",    label: "Lifestyle",    color: "#8B5CF6" },
  { id: "offer",        label: "Offer",        color: "#F59E0B" },
];

const STATUSES = {
  draft:     { label: "Draft",     color: "#6B7280" },
  pending:   { label: "AI Draft",  color: "#F59E0B" },
  scheduled: { label: "Scheduled", color: "#3B82F6" },
  posted:    { label: "Posted",    color: "#10B981" },
  rejected:  { label: "Rejected",  color: "#EF4444" },
};

const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

const XAI_VIDEO_MODEL = "grok-imagine-video";

// ── Optimal posting times per platform (EST) ─────────────────────
// Research-backed best times for health/wellness men's content
const PLATFORM_BEST_TIMES = {
  instagram: { hour: 8,  minute: 0,  label: "8:00 AM" },  // Tue–Fri morning scroll
  facebook:  { hour: 9,  minute: 30, label: "9:30 AM" },  // Tue–Thu morning
  linkedin:  { hour: 8,  minute: 0,  label: "8:00 AM" },  // Tue–Thu pre-work commute
  tiktok:    { hour: 19, minute: 0,  label: "7:00 PM" },  // Daily evening browse
};

function applyOptimalTime(date, platform) {
  const t = PLATFORM_BEST_TIMES[platform] || { hour: 9, minute: 0 };
  const d = new Date(date);
  d.setHours(t.hour, t.minute, 0, 0);
  return d;
}

// ── Style tokens ──────────────────────────────────────────────────
// Style tokens pull accent/surface colors from brand.config.js. Status colors
// (accent=amber, green, red) stay fixed — they signal post state, not brand.
const T = {
  bg:BRAND.colors.bg, surf:BRAND.colors.surface, surf2:BRAND.colors.surface2,
  border:BRAND.colors.border, text:BRAND.colors.text, muted:BRAND.colors.muted, accent:"#F59E0B",
  green:"#10B981", red:"#EF4444", blue:BRAND.colors.primary,
};

// ── Helpers ───────────────────────────────────────────────────────
const daysInMonth    = (y,m) => new Date(y,m+1,0).getDate();
const firstDayOfMonth= (y,m) => new Date(y,m,1).getDay();
const pillarOf  = id => PILLARS.find(p=>p.id===id)   || PILLARS[0];
const platformOf= id => PLATFORMS.find(p=>p.id===id) || PLATFORMS[0];
const uid       = ()  => `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const lbl = { display:"block", fontSize:11, fontWeight:700, color:"#8888AA", marginBottom:7, textTransform:"uppercase", letterSpacing:"0.06em" };
const chipStyle = (active,color) => ({ padding:"5px 11px", borderRadius:6, border:`1px solid ${active?color:T.border}`, background:active?`${color}22`:"transparent", color:active?color:T.muted, cursor:"pointer", fontSize:12, fontWeight:500, transition:"all 0.12s" });
const badge = (color,label) => <span style={{background:`${color}22`,color,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap"}}>{label}</span>;

// (HeyGen avatar options removed — video is generated by Grok, not HeyGen.)

// NOTE: UpSurge is a unisex brand. The legacy male/female content detection and
// dual color palette have been removed — all imagery uses the single UpSurge
// palette and gender-neutral subjects (fit, healthy adults — men or women).

// ── Mobile detection hook ─────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// ── Brand Config ──────────────────────────────────────────────────
// NOTE: keys kept stable (doctorName/clinicTagline/activeProtocols) so the
// Supabase columns and existing code don't break — but they're repurposed for
// UpSurge (no doctor persona). clinicTagline = brand tagline, activeProtocols =
// featured product categories, doctorName = optional brand-voice note (blank).
const DEFAULT_BRAND_CONFIG = {
  primaryOffer:    "Free shipping on orders over $100",
  primaryCTA:      `Shop now at ${BRAND.identity.shopUrl}`,
  currentPromo:    "",
  bookingLink:     BRAND.identity.shopUrl,
  activeProtocols: BRAND.productCategories.join(", "),
  targetCity:      "",
  doctorName:      "",
  clinicTagline:   BRAND.identity.tagline,
};

// ── Brand Asset Library ───────────────────────────────────────────
// Jake: after Step 5c, replace localPath with Supabase Storage URLs
// Brand assets are now loaded dynamically from Supabase
let BRAND_ASSETS = [];

// NOTE: image-to-image now passes the asset's public URL straight to the xAI
// image-edits endpoint (see callGenerateImage / /api/generate-image), so the old
// base64 loader is no longer needed.

// ─────────────────────────────────────────────────────────────────
// UPSURGE VISUAL IDENTITY PROMPT SYSTEM
// (accent colors pulled from brand.config.js — single unisex palette)
// ─────────────────────────────────────────────────────────────────

const UPSURGE_BRAND_COLORS = `
UpSurge brand colors (use precisely):
- Primary background: Near-black ${BRAND.colors.bg}, deep charcoal #141420
- Accent gradient: Electric aqua ${BRAND.colors.primary} flowing into vivid violet ${BRAND.colors.secondary}
- White: Pure clean white #FFFFFF for text and highlights
- Energetic, modern, premium fitness-brand palette — bright and high-contrast
- Forbidden: muddy/dull tones, warm yellow-green, generic stock teal`;

const PLATFORM_COMPOSITION = {
  instagram: `Square 1:1 format (1080×1080px). Bold, immediate visual impact — must stop the scroll at thumbnail size. 30% bottom reserved for caption overlay zone.`,
  facebook:  `Landscape 1.91:1 (1200×628px). Horizontal visual storytelling. Rule of thirds composition. Cinematic wide-format feel.`,
  linkedin:  `Square 1:1 (1200×1200px). Professional editorial magazine aesthetic. Clean geometric layouts. Powerful but boardroom-appropriate.`,
  tiktok:    `Vertical 9:16 (1080×1920px). Subject fills center 60%. Dynamic, energetic. Eye-catching from the very first frame.`,
};

const PILLAR_VISUAL_LANGUAGE = {
  education: `Ingredient science made beautiful. Clean, modern infographic energy — show how a formula works: ingredient close-ups (powders, capsules, botanicals), macro shots of scoops and supplement texture, simple benefit callouts. Bright, high-contrast, premium fitness-brand look with energetic aqua-to-violet accents. Credible but never clinical.`,
  social_proof: `Authentic results energy. Real, fit, healthy people (men and women) mid-workout or post-workout — sharp focus, confident posture, genuine energy. Five-star review / testimonial card aesthetic. Warm gym light with cool UpSurge accent in the shadows. Relatable, aspirational, trustworthy.`,
  lifestyle: `The life that training fuels. Gym sessions, early-morning runs, lifting, post-workout recovery, fueling up for the day. Dynamic, energetic, aspirational — sweat, motion, daylight. Cinematic lens flare and rim lighting. 'This is how you show up.' Fit, healthy adults of any gender.`,
  offer: `Clarity and urgency. UpSurge product (tub/bottle/container) in premium studio product photography — hero-lit, label crisp, energetic glow. Bundles, sales, free shipping. Studio-quality product lighting. 'This is what you grab next.' Direct, confident, premium supplement brand.`,
};

const QUALITY_PARAMETERS = `
Technical specifications:
- Resolution: 8K photorealistic render quality
- Camera: Shot on Phase One XF IQ4 150MP, 85mm f/1.4 prime, ultra-shallow depth of field
- Lighting: Three-point cinematic setup, volumetric atmosphere, rich shadow detail
- Color grade: UpSurge palette — deep black, clean white, aqua-to-violet gradient accents
- Sharpness: Tack-sharp primary subject, progressive falloff to background
- Detail level: Hyperdetailed — skin texture, fabric weave, product/material surfaces
- Output feel: Premium fitness-supplement brand campaign — energetic, modern, scroll-stopping`;

// Every UpSurge product shown is a DIETARY SUPPLEMENT (preworkout, fat burner,
// BCAAs, nootropic, etc.) — not a drug, not a prescription, not a lab chemical.
// Inject this everywhere a product label can be rendered to keep imagery on-brand
// and compliant with supplement labeling norms.
const SUPPLEMENT_LABEL_DIRECTIVE = `PRODUCT LABEL DIRECTIVE (MANDATORY — applies to ANY tub, bottle, jar, pouch, scoop, capsule, or packaging in the image):
- All UpSurge products are DIETARY SUPPLEMENTS in modern fitness packaging (e.g. a powder tub with a scoop, a capsule bottle, or a pouch). They are NOT drugs, NOT prescription medications, NOT research chemicals, NOT lab reagents.
- Labels may show: the product name, the UpSurge brand mark, a "Dietary Supplement" line, flavor, net weight or serving count, and a clean modern supplement-facts-style panel. USA-made / GMP-certified style trust marks are fine.
- ABSOLUTELY FORBIDDEN text or marks on labels, caps, packaging, or anywhere in the image: "Rx Only", "Prescription Only", any drug/pharmacy framing, "Research Use Only", "RUO", "Not For Human Use", "Lab Use Only", "For In Vitro Use", "Reagent", any biohazard symbol, any skull-and-crossbones symbol, any orange/yellow hazard stripes, and any disease-treatment claims (e.g. "cures", "treats").
- If any label text would otherwise read like a drug or research-chemical disclaimer, replace it with "Dietary Supplement" or omit the regulatory text entirely. When in doubt, leave the label clean.`;

function buildImagePrompt(platform, pillar, suggestedImageGuidance, assetId, brandConfig, hookText, fullContext, caption) {
  const asset = BRAND_ASSETS.find(a => a.id === assetId);
  const platformComp = PLATFORM_COMPOSITION[platform] || PLATFORM_COMPOSITION.instagram;
  const sceneGuidance = suggestedImageGuidance
    ? suggestedImageGuidance.replace(/^[A-Z_0-9-]+\s*/i, '').replace(/^\+?\s*/, '').trim()
    : '';
  const cleanHook = hookText || '';

  // Single unisex UpSurge palette + accents (no gender branching).
  const colorPalette = UPSURGE_BRAND_COLORS;
  const accentGlow = `${BRAND.colors.secondary} violet`;
  const primaryAccent = `${BRAND.colors.primary} aqua`;
  const subjectGuidance = 'Show fit, healthy, energetic adults — men or women, both welcome. Athletic, motivated, real. No clinical or medical framing.';

  // ── PILLAR-SPECIFIC STYLE DIRECTION (single unisex palette) ──
  let pillarStyle = '';
  let compositionRules = '';

  if (pillar === 'education') {
    pillarStyle = `EDUCATION STYLE — ingredient science / how-it-works visual:
- Clean, modern, high-contrast composition that explains a benefit or how a formula works
- HERO options: macro shot of the supplement (powder, scoop, capsules, botanical ingredients) OR a fit, healthy adult (man or woman) mid-action with simple benefit callouts
- Bright studio or gym lighting with ${primaryAccent} and ${accentGlow} accent glow
- Energetic, premium fitness-brand infographic feel — credible but never clinical
- Style reference: premium supplement brand meets modern fitness editorial`;

    compositionRules = `COMPOSITION:
- MASSIVE BOLD TYPOGRAPHY: hero headline in huge white or gradient sans-serif, stacked 2-3 lines, positioned upper-left or left third
- 3-5 benefit callouts with simple icons (↑ ↓) and short 2-3 word descriptors in the accent gradient
- Brand tagline bar at bottom: bold uppercase, accent-colored
- Clean and energetic — no medical/hospital imagery, no prescription framing, no clutter`;
  }
  else if (pillar === 'social_proof') {
    pillarStyle = `SOCIAL PROOF STYLE — customer review / real-results card:
- Dark grid-pattern background (subtle dot or line grid at 8% opacity)
- Clean white review card floating in center with generous padding
- 5-star rating in the accent color at top of the card
- Optional: a real, fit, healthy person (man or woman) post-workout softly lit in the background
- Authentic energy, maximum credibility
- Style reference: premium testimonial / review slide`;

    compositionRules = `COMPOSITION:
- Top-left: small "CUSTOMER REVIEW" or "REAL RESULTS" pill badge in accent color
- Center: white card with the quote in clean sans-serif, 16-20px body text
- Below quote: "— Verified UpSurge Customer" attribution in bold
- Bottom: small rounded pill with the website in thin outline
- Corner text (tiny white 10pt): "Individual results vary."`;
  }
  else if (pillar === 'lifestyle') {
    pillarStyle = `LIFESTYLE STYLE — cinematic training / energy photography:
- Dynamic scene: a fit, healthy adult (man or woman) training, lifting, running, or fueling up — gym, home gym, outdoor, or kitchen at golden hour
- Sweat, motion, daylight; energetic and aspirational
- Subject partially rim-lit with ${primaryAccent} accent
- Evokes "this is how training feels when you're fueled"
- Style reference: premium athletic brand campaign`;

    compositionRules = `COMPOSITION:
- Hook headline in bottom-left or centered lower third
- Typography: large clean geometric sans-serif, 2-3 lines
- Highlight one key word in ${accentGlow} for contrast
- Subtle dark gradient at bottom for text legibility`;
  }
  else { // offer
    // Extract 2-4 benefit keywords from the caption bullets/points (if any)
    const captionText = (caption || '').trim();
    const bulletLines = captionText
      .split(/[\n•●◦·\-]/)
      .map(s => s.trim())
      .filter(s => s.length > 2 && s.length < 60 && !/^(ready|shop|buy|grab|discover|join|visit|click|link|comment|dm|message)/i.test(s))
      .slice(0, 4);
    const extractedBenefits = bulletLines.length >= 2
      ? bulletLines.map(b => b.replace(/^(more|less|fewer|faster|better|stronger|cleaner)\s+/i, '').toUpperCase().substring(0, 28)).join(' | ')
      : '';

    pillarStyle = `OFFER STYLE — bold product hero:
- Giant UpSurge product ${asset ? `(${asset.name})` : '(supplement tub or bottle)'} center-frame, glowing, hero-lit
- Energy rings, particle effects, and light beams radiating from the product
- Deep dark background with ${primaryAccent} atmospheric glow
- Product label must be crisp, clear, and match the reference exactly
- Style reference: premium supplement ad meets energetic product reveal`;

    compositionRules = `COMPOSITION:
- MASSIVE HERO HEADLINE at top: render the provided hook text in huge bold uppercase, 2-color gradient (white fading to ${accentGlow}). Keep it to the EXACT hook provided — do NOT invent new headline text.
- Product dominates the right or center-right of the frame
- BENEFIT CALLOUTS on the left side — CRITICAL RULES:
  * Render ONLY 3 callouts maximum (fewer text = cleaner rendering)
  * Each callout: circular outline icon in ${accentGlow} + bold uppercase 1-3 word category ONLY (single line keeps text crisp)
  * Extract categories from these actual post benefits: ${extractedBenefits || 'use the hook topic as the theme and invent 3 tight 1-3 word categories related to it'}
  * Examples of good callout length: "CLEAN ENERGY" / "REAL PUMPS" / "FAST RECOVERY" / "SHARP FOCUS" / "FUEL THE BURN"
  * Examples of BAD callouts (too long, will render as gibberish): "Thermogenic metabolic acceleration pathways"
- Bottom rounded pill bar: short CTA in accent color (max 6 words, e.g. "Shop now at upsurgesupps.com")
- CRITICAL TEXT RULE: Every piece of rendered text must be CORRECTLY SPELLED and GRAMMATICALLY COMPLETE. No partial words, no made-up words, no truncated phrases. If a phrase doesn't fit cleanly, make it shorter — never render garbled text.`;
  }

  const subjectDescription = asset
    ? `PRIMARY PRODUCT (CRITICAL — MATCH THE REFERENCE IMAGE EXACTLY): ${asset.visualDescription}. You have been given a reference image of this exact product. Your output MUST show this EXACT item — same shape, same colors, same proportions, same label design. Do NOT substitute with a different product.${sceneGuidance ? `\nSCENE CONTEXT: ${sceneGuidance}` : ''}`
    : `PRIMARY SCENE: ${suggestedImageGuidance || `Premium fitness-supplement visual for ${pillar} content`}`;

  return `Create a premium, high-impact social media image for ${BRAND.identity.name} (${BRAND.identity.tagline}).

SUBJECT: ${subjectGuidance}

BRAND: ${BRAND.identity.name} — ${BRAND.identity.positioning}. ${BRAND.identity.trustSignals.join(', ')}. For fitness-focused adults 18+ (men and women) who want energy, recovery, fat loss, sharper focus, and overall health.

${subjectDescription}

PLATFORM & COMPOSITION: ${platformComp}

${pillarStyle}

${compositionRules}

${colorPalette}

${QUALITY_PARAMETERS}

${SUPPLEMENT_LABEL_DIRECTIVE}

TEXT HOOK OVERLAY: ${cleanHook ? `Render this exact hook text as the primary headline, styled according to the pillar composition rules above: "${cleanHook}"` : 'Use pillar-appropriate typography treatment.'}

BRAND INTEGRATION: UpSurge branding should appear naturally — on the product label in a ${primaryAccent}-to-${accentGlow} gradient, as subtle rim lighting, or in a bottom tagline bar. Do NOT render a separate logo graphic (overlay handles that).

ABSOLUTE PROHIBITIONS: No stock photography aesthetic. No clinical/hospital/medical imagery. No prescription or pharmacy framing. No "Dr." persona. No obvious AI tells. No text misspellings or garbled letters.

FINAL DIRECTIVE: This image must look like a $50,000 fitness-supplement brand campaign — energetic, premium, modern, scroll-stopping at thumbnail size.`;
}

function buildVideoPrompt(platform, pillar, suggestedImageGuidance, brandConfig) {
  const pillarVisual = PILLAR_VISUAL_LANGUAGE[pillar] || PILLAR_VISUAL_LANGUAGE.lifestyle;
  const platformAspect = platform === 'linkedin' || platform === 'facebook' ? '16:9' : '9:16';
  const context = suggestedImageGuidance || '';

  const assetId = extractAssetId(suggestedImageGuidance, context);
  const hasRefImage = !!assetId;
  const asset = hasRefImage ? BRAND_ASSETS.find(a => a.id === assetId) : null;
  const sceneGuidance = suggestedImageGuidance
    ? suggestedImageGuidance.replace(/^[A-Z_0-9-]+\s*/i, '').replace(/^\+?\s*/, '').trim()
    : '';

  const refImageDirection = hasRefImage && asset
    ? `\nREFERENCE IMAGE: You have been given a reference image (<IMAGE_1>) of "${asset.name}". Use it ONLY as a style and appearance guide for a single product appearing naturally in the scene. The reference shows ONE product — your video must show ONE product, matching the label and branding. Do NOT duplicate, mirror, or create multiple copies of the product. Do NOT use split-screen layouts. The product appears as a single object within a continuous scene.`
    : '';

  // Single unisex UpSurge accents (no gender branching).
  const primaryAccent = `${BRAND.colors.primary} aqua`;
  const accentGlow = `${BRAND.colors.secondary} violet`;

  // ── PILLAR-SPECIFIC OPENING VISUAL ──
  let openingVisual = '';

  if (pillar === 'education') {
    openingVisual = `OPENING FRAME (first 1-2 seconds): Energetic ingredient / how-it-works visual — macro shots of the supplement (powder swirling, a scoop pouring, capsules, botanical ingredients) OR a fit, healthy adult (man or woman) mid-action with motion and energy. Bright, high-contrast, with ${primaryAccent} and ${accentGlow} accent glow. This is the SCROLL-STOPPER frame — clean, modern, credible. As the video progresses, the camera pushes in or reveals the product/ingredient with dynamic energy. No clinical or medical imagery.`;
  } else if (pillar === 'social_proof') {
    openingVisual = `OPENING FRAME (first 1-2 seconds): Close-up of a fit, healthy adult (man or woman) at a moment of energy and focus — gym light, rim-lit with ${primaryAccent}. Confident, present, authentic. As the video progresses, slow cinematic push-in or subtle dolly.`;
  } else if (pillar === 'lifestyle') {
    openingVisual = `OPENING FRAME (first 1-2 seconds): Cinematic wide shot of a fit, healthy adult (man or woman) training — gym at golden hour, home workout, outdoor run, or fueling up in a bright kitchen. Dynamic, energetic lighting with ${primaryAccent} rim light. Shallow depth of field. Aspirational "this is how training feels when you're fueled" energy.`;
  } else { // offer
    openingVisual = `OPENING FRAME (first 1-2 seconds): Hero product shot — ${asset ? `the ${asset.name}` : 'a premium UpSurge product (tub or bottle)'} center-frame, glowing with ${primaryAccent} atmospheric light. Energy rings and particle effects radiate from the product. Dark background with starfield particles. Camera slowly orbits or pushes in on the product.`;
  }

  return `10-second cinematic ${pillar} video for ${BRAND.identity.name} (${BRAND.identity.tagline}).${refImageDirection}

SCENE: ${sceneGuidance || `${pillar} content`}

${openingVisual}

CAMERA: Slow cinematic push-in or orbit. Dramatic first 0.5s. Dynamic moment at 3-5s. Premium, never shaky.

ASPECT: ${platformAspect}. ONE continuous scene, ONE subject. No split-screen, no duplicated/mirrored products, no picture-in-picture, no stacked shots.

SUBJECT: Show fit, healthy, energetic adults — men or women, both welcome. Athletic, motivated, real. No clinical or medical framing.

COLOR: UpSurge palette — black ${BRAND.colors.bg}, clean white, ${primaryAccent} to ${accentGlow} accents. Three-point cinematic lighting. Shallow DOF.

AUDIO: Subtle ambient hum, premium atmospheric sound. No music with lyrics. No stock music.${hasRefImage ? ' Subtle product/scoop sounds if product shown.' : ''}

NO text, titles, captions, or typography in the video. No stock footage look, no jump cuts, no cheesy B-roll, no warm/yellow grading, no AI artifacts.

${SUPPLEMENT_LABEL_DIRECTIVE}

Photorealistic 24fps 720p. Must look like a premium fitness-brand commercial.`;
}
function buildCarouselPrompts(platform, pillar, post, brandConfig, slideContent) {
  const assetId = extractAssetId(post.suggestedImage, (post.caption||'') + ' ' + (post.hook||'') + ' ' + (post.suggestedImage||''));
  const asset = assetId ? BRAND_ASSETS.find(a => a.id === assetId) : null;
  const hook = post.hook || '';
  const caption = post.caption || '';

  // Prefer Claude-generated slide content (clean, short, designed for typography rendering)
  // Fall back to caption-split logic only if generation failed
  const sentences = caption
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 140)
    .filter(s => !/\d+mg\/ml|\d+\.\d+ml/i.test(s));
  const slide1Title = slideContent?.slide1?.title || '';
  const slide1Body = slideContent?.slide1?.body || sentences[0] || 'Key insight about this topic';
  const slide2Title = slideContent?.slide2?.title || '';
  const slide2Body = slideContent?.slide2?.body || sentences[1] || 'Why it matters for your training';
  const slide3Title = slideContent?.slide3?.title || '';
  const slide3Body = slideContent?.slide3?.body || sentences[2] || sentences[1] || 'What this means for your goals';
  // Keep point1/2/3 for legacy references elsewhere in the function
  const point1 = slide1Body;
  const point2 = slide2Body;
  const point3 = slide3Body;

  const brandBar = `At the very bottom of the image, include a solid bar with an aqua-to-violet gradient (${BRAND.colors.primary} to ${BRAND.colors.secondary}) spanning the full width with "UPSURGESUPPS.COM" in clean white uppercase text, centered.`;
  const colorPalette = `Background: near-black ${BRAND.colors.bg} to deep charcoal #141420. Accent gradient: electric aqua ${BRAND.colors.primary} flowing into vivid violet ${BRAND.colors.secondary}. Emphasis text: bright white #FFFFFF. Secondary emphasis: ${BRAND.colors.secondary} violet. All body text in white. Bright, high-contrast, energetic fitness-brand palette. FORBIDDEN: muddy/dull tones, generic stock teal.`;
  const accentGlow = `${BRAND.colors.secondary} violet`;
  const primaryAccent = `${BRAND.colors.primary} aqua`;
  const noLogo = `CRITICAL: DO NOT render any logo, brand name, letters "UPSURGE", "upsurge", logo mark, or any logo-like graphic anywhere in the image. DO NOT put any text, watermark, or graphic element in the top-left corner or top-right corner. Leave BOTH top corners completely EMPTY for at least 200px from each edge. The brand logo will be added as a post-processing overlay.`;

  const prompts = [];

  // ══════════════════════════════════════════════════════════
  // SLIDE 1: COVER — varies by pillar
  // ══════════════════════════════════════════════════════════
  let coverPrompt = '';

  if (pillar === 'education') {
    coverPrompt = `Create an ingredient-science carousel cover slide for ${BRAND.identity.name}. EDUCATION pillar — clean, modern, energetic fitness-brand infographic.

LAYOUT: Square 1:1 (1080×1080px).
${noLogo}

HERO VISUAL: A bold, high-contrast visual that explains a benefit or how a formula works — a macro shot of the supplement (powder swirling, a scoop pouring, capsules, or botanical ingredients) OR a fit, healthy adult (man or woman) mid-action. Bright studio or gym lighting. Energetic, premium, credible.

ACCENT GLOW: ${primaryAccent} and ${accentGlow} accents with energy particles around the hero element.

TEXT OVERLAY (CRITICAL): Render this exact hook as large bold typography: "${hook}"
Use clean white sans-serif with ONE key word highlighted in ${accentGlow}. Place typography upper-left or top-center so the hero element has breathing room.

${colorPalette}
${brandBar}

STYLE: Premium supplement brand meets modern fitness editorial. NO clinical/hospital/medical imagery, no prescription framing, no anatomical X-rays. Clean, energetic, scroll-stopping.`;
  }
  else if (pillar === 'social_proof') {
    coverPrompt = `Create a customer-review carousel cover slide for ${BRAND.identity.name}. SOCIAL PROOF pillar — authentic review-card style.

LAYOUT: Square 1:1 (1080×1080px). Dark background ${BRAND.colors.bg} with subtle grid pattern overlay (fine dot or line grid at 8% opacity).
${noLogo}

TOP-LEFT: Small pill-shaped badge in ${accentGlow} saying "CUSTOMER REVIEW" in bold white uppercase.

CENTER: Clean white rounded card floating in center with generous padding. Card contains:
- 5 gold/yellow stars at top
- Quote text in clean sans-serif (16-20px equivalent): "${hook || point1}"
- Large decorative quote mark watermark in light gray behind the text
- Attribution: "— Verified UpSurge Customer" in bold beneath the quote

${colorPalette}
${brandBar}

BOTTOM corner (tiny, white, 10pt): "Individual results vary."

STYLE: Clean, premium, credible. Like a top-tier review slide. Pure editorial design on dark grid background.`;
  }
  else if (pillar === 'lifestyle') {
    coverPrompt = `Create a cinematic lifestyle carousel cover slide for ${BRAND.identity.name}. LIFESTYLE pillar — energetic athletic editorial.

LAYOUT: Square 1:1 (1080×1080px).
${noLogo}

HERO VISUAL: Dramatic cinematic photograph of a fit, healthy adult (man or woman) training, lifting, running, or fueling up (gym, home gym, outdoor, or bright kitchen at golden hour). Sweat, motion, daylight. Shallow depth of field. Subject partially rim-lit with ${primaryAccent}. Aspirational — "this is how training feels when you're fueled."

TEXT OVERLAY (CRITICAL): Render this exact hook as large semi-bold typography: "${hook}"
Use clean white with ONE key word highlighted in ${accentGlow}.
TEXT PLACEMENT: Based on the composition — if the subject is off to one side, place text on the opposite side aligned left or right. If the scene is symmetric or the subject is centered, place text centered in the lower third. Always add a subtle dark gradient behind the text for legibility.

${colorPalette}
${brandBar}

STYLE: Premium athletic brand campaign. Energetic, aspirational, cinematic mood.`;
  }
  else { // offer
    coverPrompt = `Create a bold product-hero carousel cover slide for ${BRAND.identity.name}. OFFER pillar — bold maximalist product campaign style.

LAYOUT: Square 1:1 (1080×1080px).
${noLogo}

HERO VISUAL: ${asset ? `MASSIVE UpSurge product "${asset.name}" center-frame, hero-lit with ${primaryAccent} atmospheric glow. Label must match reference exactly. Energy rings and light beams radiating from the product. Particle effects. ` : 'A premium UpSurge product (tub or bottle) scene with dramatic lighting.'}
Deep dark background with ${primaryAccent} glow and starfield particles.

TEXT OVERLAY (CRITICAL):
MASSIVE HERO HEADLINE in huge bold uppercase white-to-${accentGlow} gradient: "${hook}"
Stack the text across 2 lines for impact.
TEXT PLACEMENT: If the product is centered in the frame, place the headline centered above it. If the product is off to one side, place the headline on the opposite side or centered at top. Use whichever placement creates the most balanced, intentional composition.

3 BENEFIT CALLOUTS down the left side, each with:
- Circular outline icon in ${accentGlow}
- Bold uppercase category label (2-3 words max)
- Short white descriptor beneath (3-5 words)
Extract the 3 main benefits from: "${point1}"

${colorPalette}
${brandBar}

${SUPPLEMENT_LABEL_DIRECTIVE}

STYLE: Premium supplement ad meets energetic product reveal. Scroll-stopping at thumbnail.`;
  }

  prompts.push(coverPrompt);

  // ══════════════════════════════════════════════════════════
  // SLIDES 2 & 3: INFO SLIDES — minimalist editorial (consistent across pillars)
  // ══════════════════════════════════════════════════════════
  [
    { num: '01', content: point1.substring(0, 120) },
    { num: '02', content: point2.substring(0, 120) },
  ].forEach(({ num, content }) => {
    prompts.push(`Create an informational carousel slide for ${BRAND.identity.name}. This is an info slide in a ${pillar} carousel.

LAYOUT: Square 1:1 (1080×1080px). Pure dark background ${BRAND.colors.bg}, minimal editorial.
${noLogo}
Top-right corner: small "SWIPE TO LEARN" text with arrow icon in ${accentGlow}.

LARGE NUMBER: Display "${num}" in the upper-right area in very large elegant sans-serif, white with slight transparency.

HORIZONTAL ACCENT LINE: Gradient line (${primaryAccent} to ${accentGlow}) spanning about 60% of the width, positioned above the main content area with a "+" symbol at the right end in ${accentGlow}.

TITLE: Bold, large, white uppercase sans-serif heading — 2-3 words that summarize this point.

BODY TEXT: 3-5 lines of clean white body text in justified sans-serif:
"${content}"

${colorPalette}
${brandBar}

STYLE: Clean editorial. NO images. NO photography. Pure text-on-dark design.`);
  });

  // ══════════════════════════════════════════════════════════
  // SLIDE 4: CONCLUSION / CTA
  // ══════════════════════════════════════════════════════════
  prompts.push(`Create a conclusion/CTA carousel slide for ${BRAND.identity.name}. Final slide of the carousel.

LAYOUT: Square 1:1 (1080×1080px). Pure dark background ${BRAND.colors.bg}, minimal editorial.
${noLogo}

LARGE NUMBER: Display "03" in upper-right area, large elegant font, white with slight transparency.

HORIZONTAL ACCENT LINE: Gradient line (${primaryAccent} to ${accentGlow}) with "+" symbol at right end.

TITLE: Bold, large, white uppercase sans-serif: "THE TAKEAWAY:"

BODY TEXT (render EXACTLY as written, 3 short paragraphs separated by line breaks):
Paragraph 1: "${slide3Title ? slide3Title + ': ' : ''}${slide3Body}"
Paragraph 2: "Fuel your training. Recover harder. Show up stronger."
Paragraph 3: "${brandConfig.primaryCTA}"

CRITICAL: Render the paragraph text EXACTLY as written above. Do NOT paraphrase, do NOT add words, do NOT change meaning. Every word readable and correctly spelled.

${colorPalette}
${brandBar}

STYLE: Clean, authoritative, final action step. NO images. Pure text-on-dark. Confident invitation.`);

  return prompts;
}
function extractAssetId(suggestedImage, fullContext) {
  if (!suggestedImage) return null;
  // Sort by ID length descending so longer/more specific IDs match first
  const sorted = [...BRAND_ASSETS].sort((a, b) => b.id.length - a.id.length);
  for (const asset of sorted) {
    if (suggestedImage.toUpperCase().includes(asset.id)) {
      // UpSurge is unisex — no gendered asset variants.
      return asset.id;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// API CALLS — all routed through /api/* routes in production
// Jake: update these URLs after completing Step 4h of the guide
// ─────────────────────────────────────────────────────────────────

// Product-free, text-free background scene for COMPOSITING a real product photo
// on top (used for offer/product-hero shots — pixel-exact product).
function buildProductBackgroundPrompt(platform, pillar, brandConfig) {
  const platformComp = PLATFORM_COMPOSITION[platform] || PLATFORM_COMPOSITION.instagram;
  return `Create a premium, TEXT-FREE product-hero BACKGROUND for ${BRAND.identity.name} (${BRAND.identity.tagline}) — a fitness supplements brand.

PURPOSE: A real product photo will be composited into the CENTER afterward, so:
- Leave the CENTER (roughly the middle 60%) relatively clean and uncluttered, with empty space for a product to sit.
- Show NO product, bottle, tub, jar, scoop, or container — the product is added later.
- Absolutely NO text, words, letters, numbers, logos, or watermarks anywhere in the image.

SCENE: Energetic, premium atmosphere — dramatic rim lighting, energy rings, light beams, and particle effects radiating from the center where the product will sit. Deep dark background with ${BRAND.colors.primary} aqua and ${BRAND.colors.secondary} violet atmospheric glow.

PLATFORM & COMPOSITION: ${platformComp}

${UPSURGE_BRAND_COLORS}

${QUALITY_PARAMETERS}

STYLE: Premium supplement-brand product-hero backdrop — energetic, modern, scroll-stopping. Like a high-end pre-workout campaign set, minus the product.`;
}

// Per-platform output aspect ratio for generated images. Carousels are always
// square. (Model + endpoint are chosen server-side in /api/generate-image.)
const IMAGE_ASPECT = { instagram: '1:1', linkedin: '1:1', facebook: '16:9', tiktok: '9:16' };

// Generate an image. Pass { referenceUrls: [publicUrl, ...] } to route through
// xAI's image-EDITS endpoint so Grok actually uses your real product photo(s),
// and { aspectRatio: '1:1' | '16:9' | '9:16' } to control output dimensions.
async function callGenerateImage(prompt, opts = {}) {
  const { referenceUrls = null, aspectRatio = null } = opts;
  const response = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      ...(aspectRatio && { aspectRatio }),
      ...(referenceUrls && referenceUrls.length > 0 && { referenceImageUrls: referenceUrls }),
    }),
  });
  if (!response.ok) throw new Error(`xAI Image API ${response.status}`);
  const data = await response.json();
  return data.data?.[0]?.url || data.data?.[0]?.b64_json || null;
}

async function callGenerateVideo(prompt, duration = 10, aspectRatio = '9:16') {
  const response = await fetch("/api/generate-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, duration, aspectRatio }),
  });
  if (!response.ok) throw new Error(`xAI Video API ${response.status}`);
  const data = await response.json();
  return data.data?.[0]?.url || null;
}

// ── Main creative orchestrator ────────────────────────────────────
async function generateCarouselSlideContent(post, brandConfig) {
  try {
    const response = await fetch("/api/generate-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `You are writing text for an Instagram carousel for ${BRAND.identity.name}, a fitness supplements brand. Generate clean, simple slide content that will be rendered as typography on dark backgrounds. The text must be short and punchy so it renders cleanly. Keep claims compliant (structure/function only — no disease or weight-loss guarantees).

POST CONTEXT:
Hook: "${post.hook || ''}"
Caption: "${post.caption || ''}"
Pillar: ${post.pillar}

Generate exactly 3 slides. Each slide has a TITLE (2-3 words, uppercase-ready, bold summary) and a BODY (1-2 short sentences, max 100 characters total, written for easy reading on screen).

Rules for BODY text:
- Max 100 characters total (not 100 per sentence)
- No dosage math (no "mg/ml", no decimals, no unit conversions)
- No complex jargon that might confuse typography rendering
- Write in plain, direct language
- Each body should be a complete thought that makes sense on its own

Slide 1 (info): The first key insight about the topic
Slide 2 (info): The supporting point or why it matters
Slide 3 (conclusion): The takeaway action or call to reflect

Respond ONLY with valid JSON, no markdown fences:
{
  "slide1": {"title": "...", "body": "..."},
  "slide2": {"title": "...", "body": "..."},
  "slide3": {"title": "...", "body": "..."}
}`
        }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.content?.[0]?.text || "{}";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.warn('Carousel slide content generation failed, falling back to caption split:', e.message);
    return null;
  }
}
async function generateCreative(post, brandConfig, passedAssets) {
  if (typeof window !== 'undefined' && window.__upsurgeAssets) BRAND_ASSETS = window.__upsurgeAssets;
  const { platform, pillar, suggestedImage, suggestedFormat } = post;
  console.log('generateCreative called, suggestedImage:', suggestedImage);
  console.log('BRAND_ASSETS:', BRAND_ASSETS.length, BRAND_ASSETS.map(a => a.id));
  const assetId = extractAssetId(suggestedImage, (post.caption||'') + ' ' + (post.hook||'') + ' ' + suggestedImage);
  console.log('extractAssetId result:', assetId);
  const isVideo = suggestedFormat === "reel" || suggestedFormat === "story_video";
 
  // ── Product assets go through the standard Grok pipeline with reference image ──
  // Pre-labeled UpSurge product images (Up-Fuel, ThermoSurge, etc.) are
  // uploaded as brand assets and sent to Grok as reference images automatically.
 
  // ── VIDEO: Grok enhanced pipeline → Grok standard fallback ──
  // HeyGen removed — video is hard-routed through Grok (BRAND.videoProvider === 'grok').
  if (isVideo) {
    const aspectRatio = (platform === 'linkedin' || platform === 'facebook') ? '16:9' : '9:16';
    const script = post.voiceoverScript || post.hook || post.caption?.substring(0, 200) || '';

    // ── PRIMARY PATH: Grok enhanced (buildVideoPrompt) → Grok standard ──
    const prompt = buildVideoPrompt(platform, pillar, suggestedImage, brandConfig);

    const refUrls = [];
    if (assetId) {
      const asset = BRAND_ASSETS.find(a => a.id === assetId);
      if (asset && asset.localPath) refUrls.push(asset.localPath);
    }

    try {
      console.log('🎬 Grok enhanced fallback:', { hasVoiceover: !!post.voiceoverScript, refImages: refUrls.length });
      const response = await fetch('/api/generate-video-enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          voiceoverScript: script,
          voiceId: 'leo',
          duration: 15,
          aspectRatio,
          resolution: '720p',
          referenceImageUrls: refUrls.length > 0 ? refUrls : undefined,
          postId: post.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('🎬 Grok enhanced complete:', data.pipeline, 'voiceover:', data.hasVoiceover);
        return { type: "video", url: data.permanentUrl, prompt, skipOverlay: true };
      } else {
        console.warn('Grok enhanced failed, falling back to standard:', response.status);
      }
    } catch (e) {
      console.warn('Grok enhanced error, falling back:', e.message);
    }

    const url = await callGenerateVideo(prompt, 10, aspectRatio);
    return { type: "video", url, prompt };
  } else if (suggestedFormat === "carousel") {
    // First, have Claude generate clean slide-specific content for each info slide
    console.log('🎨 Generating carousel slide content with Claude...');
    const slideContent = await generateCarouselSlideContent(post, brandConfig);
    console.log('🎨 Slide content:', slideContent);
    
    // Generate structured carousel: cover + info slides + CTA
    const carouselPrompts = buildCarouselPrompts(platform, pillar, post, brandConfig, slideContent);
    const urls = [];

    // Reference the real product photo (public URL) on the COVER slide only, via
    // the image-edits endpoint. Used for every pillar (including Education).
    const coverAsset = assetId ? BRAND_ASSETS.find(a => a.id === assetId) : null;
    const coverRefUrls = (coverAsset && coverAsset.localPath) ? [coverAsset.localPath] : null;

    for (let i = 0; i < carouselPrompts.length; i++) {
      const useRefs = i === 0 ? coverRefUrls : null;  // only the cover gets the product reference
      const url = await callGenerateImage(carouselPrompts[i], { referenceUrls: useRefs, aspectRatio: '1:1' });
      if (url) urls.push(url);
    }

    return { type: "carousel", url: urls[0], urls, prompt: `Carousel: ${carouselPrompts.length} slides` };
  } else {
    const hookText = post.hook || '';
    const fullContext = (suggestedImage || '') + ' ' + (post.caption || '') + ' ' + hookText;
    const asset = assetId ? BRAND_ASSETS.find(a => a.id === assetId) : null;
    const productUrl = (asset && asset.localPath) ? asset.localPath : null;
    const imgAspect = IMAGE_ASPECT[platform] || '1:1';   // per-platform dimensions

    // ── OPTIONAL product-hero COMPOSITE (BRAND.compositeProductHeroes) ──
    // Off by default: Offer posts use the full designed ad (headline + callouts)
    // via image-edits below. Flip the flag on for a clean, text-free product shot
    // with the real product PNG composited on top.
    if (pillar === 'offer' && productUrl && BRAND.compositeProductHeroes) {
      try {
        const bgPrompt = buildProductBackgroundPrompt(platform, pillar, brandConfig);
        const bgUrl = await callGenerateImage(bgPrompt, { aspectRatio: imgAspect }); // text-to-image, no product rendered
        if (bgUrl) {
          const compRes = await fetch('/api/composite-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backgroundUrl: bgUrl, productUrl, postId: post.id }),
          });
          if (compRes.ok) {
            const comp = await compRes.json();
            if (comp.url) {
              console.log('🖼 Composited real product photo onto generated background.');
              return { type: "image", url: comp.url, prompt: bgPrompt };
            }
          }
          console.warn('Composite failed; falling back to image-edits.');
        }
      } catch (e) {
        console.warn('Composite path error, falling back to image-edits:', e.message);
      }
    }

    // ── Any pillar with a product photo → IMAGE-EDITS (Grok uses the real photo) ──
    // Education included: it now references the product photo too.
    const prompt = buildImagePrompt(platform, pillar, suggestedImage, assetId, brandConfig, hookText, fullContext, post.caption);
    const refUrls = productUrl ? [productUrl] : null;
    console.log('About to call callGenerateImage, reference photo:', refUrls ? 'YES' : 'NO', '| aspect:', imgAspect);
    const url = await callGenerateImage(prompt, { referenceUrls: refUrls, aspectRatio: imgAspect });
    return { type: "image", url, prompt };
  }
}

// ── Claude API ────────────────────────────────────────────────────
function buildSystemPrompt(brandConfig, topPerformers, bottomPerformers) {
  const topExamples = topPerformers.length > 0
    ? `\n## TOP PERFORMING POSTS (replicate these patterns)\n${topPerformers.map((p,i)=>
        `${i+1}. [${platformOf(p.platform).label} | ${pillarOf(p.pillar).label} | Score: ${p.score}/5]\nCaption: "${p.caption}"`
      ).join("\n\n")}`
    : "";
  const bottomExamples = bottomPerformers.length > 0
    ? `\n## UNDERPERFORMING POSTS (avoid these patterns)\n${bottomPerformers.map((p,i)=>
        `${i+1}. [${platformOf(p.platform).label} | Score: ${p.score}/5]\nCaption: "${p.caption}"\n${p.rejectNote?`Rejected for: "${p.rejectNote}"`:""}` 
      ).join("\n\n")}`
    : "";

  return `You are ${BRAND.identity.name}'s social media content intelligence engine. You write scroll-stopping content for a fitness supplements e-commerce brand.

## BRAND
${BRAND.identity.name} (${BRAND.identity.shortName}) — ${BRAND.identity.tagline}. Positioning: ${BRAND.identity.positioning}.
Website: ${BRAND.identity.website} | Shop: ${BRAND.identity.shopUrl} | Support: ${BRAND.identity.supportEmail}
Trust signals (real — use them): ${BRAND.identity.trustSignals.join(', ')}.
This is a consumer fitness brand — NOT a clinic. There is NO doctor persona. Never use a "Dr." voice or clinical/prescription framing.

## CURRENT OFFER
Primary offer: ${brandConfig.primaryOffer}
CTA: "${brandConfig.primaryCTA}" | Link: ${brandConfig.bookingLink}
${brandConfig.currentPromo?`Promo: ${brandConfig.currentPromo}`:""}

## PRODUCTS (reference these by name; use the ingredients for credible, specific copy)
${BRAND.products.map(p => `- ${p.name} (${p.category}): ${p.does}${p.ingredients ? `\n    Key ingredients: ${p.ingredients}` : ''}`).join('\n')}
Categories: ${BRAND.productCategories.join(' | ')}
When citing ingredients, keep claims structure/function only (e.g. "supports", "promotes") — never disease or weight-loss guarantees.

## TARGET CUSTOMER
${BRAND.targetAudience}
Unisex — write for anyone who trains. Use "you", "athletes", "lifters", "anyone chasing a goal". Never lean male-only or female-only.

## VOICE (flex these four tones to fit the post)
${BRAND.voiceGuidance}
✓ Energetic ✓ Credible ✓ Confident ✓ Inclusive   ✗ No bro-culture ✗ No "Dr." / clinical authority ✗ No fake hype

## COMPLIANCE (CRITICAL — FTC/FDA supplement marketing rules — NON-NEGOTIABLE)
These are DIETARY SUPPLEMENTS. Every caption, hook, and image direction MUST follow these rules:
- STRUCTURE/FUNCTION CLAIMS ONLY: "supports energy", "promotes recovery", "helps maintain focus", "supports metabolism". NEVER disease claims — no "cures", "treats", "prevents", "heals", "eliminates", "fixes".
- WEIGHT-LOSS LANGUAGE must be careful: "supports weight management", "complements a healthy diet and exercise". NEVER guarantees or specifics like "lose 20 lbs", "melts fat fast", "burns fat overnight".
- DISCLAIMER-READY: write captions so the standard disclaimer can be appended where appropriate — "These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease."
- Lean on the REAL trust signals: ${BRAND.identity.trustSignals.join(', ')}.
- No medical/clinical authority framing. No "Dr." persona. No implying the product is a drug or treats a condition.

## PLATFORM INTELLIGENCE
INSTAGRAM: Hook before char 125. Carousel = highest saves. Hard line breaks every 1–2 sentences.
FACEBOOK: Pattern interrupt in line 1. "Comment below if..." CTAs drive algorithm.
LINKEDIN: 1–2 line paragraphs. First line must work as standalone scroll-stopper. (Brand/values, ingredient science, behind-the-scenes.)
TIKTOK: First 3 words are everything. "Here's what nobody tells you about X" dominates. High energy, gym-native.

## HASHTAG STRATEGY (platform-specific, fitness/supplement-relevant, gender-neutral)

INSTAGRAM (8-12 hashtags):
- 3-4 high-volume broad: #fitness #gym #fitfam #workoutmotivation
- 4-6 niche topic: #preworkout #fatburner #supplements #recovery #energy #bcaa #fitnessjourney
- 2-3 branded: #UpSurge #UpSurgeSupplements #FuelYourFitnessGoals

FACEBOOK (2-4 hashtags MAX):
- Facebook penalizes hashtag spam — fewer is better
- 1-2 topic hashtags + 1 brand hashtag
- Example: #preworkout #fitness #UpSurge

LINKEDIN (3-5 hashtags):
- Brand/values/quality focus: #fitness #wellness #supplements #smallbusiness #madeinusa
- Avoid spammy fitness tags

TIKTOK (4-6 hashtags):
- 1-2 trending/discovery: #fyp #foryou #gymtok #fittok
- 2-3 niche topic: #preworkout #fatburner #fitfam #workoutmotivation
- 1 branded: #UpSurge

## TRENDING TAGS (refresh regularly — use currently-relevant ones)
Fitness/supplement trending: #preworkout #fatburner #supplements #gymtok #fitfam #workoutmotivation #recovery #energy #fitnessjourney #bcaa #gymmotivation #naturalenergy
Avoid: dead/spammy tags like #fitspo #grind alone, and anything implying medical claims.

## HOOK FORMULAS (fitness/supplement, gender-neutral)
Energy: "That 3pm crash? There's a cleaner fix." / "Real energy. No jitters, no crash."
Pumps/Performance: "The pre-workout that actually shows up when you do."
Recovery: "Train hard. Recover harder."
Focus: "Lock in. Dialed-in focus for your hardest sessions."
Fat loss (compliant): "Support your goals — fuel the work, not the crash."
Clean ingredients: "Know what's in your scoop. We do."
Identity: "Built for people who actually train."

## PILLAR GUIDANCE
Education (40%): Ingredient science — what an ingredient does, how a formula works, why it's in there. Credible, structure/function claims only. UpSurge's differentiator: transparent, real ingredients, USA-made/GMP.
Social Proof (30%): Real customer reviews/results (UpSurge has real Google reviews). Specific, authentic, relatable. "Individual results vary."
Lifestyle (20%): Gym/training/energy/daily-routine aspirational — what UpSurge fuels. Sweat, motion, showing up.
Offer (10%): One clear ask. Product spotlights, bundles (Weight Loss Bundle, Workout Bundle), sales, free shipping over $100. Drive to ${brandConfig.primaryCTA}.

## BRAND ASSET REFERENCES
Start suggestedImage with asset ID then describe scene:
${BRAND_ASSETS.map(a => '- ' + a.id + ': ' + (a.usageNotes || a.description || a.name)).join('\n')}

IMPORTANT ASSET RULES:
- UpSurge is a unisex brand — there are NO gendered asset variants. Use the single product/logo assets for everyone.
- Reference the ACTUAL UpSurge products by name (Up-Fuel, Pulse, ThermoSurge, DreamSlim, Shroom-Surge, Amino-Surge) and the bundles where relevant.
- For Education posts, prefer ingredient/product macro scenes or a product asset; you may leave the asset field as a scene description if no product asset fits.
- Subjects are gender-neutral: describe "a fit, healthy adult (man or woman)" or "athletes" — never specify a single gender as mandatory.
${topExamples}${bottomExamples}

Respond ONLY with valid JSON. No markdown fences, no preamble.`;
}

async function batchGenerateMonth({ posts, month, year, theme, brandConfig, topPerformers, bottomPerformers }) {
  const monthName = MONTH_NAMES[month];
  const systemPrompt = buildSystemPrompt(brandConfig, topPerformers, bottomPerformers);
  const items = posts.map((p,i)=>`${i+1}. Platform: ${p.platform} | Pillar: ${p.pillar} | Date: ${monthName} ${p.day}`).join("\n");
  const response = await fetch("/api/generate-text", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:8000,
      system: systemPrompt,
      messages:[{role:"user", content:
        `Generate ${posts.length} social posts for ${BRAND.identity.name} for ${monthName} ${year}.${theme?`\nMonthly theme: ${theme}`:""}

Posts:
${items}

Caption lengths: instagram 130–200 chars (hook before char 125) | facebook 200–320 | linkedin 280–420 | tiktok 70–120

FORMAT MIX RULES (follow strictly):
- 50% of posts must be "static" (single image)
- 25% of posts must be "reel" (short video, 10 seconds, vertical 9:16)
- 25% of posts must be "carousel" (multi-image swipeable post)
- TikTok posts should ALWAYS be "reel"
- Instagram should get a mix of all three formats
- LinkedIn should mostly be "static" or "carousel"
- Facebook should get a mix of "static" and "reel"

For carousel posts, describe 3-5 slide topics in the suggestedImage field like: "ASSET_ID + Slide 1: [topic] | Slide 2: [topic] | Slide 3: [topic]"
For reel posts, describe the motion and scene in suggestedImage like: "ASSET_ID + [scene description with camera movement, action, mood]"

VOICEOVER RULES (CRITICAL — the video is only ~10 seconds, so the script MUST be short or it gets cut off):
- HARD LIMIT: 15-25 words total. One or two punchy sentences. NEVER more than 25 words.
- Must be fully spoken within ~10 seconds at a natural pace — shorter is safer.
- Do NOT use [pause] tags or filler words. Every word costs time. No stats dumps.
- Structure: quick hook → one benefit → short CTA.
- Energetic, credible UpSurge brand voice — gym-native, motivating, NEVER a "Dr." or clinical voice.
- Keep claims compliant: structure/function only ("supports energy", "promotes recovery"), no disease claims, no weight-loss guarantees.
- Example good (17 words): "That 3pm crash? Pulse gives you clean energy and focus — no jitters, no crash. Shop UpSurge."
- Example good (13 words): "Train hard, recover harder. Amino-Surge fuels your comeback. Link in bio."
- Example BAD (too long, will get cut off): anything over 25 words, or any [pause] tags.

Return JSON array with exactly ${posts.length} objects:
[{"index":1,"caption":"...","hashtags":"Platform-optimized hashtags per HASHTAG STRATEGY above — 8-12 for Instagram, 2-4 for Facebook, 3-5 for LinkedIn, 4-6 for TikTok. Gender-neutral by default.","hook":"max-impact opening line","suggestedImage":"ASSET_ID + detailed scene description","suggestedFormat":"static|carousel|reel|story","voiceoverScript":"For reel formats ONLY: 15-25 words MAX (~10 seconds). One or two punchy sentences: quick hook → one benefit → short CTA. NO [pause] tags. Empty string for static/carousel."}]`
      }],
    }),
  });
  if(!response.ok) throw new Error(`Claude API ${response.status}`);
  const data = await response.json();
  const raw = data.content?.[0]?.text||"[]";
  return JSON.parse(raw.replace(/```json|```/g,"").trim());
}

async function generateOnePost({ platform, pillar, topic, format, rejectNote, brandConfig, topPerformers, bottomPerformers }) {
  const systemPrompt = buildSystemPrompt(brandConfig, topPerformers, bottomPerformers);
  const lengths = {instagram:"130–200 chars, hook before char 125",facebook:"200–320",linkedin:"280–420",tiktok:"70–120"};
  const response = await fetch("/api/generate-text", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:1200,
      system: systemPrompt,
      messages:[{role:"user", content:
        `Create one ${platform} post for "${pillar}" pillar.
Format: ${format || 'static'} ${format === 'reel' ? '— THIS IS A VIDEO POST, you MUST write a voiceoverScript.' : ''}
Topic: ${topic || pillar + " content for fitness-focused adults (men and women) who want energy, recovery, fat loss, and overall health — featuring UpSurge supplements"}
Length: ${lengths[platform]}
${rejectNote?`IMPORTANT — previous rejected for: "${rejectNote}". Fix this specifically.`:""}
Return: {"caption":"...","hashtags":"Platform-optimized per HASHTAG STRATEGY: 8-12 for Instagram, 2-4 for Facebook, 3-5 for LinkedIn, 4-6 for TikTok. Fitness/supplement, gender-neutral.","hook":"...","suggestedImage":"ASSET_ID + scene description","suggestedFormat":"static|carousel|reel|story","voiceoverScript":"For reel/video formats ONLY — the video is ~10 seconds, so keep it to 15-25 words MAX (one or two punchy sentences). Energetic UpSurge brand voice — NEVER a 'Dr.'/clinical voice. Compliant claims only (structure/function; no disease or weight-loss guarantees). Structure: quick hook → one benefit → short CTA. NO [pause] tags. Leave blank for static/carousel. Example: 'That 3pm crash? Pulse gives you clean energy and focus — no jitters, no crash. Shop UpSurge.'"}`
      }],
    }),
  });
  const data = await response.json();
  const raw = data.content?.[0]?.text||"{}";
  return JSON.parse(raw.replace(/```json|```/g,"").trim());
}
async function generateMultiPlatform({ pillar, topic, formats, brandConfig, topPerformers, bottomPerformers }) {
  const systemPrompt = buildSystemPrompt(brandConfig, topPerformers, bottomPerformers);
  const response = await fetch("/api/generate-text", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:4000,
      system: systemPrompt,
      messages:[{role:"user", content:
        `Create 3 versions of ONE post topic optimized for different platforms. Same core message, but each caption, hashtags, hook, and image direction must be specifically optimized for its platform's algorithm and audience behavior.

Topic: ${topic || pillar + " content for fitness-focused adults (men and women) who want energy, recovery, fat loss, and overall health — featuring UpSurge supplements"}
Pillar: ${pillar}

Generate exactly 3 posts:

1. INSTAGRAM (format: ${formats.instagram || 'static'})
   - Caption: 130–200 chars, hook MUST land before char 125, hard line breaks every 1-2 sentences
   - Hashtags: 8-12 total. Mix of 3-4 broad (#fitness #gym #fitfam #workoutmotivation), 4-6 niche (#preworkout #fatburner #supplements #recovery #energy #bcaa), and 2-3 branded (#UpSurge #UpSurgeSupplements). Fitness/supplement, gender-neutral.
   - Hook: Must stop the scroll at thumbnail size
   ${formats.instagram === 'reel' ? '- This is a VIDEO post — write a voiceoverScript: 15-25 words MAX (~10 seconds, one or two punchy sentences). Quick hook → one benefit → short CTA. NO [pause] tags.' : ''}

2. FACEBOOK (format: ${formats.facebook || 'static'})
   - Caption: 200–320 chars, pattern interrupt in first line, conversational tone
   - Hashtags: 2-4 MAX. Facebook penalizes hashtag spam. Use only 1-2 topic hashtags + 1 brand tag (e.g. #preworkout #fitness #UpSurge)
   - Hook: "Comment below if..." or question-based CTAs drive algorithm
   - CTA should encourage comments/shares
   ${formats.facebook === 'reel' ? '- This is a VIDEO post — write a voiceoverScript: 15-25 words MAX (~10 seconds, one or two punchy sentences). Quick hook → one benefit → short CTA. NO [pause] tags.' : ''}

3. TIKTOK (format: ${formats.tiktok || 'reel'})
   - Caption: 70–120 chars MAX, ultra-concise
   - Hashtags: 4-6 total. Mix of 1-2 trending/discovery (#fyp #foryou #gymtok #fittok), 2-3 niche topic (#preworkout #fatburner #fitfam #workoutmotivation), 1 branded (#UpSurge). Fitness/supplement, gender-neutral.
   - Hook: First 3 words are EVERYTHING. "Here's what nobody tells you about X" format dominates
   - THIS IS ALWAYS A VIDEO — write a voiceoverScript: 15-25 words MAX (~10 seconds, one or two punchy sentences). Front-load the strongest hook in the first 2 seconds, then one benefit → short CTA. NO [pause] tags.

IMPORTANT: Each platform version must feel NATIVE to that platform, not like a copy-paste. Different hook formulas, different CTA styles, different energy levels. Same core message/insight, completely different execution.

Return JSON array with exactly 3 objects:
[
  {"platform":"instagram","caption":"...","hashtags":"...","hook":"...","suggestedImage":"ASSET_ID + scene description","suggestedFormat":"${formats.instagram || 'static'}","voiceoverScript":"..."},
  {"platform":"facebook","caption":"...","hashtags":"...","hook":"...","suggestedImage":"ASSET_ID + scene description","suggestedFormat":"${formats.facebook || 'static'}","voiceoverScript":"..."},
  {"platform":"tiktok","caption":"...","hashtags":"...","hook":"...","suggestedImage":"ASSET_ID + scene description","suggestedFormat":"${formats.tiktok || 'reel'}","voiceoverScript":"..."}
]`
      }],
    }),
  });
  if(!response.ok) throw new Error(`Claude API ${response.status}`);
  const data = await response.json();
  const raw = data.content?.[0]?.text||"[]";
  return JSON.parse(raw.replace(/```json|```/g,"").trim());
}

async function generateVariations({ post, brandConfig, topPerformers, bottomPerformers }) {
  const systemPrompt = buildSystemPrompt(brandConfig, topPerformers, bottomPerformers);
  const lengths = {instagram:"130–200 chars",facebook:"200–320",linkedin:"280–420",tiktok:"70–120"};
  const response = await fetch("/api/generate-text", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:3000,
      system: systemPrompt,
      messages:[{role:"user", content:
        `Generate 3 distinct variations of this ${post.platform} post for the "${post.pillar}" pillar.

ORIGINAL CAPTION: "${post.caption}"

Each variation must use a DIFFERENT hook formula:
- Variation 1: Contrarian or pattern interrupt ("Stop X" / "X is wrong")
- Variation 2: Specificity with data/numbers ("At age X, Y happened in Z days")
- Variation 3: Curiosity gap or identity statement ("The one thing..." / "People who actually train...")

All 3 must have the same CTA intent as the original. Length: ${lengths[post.platform]}.

Return JSON array with exactly 3 objects:
[{"variation":1,"hookType":"contrarian","caption":"...","hashtags":"...","hook":"..."},
 {"variation":2,"hookType":"specificity","caption":"...","hashtags":"...","hook":"..."},
 {"variation":3,"hookType":"curiosity","caption":"...","hashtags":"...","hook":"..."}]`
      }],
    }),
  });
  if(!response.ok) throw new Error(`Claude API ${response.status}`);
  const data = await response.json();
  const raw = data.content?.[0]?.text||"[]";
  return JSON.parse(raw.replace(/```json|```/g,"").trim());
}
async function scheduleToGHL(post) {
  // Sends the approved post to /api/schedule-ghl, which forwards it to the
  // Make.com webhook (MAKE_WEBHOOK_URL). If that env var is unset the route
  // safely no-ops, so approval still just marks the post "scheduled" locally.
  try {
    const response = await fetch("/api/schedule-ghl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...post,
        date: post?.date instanceof Date ? post.date.toISOString() : post?.date,
      }),
    });
    return response.ok;
  } catch (e) {
    console.warn('Schedule webhook failed:', e.message);
    return false;
  }
}

// ── Distribute posts across month ─────────────────────────────────
function distributePosts({totalPosts,platformPcts,pillarPcts,activeDays,year,month}) {
  const dim=daysInMonth(year,month);
  const validDays=[];
  for(let d=1;d<=dim;d++) if(activeDays.includes(new Date(year,month,d).getDay())) validDays.push(d);
  if(!validDays.length) return [];
  const build=(map,keys)=>{
    const list=[];
    keys.forEach(k=>{ const c=Math.round((map[k]/100)*totalPosts); for(let i=0;i<c;i++) list.push(k); });
    while(list.length<totalPosts) list.push(keys[list.length%keys.length]);
    list.length=totalPosts;
    for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
    return list;
  };
  return Array.from({length:totalPosts},(_,i)=>({
    day:validDays[i%validDays.length],
    platform:build(platformPcts, PLATFORMS.map(p=>p.id))[i],
    pillar:build(pillarPcts, PILLARS.map(p=>p.id))[i],
  })).sort((a,b)=>a.day-b.day);
}

function distributeByDates({selectedDays, pillarPcts}) {
  const total = selectedDays.length;
  if (total === 0) return [];
  const pillarKeys = PILLARS.map(p=>p.id);
  const list = [];
  pillarKeys.forEach(k => {
    const c = Math.round((pillarPcts[k]/100)*total);
    for(let i=0;i<c;i++) list.push(k);
  });
  while(list.length<total) list.push(pillarKeys[list.length%pillarKeys.length]);
  list.length = total;
  for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
  return selectedDays.slice().sort((a,b)=>a-b).map((day,i)=>({
    day,
    platform:"instagram",
    pillar:list[i],
  }));
}

// ── Sample data ───────────────────────────────────────────────────
function buildSample() {
  const now=new Date(), y=now.getFullYear(), m=now.getMonth();
  return [
    {id:uid(),date:new Date(y,m,3),platform:"instagram",pillar:"education",status:"posted",score:4,caption:"That 3pm crash isn't just you. Here's what clean, sustained energy actually feels like.",hashtags:"#preworkout #energy #fitfam #supplements #UpSurge",hook:"The cleaner fix for your 3pm crash.",suggestedImage:"PULSE_PRODUCT ingredient macro with energy particles",suggestedFormat:"carousel",imageUrl:null,imageGenerating:false},
    {id:uid(),date:new Date(y,m,6),platform:"facebook",pillar:"social_proof",status:"posted",score:2,caption:'"Switched my pre-workout to Up-Fuel and the difference is real — clean energy, no crash." — Verified UpSurge Customer',hashtags:"#workoutmotivation #fitfam #UpSurge",hook:"Clean energy, no crash.",suggestedImage:"UPFUEL_PRODUCT fit athlete post-workout in morning light",suggestedFormat:"static",imageUrl:null,imageGenerating:false},
    {id:uid(),date:new Date(y,m,9),platform:"instagram",pillar:"lifestyle",status:"scheduled",score:null,caption:"Showing up is half of it. Fueling the work is the other half.",hashtags:"#gym #workoutmotivation #fitfam #UpSurge",hook:"Train hard. Recover harder.",suggestedImage:"a fit, healthy adult training at golden hour, cinematic gym scene",suggestedFormat:"reel",imageUrl:null,imageGenerating:false},
    {id:uid(),date:new Date(y,m,12),platform:"linkedin",pillar:"education",status:"pending",score:null,caption:"Know what's in your scoop. We list every ingredient — USA-made, GMP-certified.",hashtags:"#supplements #madeinusa #fitness",hook:"Know what's in your scoop.",suggestedImage:"ingredient macro shot with clean supplement-facts aesthetic",suggestedFormat:"static",imageUrl:null,imageGenerating:false},
    {id:uid(),date:new Date(y,m,15),platform:"tiktok",pillar:"offer",status:"rejected",score:null,rejectNote:"Too salesy, felt like an ad not a hook",caption:"Stack up and save. The Workout Bundle has everything for your training days.",hashtags:"#gymtok #preworkout #UpSurge",hook:"Everything for your training days.",suggestedImage:"WORKOUT_BUNDLE premium product hero shot",suggestedFormat:"reel",imageUrl:null,imageGenerating:false},
    {id:uid(),date:new Date(y,m,18),platform:"facebook",pillar:"education",status:"draft",score:null,caption:"Three ingredients that support energy and focus — and why they're in Pulse.",hashtags:"#naturalenergy #supplements #UpSurge",hook:"3 ingredients. Real energy.",suggestedImage:"PULSE_PRODUCT with ingredient callouts and energy art",suggestedFormat:"carousel",imageUrl:null,imageGenerating:false},
  ];
}

// ─────────────────────────────────────────────────────────────────
// SEQUENTIAL IMAGE QUEUE
// Generates images one at a time to avoid rate limits (30rpm on Pro)
// ─────────────────────────────────────────────────────────────────
function useImageQueue(posts, setPosts, brandConfig, setEditPost) {
  const queueRef = useRef([]);
  const processingRef = useRef(false);

  const processNext = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;
    const postId = queueRef.current.shift();
    const post = posts.find(p => p.id === postId);
    if (!post) { processingRef.current = false; processNext(); return; }

    setPosts(prev => prev.map(x => x.id === postId ? {...x, imageGenerating: true} : x));

    try {
      const result = await generateCreative(post, brandConfig, BRAND_ASSETS);
      
      let finalUrl = result.url;
      let finalUrls = result.urls || null;
      
      if (result.type === 'carousel' && result.urls) {
        // Overlay the single UpSurge logo on each carousel slide (unisex — no gender variants).
        const overlaidUrls = [];
        for (const slideUrl of result.urls) {
          try {
            const overlayResponse = await fetch('/api/overlay-and-save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageUrl: slideUrl, postId: postId + '_slide' + overlaidUrls.length }),
            });
            const overlayData = await overlayResponse.json();
            overlaidUrls.push(overlayData.permanentUrl || slideUrl);
          } catch(e) {
            overlaidUrls.push(slideUrl);
          }
        }
        finalUrl = overlaidUrls[0];
        finalUrls = overlaidUrls;
      } else if (result.url && result.type === 'image') {
        try {
          const overlayResponse = await fetch('/api/overlay-and-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: result.url, postId }),
          });
          const overlayData = await overlayResponse.json();
          if (overlayData.permanentUrl) finalUrl = overlayData.permanentUrl;
        } catch(overlayErr) {
          console.warn('Logo overlay failed, using original:', overlayErr);
        }
      }

      // Save image URL to Supabase so it persists across refreshes
      const { error: saveError } = await supabase.from('upsurge_posts').update({
        image_url: finalUrl,
        image_type: result.type,
        carousel_urls: finalUrls || null,
        updated_at: new Date().toISOString(),
      }).eq('id', postId);
      if (saveError) console.error('Failed to save image URL to Supabase:', saveError);
      else console.log('Image URL saved to Supabase:', postId, finalUrl?.substring(0, 60));

      // Save image URL to Supabase so it persists across refreshes
      await supabase.from('upsurge_posts').update({
        image_url: finalUrl,
        image_type: result.type,
        updated_at: new Date().toISOString(),
      }).eq('id', postId);

      // Save image URL to Supabase so it persists across refreshes
      await supabase.from('upsurge_posts').update({
        image_url: finalUrl,
        image_type: result.type,
        updated_at: new Date().toISOString(),
      }).eq('id', postId);

      setPosts(prev => prev.map(x => x.id === postId
        ? {...x, imageUrl: finalUrl, imageType: result.type, carouselUrls: finalUrls, imageGenerating: false}
        : x
      ));
      if (setEditPost) setEditPost(prev => prev && prev.id === postId ? {...prev, imageUrl: finalUrl, imageType: result.type, carouselUrls: finalUrls, imageGenerating: false} : prev);

      // ── Auto-generate a branded cover for reels (logo + hook + upsurgesupps.com) ──
      if (result.type === 'video' && (post.hook || '').trim()) {
        try {
          setPosts(prev => prev.map(x => x.id === postId ? {...x, coverGenerating: true} : x));
          const coverRes = await fetch('/api/generate-cover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId, hook: post.hook, suggestedImage: post.suggestedImage, pillar: post.pillar }),
          });
          const coverData = await coverRes.json().catch(() => ({}));
          if (coverRes.ok && coverData.coverUrl) {
            setPosts(prev => prev.map(x => x.id === postId ? {...x, coverUrl: coverData.coverUrl, coverGenerating: false} : x));
            if (setEditPost) setEditPost(prev => prev && prev.id === postId ? {...prev, coverUrl: coverData.coverUrl, coverGenerating: false} : prev);
          } else {
            console.warn('Auto cover failed:', coverData.error);
            setPosts(prev => prev.map(x => x.id === postId ? {...x, coverGenerating: false} : x));
          }
        } catch(coverErr) {
          console.warn('Auto cover error:', coverErr.message);
          setPosts(prev => prev.map(x => x.id === postId ? {...x, coverGenerating: false} : x));
        }
      }
    } catch(e) {
      console.error(`Image generation failed for ${postId}:`, e.message);
      setPosts(prev => prev.map(x => x.id === postId ? {...x, imageGenerating: false} : x));
    }
    processingRef.current = false;
    setTimeout(() => processNext(), 500); // small delay between requests
  }, [posts, setPosts, brandConfig]);

  const enqueue = useCallback((postId) => {
    if (!queueRef.current.includes(postId)) {
      queueRef.current.push(postId);
    }
    processNext();
  }, [processNext]);

  const enqueueAll = useCallback((postIds) => {
    postIds.forEach(id => {
      if (!queueRef.current.includes(id)) queueRef.current.push(id);
    });
    processNext();
  }, [processNext]);

  const queueLength = queueRef.current.length;

  return { enqueue, enqueueAll, queueLength };
}

// ─────────────────────────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────────────────────────

function Modal({title,onClose,children,width=560}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16}} onClick={onClose}>
      <div style={{background:T.surf2,border:`1px solid ${T.border}`,borderRadius:14,padding:26,maxWidth:width,width:"100%",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:700,color:T.text}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:20,lineHeight:1,padding:0}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StarRating({score,onChange,size=16}) {
  return (
    <div style={{display:"flex",gap:2}}>
      {[1,2,3,4,5].map(n=>(
        <button key={n} onClick={()=>onChange(n)} style={{background:"none",border:"none",cursor:"pointer",padding:1,fontSize:size,color:n<=(score||0)?T.accent:"#333355",lineHeight:1}}>★</button>
      ))}
    </div>
  );
}

function CreativePreview({post, onGenerate, generating, onGenerateCover, coverGenerating}) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const isVideo = post.suggestedFormat==="reel"||post.suggestedFormat==="story_video";
  const isCarousel = post.suggestedFormat==="carousel" && post.carouselUrls && post.carouselUrls.length > 1;

  const triggerGenerate = () => onGenerate();

  // Cover controls for reels — branded thumbnail with logo + hook + upsurgesupps.com
  const coverControls = (isVideo && post.imageUrl) ? (
    <div style={{padding:"8px 10px",borderTop:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8}} onClick={e=>e.stopPropagation()}>
      {post.coverUrl ? (
        <img src={post.coverUrl} alt="Cover" style={{width:34,height:60,borderRadius:4,objectFit:"cover",border:`1px solid ${T.border}`,flexShrink:0}}/>
      ) : (
        <div style={{width:34,height:60,borderRadius:4,border:`1px dashed ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>🖼</div>
      )}
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:10,fontWeight:700,color:post.coverUrl?T.green:T.muted}}>{post.coverUrl?"✓ Cover ready":"Cover photo"}</div>
        <div style={{fontSize:9,color:T.muted}}>Logo · hook · upsurgesupps.com</div>
      </div>
      <button onClick={()=>onGenerateCover&&onGenerateCover()} disabled={coverGenerating}
        style={{background:coverGenerating?"#1A1A2E":(post.coverUrl?"transparent":BRAND_GRADIENT),border:post.coverUrl?`1px solid ${T.border}`:"none",color:coverGenerating?T.muted:(post.coverUrl?T.muted:"#fff"),borderRadius:5,padding:"5px 9px",cursor:coverGenerating?"default":"pointer",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>
        {coverGenerating?"⚡ …":(post.coverUrl?"↺ Cover":"🖼 Generate cover")}
      </button>
    </div>
  ) : null;

  return (
    <div style={{background:"#0D0D1A",borderRadius:8,overflow:"hidden",border:`1px solid ${T.border}`,minHeight:130}}>
      {post.imageUrl ? (
        isVideo
          ? <video key={post.imageUrl} src={post.imageUrl} controls style={{width:"100%",maxHeight:280,objectFit:"contain"}}/>
          : isCarousel ? (
            <div style={{position:"relative"}}>
              <img src={post.carouselUrls[currentSlide]} alt={`Slide ${currentSlide+1}`} style={{width:"100%",maxHeight:180,objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>
              <div style={{position:"absolute",bottom:6,left:0,right:0,display:"flex",justifyContent:"center",gap:4}}>
                {post.carouselUrls.map((_,i)=>(
                  <button key={i} onClick={(e)=>{e.stopPropagation();setCurrentSlide(i);}} style={{width:8,height:8,borderRadius:"50%",border:"none",background:i===currentSlide?"#fff":"#ffffff55",cursor:"pointer",padding:0}}/>
                ))}
              </div>
              <div style={{position:"absolute",top:6,right:6,background:"#00000088",color:"#fff",fontSize:10,padding:"2px 6px",borderRadius:4}}>{currentSlide+1}/{post.carouselUrls.length}</div>
            </div>
          )
          : <img src={post.imageUrl} alt="Creative" style={{width:"100%",maxHeight:180,objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>
      ) : (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:130,gap:8,padding:14}}>
          <div style={{fontSize:20}}>🖼</div>
          <p style={{fontSize:11,color:T.muted,textAlign:"center",margin:0}}>
            {isVideo?"10-sec video":post.suggestedFormat==="carousel"?"3-5 slide carousel":"Pro image"}<br/>
            <span style={{color:"#5EEBEB"}}>{isVideo?"grok-imagine-video":"grok-imagine-image-pro"}</span>
          </p>
          <button onClick={triggerGenerate} disabled={generating}
            style={{background:generating?"#1A1A2E":BRAND_GRADIENT,border:"none",color:generating?T.muted:"#fff",borderRadius:6,padding:"6px 12px",cursor:generating?"default":"pointer",fontSize:11,fontWeight:700}}>
            {generating?"⚡ Generating…":isVideo?"⚡ Video ($0.50)":post.suggestedFormat==="carousel"?`⚡ Carousel ($${(0.07*3).toFixed(2)})`:"⚡ Image ($0.07)"}
          </button>
        </div>
      )}
      {post.imageUrl&&(
        <div style={{padding:"6px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
          <span style={{fontSize:10,color:T.green}}>✓ {isCarousel?`${post.carouselUrls?.length} slides`:"Generated"}</span>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <button onClick={triggerGenerate} disabled={generating} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:4,padding:"3px 6px",cursor:"pointer",fontSize:10}}>
              {generating?"…":"↺"}
            </button>
          </div>
        </div>
      )}
      {coverControls}
    </div>
  );
}
function InlineHookEditor({ post, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(post.hook || '');

  useEffect(() => { setValue(post.hook || ''); }, [post.hook]);

  const save = () => {
    const trimmed = value.trim();
    if (trimmed === (post.hook || '').trim()) { setEditing(false); return; }
    onSave({ ...post, hook: trimmed });
    setEditing(false);
  };

  const cancel = () => {
    setValue(post.hook || '');
    setEditing(false);
  };

  if (!editing) {
    return (
      <p
        onClick={() => setEditing(true)}
        title="Click to edit hook"
        style={{
          fontSize: 12,
          color: '#8B8BAA',
          fontStyle: 'italic',
          margin: '6px 0 0',
          cursor: 'pointer',
          padding: '3px 6px',
          borderRadius: 4,
          border: '1px dashed transparent',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.border = '1px dashed #8B8BAA44'; e.currentTarget.style.background = '#8B8BAA08'; }}
        onMouseLeave={(e) => { e.currentTarget.style.border = '1px dashed transparent'; e.currentTarget.style.background = 'transparent'; }}
      >
        🎬 {post.hook || 'Click to add hook...'} <span style={{ fontSize: 10, color: '#555577', marginLeft: 4 }}>(click to edit)</span>
      </p>
    );
  }

  return (
    <div style={{ margin: '6px 0 0', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 12, color: '#8B8BAA', paddingTop: 8 }}>🎬</span>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') cancel(); }}
        autoFocus
        rows={2}
        style={{
          flex: 1,
          background: '#13131F',
          border: '1px solid #8B8BAA55',
          borderRadius: 5,
          padding: '6px 8px',
          color: '#E0E0EC',
          fontSize: 12,
          fontStyle: 'italic',
          resize: 'vertical',
          outline: 'none',
          fontFamily: 'inherit',
          lineHeight: 1.5,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={save}
          style={{ background: '#10B98122', border: '1px solid #10B98144', color: '#10B981', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
        >
          ✓ Save
        </button>
        <button
          onClick={cancel}
          style={{ background: 'transparent', border: '1px solid #333355', color: '#6B6B8A', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
function EditPostForm({post,onSave,onCancel}) {
  const [form,setForm]=useState({...post,dateStr:post.date.toISOString().slice(0,16)});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:13}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div><label style={lbl}>Platform</label>
          <select value={form.platform} onChange={e=>set("platform",e.target.value)} style={selectStyle}>
            {PLATFORMS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
          </select></div>
        <div><label style={lbl}>Pillar</label>
          <select value={form.pillar} onChange={e=>set("pillar",e.target.value)} style={selectStyle}>
            {PILLARS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
          </select></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div><label style={lbl}>Date</label>
          <input type="datetime-local" value={form.dateStr} onChange={e=>set("dateStr",e.target.value)} style={{...inputStyle,width:"100%",boxSizing:"border-box"}}/></div>
        <div><label style={lbl}>Status</label>
          <select value={form.status} onChange={e=>set("status",e.target.value)} style={selectStyle}>
            {Object.entries(STATUSES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select></div>
      </div>
      <div><label style={lbl}>Caption</label>
        <textarea value={form.caption} onChange={e=>set("caption",e.target.value)} rows={4} style={{...inputStyle,width:"100%",boxSizing:"border-box",resize:"vertical"}}/></div>
      <div><label style={lbl}>Hashtags</label>
        <input value={form.hashtags||""} onChange={e=>set("hashtags",e.target.value)} style={{...inputStyle,width:"100%",boxSizing:"border-box"}}/></div>
      <div><label style={lbl}>Image Direction (for Grok)</label>
        <input value={form.suggestedImage||""} onChange={e=>set("suggestedImage",e.target.value)} placeholder="e.g. PULSE_PRODUCT ingredient macro with energy particles..." style={{...inputStyle,width:"100%",boxSizing:"border-box"}}/></div>
      {(form.suggestedFormat==="reel"||form.suggestedFormat==="story_video")&&(
        <div><label style={lbl}>Voiceover Script (for TTS — leo voice)</label>
          <textarea value={form.voiceoverScript||""} onChange={e=>set("voiceoverScript",e.target.value)} rows={3}
            placeholder="e.g. That 3pm crash isn't just you. [pause] Pulse is clean energy that supports focus — no jitters, no crash. [pause] Fuel the work. Shop UpSurge."
            style={{...inputStyle,width:"100%",boxSizing:"border-box",resize:"vertical",lineHeight:1.6}}/>
          <p style={{fontSize:10,color:"#6B6B8A",margin:"4px 0 0"}}>Tags: [pause] [long-pause] · Wrap with: &lt;emphasis&gt; &lt;slow&gt; &lt;soft&gt; &lt;whisper&gt; · Voice: leo (authoritative)</p>
        </div>
      )}
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
        <button onClick={()=>{const d=form.dateStr?new Date(form.dateStr):form.date;onSave({...form,date:d});}} style={btnPrimary}>Save Changes</button>
      </div>
    </div>
  );
}
function BrandConfigPanel({config, onChange}) {
  const set = (k,v) => onChange(prev => ({...prev, [k]: v}));
  // NOTE: keys map to existing Supabase columns (doctor_name, clinic_tagline,
  // active_protocols) but are repurposed for UpSurge — no doctor/clinic.
  const fields = [
    { key:"clinicTagline",   label:"Brand Tagline",       placeholder:"Fuel Your Fitness Goals" },
    { key:"doctorName",      label:"Brand Voice Note (optional)", placeholder:"e.g. energetic, gym-native — leave blank to use defaults" },
    { key:"primaryOffer",    label:"Primary Offer",       placeholder:"Free shipping on orders over $100" },
    { key:"primaryCTA",      label:"Primary CTA",         placeholder:"Shop now at upsurgesupps.com" },
    { key:"bookingLink",     label:"Shop Link",           placeholder:"https://upsurgesupps.com/collections/all" },
    { key:"activeProtocols", label:"Featured Categories", placeholder:"Pre/Intra Workout, Weight Loss / Fat Burners, Overall Health, Bundles" },
    { key:"targetCity",      label:"Target City",         placeholder:"(leave blank for national)" },
    { key:"currentPromo",    label:"Current Promo",       placeholder:"e.g. 20% off bundles this week (leave blank if none)" },
  ];
  return (
    <div style={{maxWidth:620}}>
      <h2 style={{fontSize:21,fontWeight:700,marginBottom:6}}>Brand Configuration</h2>
      <p style={{fontSize:13,color:T.muted,margin:"0 0 22px"}}>These values are injected into every Claude prompt. Changes auto-save.</p>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={lbl}>{f.label}</label>
            {f.key === "currentPromo" || f.key === "activeProtocols" ? (
              <textarea value={config[f.key]||""} onChange={e=>set(f.key,e.target.value)} rows={2}
                placeholder={f.placeholder}
                style={{...inputStyle,width:"100%",boxSizing:"border-box",resize:"vertical"}}/>
            ) : (
              <input value={config[f.key]||""} onChange={e=>set(f.key,e.target.value)}
                placeholder={f.placeholder}
                style={{...inputStyle,width:"100%",boxSizing:"border-box"}}/>
            )}
          </div>
        ))}
      </div>
      <div style={{padding:"12px 14px",background:"#10B98111",border:"1px solid #10B98133",borderRadius:8,marginTop:22}}>
        <p style={{fontSize:12,color:T.green,margin:0}}>✓ Changes auto-save to Supabase and take effect on the next generation.</p>
      </div>
    </div>
  );
}
function AssetLibrary({brandConfig, assets, onAssetsChanged}) {
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [uploadingId, setUploadingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFile, setNewFile] = useState(null);
  const [adding, setAdding] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(null);

  const generateId = (name) => name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  const handleAddAsset = async () => {
    if (!newName.trim() || !newFile) return;
    setAdding(true);
    try {
      const assetId = generateId(newName);
      const formData = new FormData();
      formData.append('file', newFile);
      formData.append('assetId', assetId);
      formData.append('name', newName.trim());

      const response = await fetch('/api/upload-asset', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      onAssetsChanged();
      setShowAddModal(false);
      setNewName('');
      setNewFile(null);
    } catch(e) {
      alert('Failed to add asset: ' + e.message);
    }
    setAdding(false);
  };

  const handleReplaceImage = async (assetId, file) => {
    setUploadingId(assetId);
    try {
      const ext = file.name.split('.').pop();
      const cleanId = assetId.replace(/\s+/g, '_');
      const filename = `brand-assets/${cleanId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('upsurge-assets')
        .upload(filename, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('upsurge-assets')
        .getPublicUrl(filename);

      await supabase.from('upsurge_brand_assets').update({
        image_url: urlData.publicUrl,
        media_type: file.type,
        updated_at: new Date().toISOString(),
      }).eq('id', assetId);

      onAssetsChanged();
    } catch(e) {
      alert('Upload failed: ' + e.message);
    }
    setUploadingId(null);
  };

  const handleDelete = async (assetId) => {
    if (!confirm('Delete this asset?')) return;
    await supabase.from('upsurge_brand_assets').delete().eq('id', assetId);
    onAssetsChanged();
  };

  const handleGenerateDescription = async (asset) => {
    setGeneratingDesc(asset.id);
    try {
      const response = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `You are describing a brand asset image for ${BRAND.identity.name}, a fitness supplements brand. The asset is named "${asset.name}".

Generate the following fields for this brand asset. Respond ONLY with valid JSON, no markdown fences.

{
  "description": "One sentence describing what the image shows",
  "usageNotes": "When to use this asset — which content pillars, platforms, and post types it works best for",
  "visualDescription": "Detailed visual description for AI image generation — describe the subject, lighting, colors, composition, mood in rich detail so an AI image generator could recreate or riff on this image",
  "usageTags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Tags should be lowercase keywords like: authority, lifestyle, product, brand, clinical, aspirational, education, social_proof, offer, instagram, facebook, linkedin, tiktok`
          }],
        }),
      });
      const data = await response.json();
      const raw = data.content?.[0]?.text || "{}";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

      await supabase.from('upsurge_brand_assets').update({
        description: parsed.description || '',
        usage_notes: parsed.usageNotes || '',
        visual_description: parsed.visualDescription || '',
        usage_tags: parsed.usageTags || [],
        updated_at: new Date().toISOString(),
      }).eq('id', asset.id);

      onAssetsChanged();
    } catch(e) {
      alert('Description generation failed: ' + e.message);
    }
    setGeneratingDesc(null);
  };

  const handleDrop = (assetId, e) => {
    e.preventDefault();
    setDragOverId(null);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleReplaceImage(assetId, file);
    }
  };

  const handleTest = async (asset) => {
    setTestingId(asset.id);
    try {
      const testPost = { platform:"instagram", pillar:"lifestyle", suggestedImage:`${asset.id} hero shot`, suggestedFormat:"static" };
      const result = await generateCreative(testPost, brandConfig);
      setTestResults(prev=>({...prev,[asset.id]:result.url}));
    } catch(e) { alert('Test failed: ' + e.message); }
    setTestingId(null);
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <h2 style={{fontSize:21,fontWeight:700,margin:0}}>Brand Asset Library</h2>
        <button onClick={()=>setShowAddModal(true)} style={{background:BRAND_GRADIENT,border:"none",color:"#fff",borderRadius:7,padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:700}}>
          + Add Asset
        </button>
      </div>
      <p style={{fontSize:13,color:T.muted,margin:"0 0 8px"}}>Upload images, then click "Generate Description" to let Claude create the metadata automatically.</p>
      <div style={{padding:"10px 14px",background:"#5EEBEB11",border:"1px solid #5EEBEB33",borderRadius:8,marginBottom:22}}>
        <p style={{fontSize:12,color:"#5EEBEB",margin:0}}>💡 All images use <strong>grok-imagine-image-pro</strong> ($0.07) with full UpSurge brand prompt + actual asset as reference image.</p>
      </div>

      {assets.length === 0 ? (
        <div style={{textAlign:"center",padding:60,border:`1px dashed ${T.border}`,borderRadius:12}}>
          <div style={{fontSize:42,marginBottom:12}}>🖼</div>
          <p style={{color:T.muted,fontSize:14,margin:0}}>No brand assets yet.</p>
          <p style={{color:T.muted,fontSize:13,margin:"8px 0 16px"}}>Click "Add Asset" to upload your first brand image.</p>
          <button onClick={()=>setShowAddModal(true)} style={{background:BRAND_GRADIENT,border:"none",color:"#fff",borderRadius:7,padding:"10px 20px",cursor:"pointer",fontSize:14,fontWeight:700}}>
            + Add Your First Asset
          </button>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
          {assets.map(asset=>{
            const hasImage = !!asset.image_url;
            const isUploading = uploadingId === asset.id;
            const isDragOver = dragOverId === asset.id;
            const isGenDesc = generatingDesc === asset.id;
            return (
              <div key={asset.id} style={{background:T.surf,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
                <div
                  onDragOver={e=>{e.preventDefault();setDragOverId(asset.id);}}
                  onDragLeave={()=>setDragOverId(null)}
                  onDrop={e=>handleDrop(asset.id, e)}
                  style={{background:isDragOver?"#5EEBEB22":"#0D0D1A",height:180,display:"flex",alignItems:"center",justifyContent:"center",padding:14,position:"relative",border:isDragOver?"2px dashed #5EEBEB":"2px solid transparent",transition:"all 0.2s"}}
                >
                  {isUploading ? (
                    <div style={{textAlign:"center"}}><div style={{fontSize:24,marginBottom:8}}>⚡</div><p style={{fontSize:12,color:T.muted,margin:0}}>Uploading…</p></div>
                  ) : testResults[asset.id] ? (
                    <img src={testResults[asset.id]} alt="Grok output" style={{maxHeight:160,maxWidth:"100%",objectFit:"contain",borderRadius:4}}/>
                  ) : hasImage ? (
                    <img src={asset.image_url} alt={asset.name} style={{maxHeight:160,maxWidth:"100%",objectFit:"contain",borderRadius:4}} onError={e=>{e.target.style.display="none";}}/>
                  ) : (
                    <div style={{textAlign:"center"}}><div style={{fontSize:32,marginBottom:8,opacity:0.5}}>📁</div><p style={{fontSize:12,color:T.muted,margin:0}}>No image yet</p></div>
                  )}
                  {testResults[asset.id]&&<span style={{position:"absolute",top:6,right:6,background:`${T.green}CC`,color:"#fff",fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4}}>GROK OUTPUT</span>}
                </div>
                <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:14,fontWeight:700,color:T.text}}>{asset.name}</span>
                    <span style={{fontSize:10,color:T.accent,background:`${T.accent}22`,padding:"2px 7px",borderRadius:4,fontWeight:700}}>{asset.id}</span>
                  </div>
                  {asset.description && <p style={{fontSize:12,color:T.muted,margin:"0 0 6px",lineHeight:1.5}}>{asset.description}</p>}
                  {asset.usage_notes && <p style={{fontSize:12,color:"#8B8BAA",margin:"0 0 6px",lineHeight:1.5}}>{asset.usage_notes}</p>}
                  {asset.usage_tags && asset.usage_tags.length > 0 && (
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                      {asset.usage_tags.map(tag=>(
                        <span key={tag} style={{fontSize:10,color:"#5EEBEB",background:"#5EEBEB11",padding:"2px 6px",borderRadius:3}}>{tag}</span>
                      ))}
                    </div>
                  )}
                  {!asset.description && hasImage && (
                    <button onClick={()=>handleGenerateDescription(asset)} disabled={isGenDesc}
                      style={{width:"100%",background:isGenDesc?"#1A1A2E":"#F59E0B22",border:"1px solid #F59E0B44",color:isGenDesc?T.muted:T.accent,borderRadius:6,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:700,marginBottom:8}}>
                      {isGenDesc?"⚡ Claude generating…":"⚡ Generate Description (Claude)"}
                    </button>
                  )}
                  <div style={{display:"flex",gap:6}}>
                    {hasImage && (
                      <button onClick={()=>handleTest(asset)} disabled={testingId===asset.id}
                        style={{flex:1,background:testingId===asset.id?"#1A1A2E":BRAND_GRADIENT,border:"none",color:testingId===asset.id?T.muted:"#fff",borderRadius:6,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                        {testingId===asset.id?"⚡ Testing…":"⚡ Test Grok"}
                      </button>
                    )}
                    <button onClick={()=>{const input=document.createElement('input');input.type='file';input.accept='image/*';input.onchange=e=>{if(e.target.files[0])handleReplaceImage(asset.id,e.target.files[0]);};input.click();}}
                      style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:6,padding:"8px 12px",cursor:"pointer",fontSize:12}}>
                      {hasImage?"↺":"📁"}
                    </button>
                    <button onClick={()=>handleDelete(asset.id)}
                      style={{background:"transparent",border:"1px solid #EF444433",color:T.red,borderRadius:6,padding:"8px 12px",cursor:"pointer",fontSize:12}}>
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <Modal title="Add New Brand Asset" onClose={()=>{setShowAddModal(false);setNewName('');setNewFile(null);}}>
          <div style={{marginBottom:16}}>
            <label style={lbl}>Asset Name</label>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Up-Fuel Tub, UpSurge Logo, Gym Photo…" style={{...inputStyle,width:"100%",boxSizing:"border-box"}}/>
            {newName && <p style={{fontSize:11,color:T.muted,margin:"6px 0 0"}}>ID: {generateId(newName)}</p>}
          </div>
          <div style={{marginBottom:20}}>
            <label style={lbl}>Image File</label>
            <div
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f&&f.type.startsWith('image/'))setNewFile(f);}}
              onClick={()=>{const input=document.createElement('input');input.type='file';input.accept='image/*';input.onchange=e=>{if(e.target.files[0])setNewFile(e.target.files[0]);};input.click();}}
              style={{border:`2px dashed ${newFile?T.green:T.border}`,borderRadius:8,padding:30,textAlign:"center",cursor:"pointer",background:newFile?`${T.green}11`:"transparent"}}
            >
              {newFile ? (
                <div>
                  <div style={{fontSize:24,marginBottom:6}}>✓</div>
                  <p style={{fontSize:13,color:T.green,margin:0,fontWeight:600}}>{newFile.name}</p>
                  <p style={{fontSize:11,color:T.muted,margin:"4px 0 0"}}>{(newFile.size/1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div>
                  <div style={{fontSize:24,marginBottom:6,opacity:0.5}}>📁</div>
                  <p style={{fontSize:13,color:T.muted,margin:0}}>Drag & drop or click to browse</p>
                </div>
              )}
            </div>
          </div>
          <button onClick={handleAddAsset} disabled={!newName.trim()||!newFile||adding}
            style={{width:"100%",background:(!newName.trim()||!newFile||adding)?T.surf2:BRAND_GRADIENT,border:"none",color:(!newName.trim()||!newFile||adding)?T.muted:"#fff",borderRadius:8,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:800}}>
            {adding?"⚡ Uploading…":"+ Add Asset"}
          </button>
        </Modal>
      )}
    </div>
  );
}

// ── Mobile list view (replaces calendar on small screens) ─────────
function MobilePostList({posts, month, year, onPostClick, onAddPost}) {
  const monthPosts = posts
    .filter(p=>p.date.getMonth()===month&&p.date.getFullYear()===year)
    .sort((a,b)=>a.date-b.date);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{margin:0,fontSize:18,fontWeight:700}}>{MONTH_NAMES[month]}</h2>
        <span style={{fontSize:13,color:T.muted}}>{monthPosts.length} posts</span>
      </div>
      {monthPosts.length===0?(
        <div style={{textAlign:"center",padding:40,color:T.muted}}>
          <p style={{margin:0}}>No posts this month.</p>
          <button onClick={()=>onAddPost()} style={{marginTop:12,background:BRAND_GRADIENT,border:"none",color:"#fff",borderRadius:7,padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:700}}>+ Add Post</button>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {monthPosts.map(post=>{
            const pil=pillarOf(post.pillar),plt=platformOf(post.platform);
            const isRejected=post.status==="rejected";
            return (
              <div key={post.id} onClick={()=>onPostClick(post)}
                style={{background:T.surf,border:`1px solid ${isRejected?"#EF444444":T.border}`,borderRadius:8,padding:"12px 14px",cursor:"pointer",display:"flex",gap:12,alignItems:"center"}}>
                {post.imageUrl&&<img src={post.imageUrl} alt="" style={{width:44,height:44,borderRadius:6,objectFit:"cover",flexShrink:0}}/>}
                {!post.imageUrl&&<div style={{width:44,height:44,borderRadius:6,background:`${pil.color}22`,border:`1px solid ${pil.color}44`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🖼</div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:T.muted}}>{post.date.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                    {badge(plt.color,plt.label)}
                    {badge(STATUSES[post.status]?.color||T.muted,STATUSES[post.status]?.label)}
                  </div>
                  <p style={{fontSize:13,color:T.text,margin:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{post.caption.substring(0,60)}…</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ANALYTICS DASHBOARD
// ─────────────────────────────────────────────────────────────────
function AnalyticsDashboard({ posts }) {
  const scoredPosts = posts.filter(p => p.score !== null && p.score !== undefined && p.status === "posted");
  const totalPosted = posts.filter(p => p.status === "posted").length;
  const avgScore = scoredPosts.length > 0
    ? (scoredPosts.reduce((a,p) => a + p.score, 0) / scoredPosts.length).toFixed(1)
    : "—";
  const topPost = scoredPosts.sort((a,b) => b.score - a.score)[0];

  // Score by platform
  const byPlatform = PLATFORMS.map(plt => {
    const ps = scoredPosts.filter(p => p.platform === plt.id);
    const avg = ps.length > 0 ? ps.reduce((a,p) => a+p.score,0) / ps.length : 0;
    return { ...plt, avg: avg.toFixed(1), count: ps.length };
  }).filter(p => p.count > 0);

  // Score by pillar
  const byPillar = PILLARS.map(pil => {
    const ps = scoredPosts.filter(p => p.pillar === pil.id);
    const avg = ps.length > 0 ? ps.reduce((a,p) => a+p.score,0) / ps.length : 0;
    return { ...pil, avg: avg.toFixed(1), count: ps.length };
  }).filter(p => p.count > 0);

  // Score by format
  const formats = ["static","carousel","reel","story"];
  const byFormat = formats.map(fmt => {
    const ps = scoredPosts.filter(p => p.suggestedFormat === fmt);
    const avg = ps.length > 0 ? ps.reduce((a,p) => a+p.score,0) / ps.length : 0;
    return { fmt, avg: avg.toFixed(1), count: ps.length };
  }).filter(p => p.count > 0);

  // Trend — last 30 scored posts grouped by week
  const sorted = [...scoredPosts].sort((a,b) => new Date(a.date)-new Date(b.date));
  const weeks = [];
  let wStart = null, wScores = [];
  sorted.forEach(p => {
    const d = new Date(p.date);
    if (!wStart) wStart = d;
    const dayDiff = (d - wStart) / (1000*60*60*24);
    if (dayDiff < 7) { wScores.push(p.score); }
    else { weeks.push({ label: wStart.toLocaleDateString("en-US",{month:"short",day:"numeric"}), avg: (wScores.reduce((a,b)=>a+b,0)/wScores.length).toFixed(1) }); wStart = d; wScores = [p.score]; }
  });
  if (wScores.length > 0) weeks.push({ label: wStart?.toLocaleDateString("en-US",{month:"short",day:"numeric"})||"", avg: (wScores.reduce((a,b)=>a+b,0)/wScores.length).toFixed(1) });

  // Mini bar chart helper
  const BarChart = ({ items, valueKey, labelKey, colorKey }) => {
    const max = Math.max(...items.map(i => parseFloat(i[valueKey])), 1);
    return (
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {items.map((item,i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:12,color:T.text,width:90,flexShrink:0}}>{item[labelKey]}</span>
            <div style={{flex:1,background:T.surf2,borderRadius:4,height:20,overflow:"hidden"}}>
              <div style={{width:`${(parseFloat(item[valueKey])/max)*100}%`,height:"100%",background:item[colorKey]||BRAND_GRADIENT_H,borderRadius:4,transition:"width 0.6s ease",minWidth:4}}/>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:T.accent,width:28,textAlign:"right"}}>{item[valueKey]}</span>
            <span style={{fontSize:11,color:T.muted,width:44}}>({item.count})</span>
          </div>
        ))}
      </div>
    );
  };

  // Trend sparkline
  const Sparkline = ({ data }) => {
    if (data.length < 2) return <p style={{fontSize:12,color:T.muted,margin:0}}>Not enough data yet — score more posts to see trends.</p>;
    const max = Math.max(...data.map(d => parseFloat(d.avg)));
    const min = Math.min(...data.map(d => parseFloat(d.avg)));
    const range = max - min || 1;
    const W = 400, H = 80;
    const pts = data.map((d,i) => {
      const x = (i / (data.length-1)) * W;
      const y = H - ((parseFloat(d.avg) - min) / range) * (H-10) - 5;
      return `${x},${y}`;
    }).join(" ");
    return (
      <div style={{overflowX:"auto"}}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:W,height:H}}>
          <polyline points={pts} fill="none" stroke="#5EEBEB" strokeWidth={2} strokeLinejoin="round"/>
          {data.map((d,i) => {
            const x = (i / (data.length-1)) * W;
            const y = H - ((parseFloat(d.avg) - min) / range) * (H-10) - 5;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={4} fill={T.accent}/>
                <text x={x} y={H} fontSize={9} fill={T.muted} textAnchor="middle">{d.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  if (scoredPosts.length === 0) {
    return (
      <div>
        <h2 style={{fontSize:21,fontWeight:700,marginBottom:6}}>Analytics</h2>
        <p style={{fontSize:13,color:T.muted,margin:"0 0 40px"}}>Performance data builds as you rate posts after they go live. Score posts from the calendar or approval queue.</p>
        <div style={{textAlign:"center",padding:60,border:`1px dashed ${T.border}`,borderRadius:12}}>
          <div style={{fontSize:42,marginBottom:12}}>📊</div>
          <p style={{color:T.muted,fontSize:14,margin:0}}>No scored posts yet.</p>
          <p style={{color:T.muted,fontSize:13,margin:"8px 0 0"}}>After posts go live, click any posted post → rate it 1–5 stars → data appears here.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{fontSize:21,fontWeight:700,marginBottom:6}}>Analytics</h2>
      <p style={{fontSize:13,color:T.muted,margin:"0 0 24px"}}>Based on {scoredPosts.length} scored posts. Scores feed back into every future generation prompt automatically.</p>

      {/* Summary metrics */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:28}}>
        {[
          { label:"Avg Score",  value: avgScore,           unit:"/5" },
          { label:"Posts Scored", value: scoredPosts.length, unit:"" },
          { label:"Total Posted", value: totalPosted,        unit:"" },
          { label:"Top Score",  value: topPost?.score||"—", unit:"/5" },
        ].map((m,i) => (
          <div key={i} style={{background:T.surf,borderRadius:8,padding:"14px 16px",border:`1px solid ${T.border}`}}>
            <p style={{fontSize:11,color:T.muted,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>{m.label}</p>
            <p style={{fontSize:26,fontWeight:700,color:T.accent,margin:0}}>{m.value}<span style={{fontSize:14,color:T.muted}}>{m.unit}</span></p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:20,marginBottom:24}}>

        {/* By Platform */}
        {byPlatform.length > 0 && (
          <div style={{background:T.surf,border:`1px solid ${T.border}`,borderRadius:10,padding:18}}>
            <p style={{fontSize:13,fontWeight:700,color:T.text,margin:"0 0 16px"}}>Avg Score by Platform</p>
            <BarChart items={byPlatform.map(p=>({...p,label:p.label,avg:p.avg,color:p.color}))} valueKey="avg" labelKey="label" colorKey="color"/>
          </div>
        )}

        {/* By Pillar */}
        {byPillar.length > 0 && (
          <div style={{background:T.surf,border:`1px solid ${T.border}`,borderRadius:10,padding:18}}>
            <p style={{fontSize:13,fontWeight:700,color:T.text,margin:"0 0 16px"}}>Avg Score by Pillar</p>
            <BarChart items={byPillar.map(p=>({...p,label:p.label,avg:p.avg,color:p.color}))} valueKey="avg" labelKey="label" colorKey="color"/>
          </div>
        )}

        {/* By Format */}
        {byFormat.length > 0 && (
          <div style={{background:T.surf,border:`1px solid ${T.border}`,borderRadius:10,padding:18}}>
            <p style={{fontSize:13,fontWeight:700,color:T.text,margin:"0 0 16px"}}>Avg Score by Format</p>
            <BarChart items={byFormat.map(f=>({...f,label:f.fmt,avg:f.avg,color:BRAND_GRADIENT_H}))} valueKey="avg" labelKey="label" colorKey="color"/>
          </div>
        )}
      </div>

      {/* Score trend */}
      <div style={{background:T.surf,border:`1px solid ${T.border}`,borderRadius:10,padding:18,marginBottom:24}}>
        <p style={{fontSize:13,fontWeight:700,color:T.text,margin:"0 0 16px"}}>Score Trend (by week)</p>
        <Sparkline data={weeks}/>
      </div>

      {/* Top performers */}
      <div style={{background:T.surf,border:`1px solid ${T.border}`,borderRadius:10,padding:18}}>
        <p style={{fontSize:13,fontWeight:700,color:T.text,margin:"0 0 14px"}}>Top Performing Posts</p>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {scoredPosts.filter(p=>p.score>=4).slice(0,5).map(post=>{
            const pil=pillarOf(post.pillar),plt=platformOf(post.platform);
            return (
              <div key={post.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 12px",background:T.surf2,borderRadius:7}}>
                <div style={{display:"flex",gap:1,flexShrink:0}}>
                  {[1,2,3,4,5].map(n=><span key={n} style={{color:n<=post.score?T.accent:"#333355",fontSize:14}}>★</span>)}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                    {badge(plt.color,plt.label)}{badge(pil.color,pil.label)}
                    {post.suggestedFormat&&badge("#5EEBEB",post.suggestedFormat)}
                    <span style={{fontSize:11,color:T.muted}}>{new Date(post.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                  </div>
                  <p style={{fontSize:13,color:T.text,margin:0,lineHeight:1.5}}>{post.caption.substring(0,100)}…</p>
                  {post.hook&&<p style={{fontSize:11,color:"#5EEBEB",fontStyle:"italic",margin:"4px 0 0"}}>Hook: {post.hook}</p>}
                </div>
              </div>
            );
          })}
          {scoredPosts.filter(p=>p.score>=4).length===0&&<p style={{fontSize:13,color:T.muted,margin:0}}>No 4–5 star posts yet. Keep scoring!</p>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// VARIATIONS MODAL
// ─────────────────────────────────────────────────────────────────
function VariationsModal({ post, onSelect, onClose, brandConfig, topPerformers, bottomPerformers }) {
  const [loading,    setLoading]    = useState(false);
  const [variations, setVariations] = useState(null);
  const [error,      setError]      = useState("");

  useEffect(() => { handleGenerate(); }, []);

  const handleGenerate = async () => {
    setLoading(true); setError(""); setVariations(null);
    try {
      const vars = await generateVariations({ post, brandConfig, topPerformers, bottomPerformers });
      setVariations(vars);
    } catch(e) { setError("Generation failed — try again."); }
    setLoading(false);
  };

  const HOOK_TYPE_COLORS = { contrarian:"#EF4444", specificity:"#3B82F6", curiosity:"#8B5CF6" };

  return (
    <Modal title="3 Hook Variations" onClose={onClose} width={620}>
      <p style={{fontSize:13,color:T.muted,marginTop:0,marginBottom:16}}>
        Three versions of this post with different hook formulas. Pick the one that feels strongest, or regenerate for more options.
      </p>
      <div style={{padding:"8px 12px",background:T.surf,borderRadius:7,marginBottom:18,fontSize:12,color:T.muted}}>
        <strong style={{color:T.text}}>Original:</strong> {post.caption.substring(0,80)}…
      </div>

      {loading && (
        <div style={{textAlign:"center",padding:"40px 0"}}>
          <div style={{fontSize:32,marginBottom:12}}>⚡</div>
          <p style={{fontSize:14,color:T.muted,margin:0}}>Generating 3 variations with different hooks…</p>
        </div>
      )}

      {error && (
        <div style={{textAlign:"center",padding:"20px 0"}}>
          <p style={{color:T.red,fontSize:13,marginBottom:14}}>{error}</p>
          <button onClick={handleGenerate} style={{...btnPrimary,flex:"none",padding:"9px 20px"}}>↺ Try Again</button>
        </div>
      )}

      {variations && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {variations.map((v,i) => {
            const hColor = HOOK_TYPE_COLORS[v.hookType] || T.accent;
            return (
              <div key={i} style={{background:T.surf,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:11,fontWeight:800,color:hColor,textTransform:"uppercase",letterSpacing:"0.06em"}}>{v.hookType}</span>
                    <span style={{fontSize:11,color:T.muted}}>Variation {v.variation}</span>
                  </div>
                </div>
                {v.hook && (
                  <div style={{background:`${hColor}11`,border:`1px solid ${hColor}33`,borderRadius:6,padding:"7px 11px",marginBottom:10}}>
                    <span style={{fontSize:10,fontWeight:700,color:hColor,textTransform:"uppercase"}}>Hook</span>
                    <p style={{fontSize:13,color:T.text,margin:"3px 0 0",lineHeight:1.5,fontWeight:600}}>{v.hook}</p>
                  </div>
                )}
                <p style={{fontSize:14,lineHeight:1.7,color:T.text,margin:"0 0 8px"}}>{v.caption}</p>
                <p style={{fontSize:12,color:T.muted,margin:"0 0 12px"}}>{v.hashtags}</p>
                <button onClick={()=>onSelect(v)}
                  style={{width:"100%",background:BRAND_GRADIENT,border:"none",color:"#fff",borderRadius:7,padding:"9px",cursor:"pointer",fontSize:13,fontWeight:800}}>
                  ✓ Use This Version
                </button>
              </div>
            );
          })}
          <button onClick={handleGenerate} style={{...btnSecondary,flex:"none",marginTop:4}}>↺ Generate 3 More Variations</button>
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function ELEOSocialEngine() {
  const today  = new Date();
  const isMobile = useIsMobile();

  const [month,setMonth] = useState(today.getMonth());
  const [year, setYear]  = useState(today.getFullYear());
  const [posts,setPosts] = useState([]);
  const [view, setView]  = useState("calendar");
  const [brandConfig, setBrandConfig] = useState(DEFAULT_BRAND_CONFIG);
  const [brandAssets, setBrandAssets] = useState([]);

  // ── Load data from Supabase on mount ──
useEffect(() => {
    loadBrandConfig();
    loadPosts();
    loadBrandAssets();
  }, []);

  async function loadBrandConfig() {
    const { data } = await supabase.from('upsurge_brand_config').select('*').single();
    if (data) setBrandConfig({
      primaryOffer:    data.primary_offer,
      primaryCTA:      data.primary_cta,
      currentPromo:    data.current_promo,
      bookingLink:     data.booking_link,
      activeProtocols: data.active_protocols,
      targetCity:      data.target_city,
      doctorName:      data.doctor_name,
      clinicTagline:   data.clinic_tagline,
    });
  }

  async function loadPosts() {
    const { data } = await supabase.from('upsurge_posts').select('*').order('date', { ascending: true });
    if (data && data.length > 0) setPosts(data.map(p => ({
      id: p.id,
      date: new Date(p.date),
      platform: p.platform,
      pillar: p.pillar,
      status: p.status,
      caption: p.caption || '',
      hashtags: p.hashtags || '',
      hook: p.hook || '',
      suggestedImage: p.suggested_image || '',
      suggestedFormat: p.suggested_format || 'static',
      imageUrl: p.image_url || null,
      imageType: p.image_type || null,
      carouselUrls: p.carousel_urls || null,
      coverUrl: p.cover_url || null,
      voiceoverScript: p.voiceover_script || null,
      score: p.score || null,
      rejectNote: p.reject_note || null,
      imageGenerating: false,
    })));
  }
  async function loadBrandAssets() {
    const { data } = await supabase.from('upsurge_brand_assets').select('*');
    if (data) {
      setBrandAssets(data);
      BRAND_ASSETS = data.map(a => ({
        id: a.id,
        name: a.name,
        localPath: a.image_url || '',
        description: a.description || '',
        mediaType: a.media_type || 'image/png',
        usageTags: a.usage_tags || [],
        usageNotes: a.usage_notes || '',
        visualDescription: a.visual_description || ''
      }));
      console.log('BRAND_ASSETS loaded:', BRAND_ASSETS.length);
      window.__upsurgeAssets = BRAND_ASSETS;
    }
  }
  // ── Save brand config when it changes ──
  useEffect(() => {
    const timer = setTimeout(async () => {
      await supabase.from('upsurge_brand_config').update({
        primary_offer:    brandConfig.primaryOffer,
        primary_cta:      brandConfig.primaryCTA,
        current_promo:    brandConfig.currentPromo,
        booking_link:     brandConfig.bookingLink,
        active_protocols: brandConfig.activeProtocols,
        target_city:      brandConfig.targetCity,
        doctor_name:      brandConfig.doctorName,
        clinic_tagline:   brandConfig.clinicTagline,
        updated_at:       new Date().toISOString(),
      }).neq('id', '00000000-0000-0000-0000-000000000000');
    }, 1000);
    return () => clearTimeout(timer);
  }, [brandConfig]);

  // Image queue
  

  // Post modals
  const [editPost, setEditPost] = useState(null);
  const { enqueue, enqueueAll } = useImageQueue(posts, setPosts, brandConfig, setEditPost);
  const [editMode, setEditMode] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  // Variations modal
  const [variationsPost,  setVariationsPost]  = useState(null);

  // Bulk generate state
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // Reject
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote,   setRejectNote]   = useState("");

  // Quick-add
  const [quickDay,      setQuickDay]     = useState(null);
  const [quickMode,     setQuickMode]    = useState("ai");
  const [quickPlatform, setQuickPlatform]= useState("instagram");
  const [quickPillar,   setQuickPillar]  = useState("education");
  const [quickTopic,    setQuickTopic]   = useState("");
  const [quickCaption,  setQuickCaption] = useState("");
  const [quickHashtags, setQuickHashtags]= useState("");
  const [quickFormat, setQuickFormat] = useState("static");
  const [quickLoading,  setQuickLoading] = useState(false);
  const [quickResult,   setQuickResult]  = useState(null);

  // Monthly planner
  const [plannerOpen,    setPlannerOpen]   = useState(false);
  const [planStep,       setPlanStep]      = useState(1);
  const [planTotal,      setPlanTotal]     = useState(30);
  const [planTheme,      setPlanTheme]     = useState("");
  const [planActiveDays, setPlanActiveDays]= useState([1,2,3,4,5]);
  const [planPlatPcts,   setPlanPlatPcts]  = useState({instagram:40,facebook:30,linkedin:15,tiktok:15});
  const [planPillarPcts, setPlanPillarPcts]= useState({education:40,social_proof:30,lifestyle:20,offer:10});
  const [planPreview,    setPlanPreview]   = useState([]);
  const [planProgress,   setPlanProgress]  = useState(0);
  const [planError,      setPlanError]     = useState("");
  const [planMultiPlat,  setPlanMultiPlat] = useState(false);
  const [planDateMode,    setPlanDateMode]    = useState(false);
  const [planSelectedDates,setPlanSelectedDates]= useState([]);

  // Multi-platform generate
  const [genPillar,   setGenPillar]  = useState("education");
  const [genTopic,    setGenTopic]   = useState("");
  const [genFormats,  setGenFormats] = useState({instagram:"static",facebook:"static",tiktok:"reel"});
  const [genDate,     setGenDate]    = useState("");
  const [genLoading,  setGenLoading] = useState(false);
  const [genResults,  setGenResults] = useState(null);
  const [genError,    setGenError]   = useState("");
  const [genSelected, setGenSelected]= useState(new Set([0,1,2]));

  // Performance learning
  const topPerformers    = useMemo(()=>posts.filter(p=>p.score>=4&&p.status==="posted").slice(0,5),[posts]);
  const bottomPerformers = useMemo(()=>posts.filter(p=>((p.score<=2&&p.score!==null&&p.status==="posted")||(p.status==="rejected"&&p.rejectNote))).slice(0,3),[posts]);

  // Derived
  const monthPosts  = useMemo(()=>posts.filter(p=>p.date.getMonth()===month&&p.date.getFullYear()===year),[posts,month,year]);
  const draftPosts  = posts.filter(p=>["draft","pending","rejected"].includes(p.status));
  const postsOnDay  = d=>monthPosts.filter(p=>p.date.getDate()===d);

  // Nav
  const prevMonth=()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);};
  const nextMonth=()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);};

  // Post CRUD — Jake: add supabase.from('upsurge_posts').upsert(row) calls per Step 3e
const approvePost = async (id) => {
    const p = posts.find(x => x.id === id);
    if (p) await scheduleToGHL(p);
    await supabase.from('upsurge_posts').update({ status: 'scheduled', updated_at: new Date().toISOString() }).eq('id', id);
    setPosts(prev => prev.map(x => x.id === id ? { ...x, status: 'scheduled' } : x));
    if (editPost?.id === id) { setEditPost(null); setEditMode(false); }
  };

  const deletePost = async (id) => {
    await supabase.from('upsurge_posts').delete().eq('id', id);
    setPosts(prev => prev.filter(x => x.id !== id));
    setEditPost(null);
    setEditMode(false);
  };

  const savePost = async (updated) => {
    const row = {
      id:               updated.id,
      date:             updated.date.toISOString(),
      platform:         updated.platform,
      pillar:           updated.pillar,
      status:           updated.status,
      caption:          updated.caption,
      hashtags:         updated.hashtags || '',
      hook:             updated.hook || '',
      suggested_image:  updated.suggestedImage || '',
      suggested_format: updated.suggestedFormat || 'static',
      image_url:        updated.imageUrl || null,
      image_type:       updated.imageType || null,
      carousel_urls:    updated.carouselUrls || null,
      cover_url:        updated.coverUrl || null,
      voiceover_script: updated.voiceoverScript || null,
      score:            updated.score || null,
      reject_note:      updated.rejectNote || null,
      updated_at:       new Date().toISOString(),
    };
    await supabase.from('upsurge_posts').upsert(row);
    setPosts(prev => prev.map(x => x.id === updated.id ? updated : x));
    setEditPost(null);
    setEditMode(false);
  };

  const scorePost = async (id, score) => {
    await supabase.from('upsurge_posts').update({ score, updated_at: new Date().toISOString() }).eq('id', id);
    setPosts(prev => prev.map(x => x.id === id ? { ...x, score } : x));
  };

  // Generate (or regenerate) a branded reel cover: logo + hook + upsurgesupps.com
  const generateCover = async (post) => {
    if (!post.hook || !post.hook.trim()) { alert('Add a hook line first — the cover photo needs it.'); return; }
    setPosts(prev => prev.map(x => x.id === post.id ? { ...x, coverGenerating: true } : x));
    setEditPost(prev => prev && prev.id === post.id ? { ...prev, coverGenerating: true } : prev);
    try {
      const res = await fetch('/api/generate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, hook: post.hook, suggestedImage: post.suggestedImage, pillar: post.pillar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cover generation failed');
      setPosts(prev => prev.map(x => x.id === post.id ? { ...x, coverUrl: data.coverUrl, coverGenerating: false } : x));
      setEditPost(prev => prev && prev.id === post.id ? { ...prev, coverUrl: data.coverUrl, coverGenerating: false } : prev);
    } catch (e) {
      alert('Cover failed: ' + e.message);
      setPosts(prev => prev.map(x => x.id === post.id ? { ...x, coverGenerating: false } : x));
      setEditPost(prev => prev && prev.id === post.id ? { ...prev, coverGenerating: false } : prev);
    }
  };

  // Bulk image generation
  const handleBulkGenerate = () => {
    const postsNeedingImages = draftPosts.filter(p => !p.imageUrl && !p.imageGenerating);
    if (postsNeedingImages.length === 0) { alert("All posts already have images."); return; }
    setBulkGenerating(true);
    enqueueAll(postsNeedingImages.map(p => p.id));
    setTimeout(() => setBulkGenerating(false), 1000);
  };
// Send to Canva — opens Canva's TikTok editor with video URL copied to clipboard
  const sendToCanva = async (post) => {
    if (!post.imageUrl) {
      alert('Generate the video first before sending to Canva.');
      return;
    }
    try {
      // Open Canva FIRST while we still have user gesture context (avoids popup blocker)
      const canvaTab = window.open('https://www.canva.com/create/tiktok-videos/', '_blank');
      if (!canvaTab) {
        alert('Canva tab was blocked. Allow popups for this site and try again.');
        return;
      }
      // Copy video URL to clipboard so you can paste it into Canva's Uploads
      await navigator.clipboard.writeText(post.imageUrl);
      // Fetch the video as a blob and trigger a real download (not a navigation)
      const response = await fetch(post.imageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `upsurge-reel-${post.id}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      alert('✓ Video URL copied to clipboard\n✓ Video download started (check Downloads folder)\n✓ Canva opened in new tab\n\nIn Canva: Click "Uploads" in the left panel → drag the downloaded file in, then edit and download.');
    } catch (e) {
      console.error('Send to Canva failed:', e);
      alert('Something went wrong. Video URL (copy this manually): ' + post.imageUrl);
    }
  };
  // Reject
  const openReject    = post=>{setRejectTarget(post);setRejectNote("");};
  const confirmReject = ()=>{
    if(!rejectTarget) return;
    setPosts(prev=>prev.map(x=>x.id===rejectTarget.id?{...x,status:"rejected",rejectNote}:x));
    setRejectTarget(null);setRejectNote("");
    if(editPost?.id===rejectTarget.id) setEditPost(null);
  };

  // Regenerate rejected
  const regeneratePost = async post => {
    setPosts(prev=>prev.map(x=>x.id===post.id?{...x,imageGenerating:true}:x));
    try {
      const result = await generateOnePost({platform:post.platform,pillar:post.pillar,topic:post.rejectNote?`Avoid: ${post.rejectNote}`:"",rejectNote:post.rejectNote,brandConfig,topPerformers,bottomPerformers});
      setPosts(prev=>prev.map(x=>x.id===post.id?{...x,status:"pending",caption:result.caption,hashtags:result.hashtags,hook:result.hook,suggestedImage:result.suggestedImage,suggestedFormat:result.suggestedFormat,rejectNote:undefined,imageUrl:null,imageGenerating:false}:x));
    } catch(e){alert("Regeneration failed.");setPosts(prev=>prev.map(x=>x.id===post.id?{...x,imageGenerating:false}:x));}
  };

  // Quick-add
  const openQuickAdd=day=>{setQuickDay(day);setQuickMode("ai");setQuickPlatform("instagram");setQuickPillar("education");setQuickTopic("");setQuickCaption("");setQuickFormat("static");setQuickResult(null);};
  const handleQuickGen=async()=>{
    setQuickLoading(true);
    try{const r=await generateOnePost({platform:quickPlatform,pillar:quickPillar,topic:quickTopic,brandConfig,topPerformers,bottomPerformers});setQuickResult(r);setQuickCaption(r.caption);setQuickHashtags(r.hashtags);}
    catch(e){alert("Generation failed.");}
    setQuickLoading(false);
  };
const saveQuickPost = async () => {
    const rawDate = new Date(year, month, quickDay);
    const np = { id: uid(), date: applyOptimalTime(rawDate, quickPlatform), platform: quickPlatform, pillar: quickPillar, status: quickMode === "manual" ? "draft" : "pending", caption: quickCaption, hashtags: quickHashtags, hook: quickResult?.hook || "", suggestedImage: quickResult?.suggestedImage || "", suggestedFormat: quickFormat, voiceoverScript: quickResult?.voiceoverScript || "", voiceoverScript: quickResult?.voiceoverScript || "", score: null, imageUrl: null, imageGenerating: false };
    const row = {
      id: np.id,
      date: np.date.toISOString(),
      platform: np.platform,
      pillar: np.pillar,
      status: np.status,
      caption: np.caption,
      hashtags: np.hashtags || '',
      hook: np.hook || '',
      suggested_image: np.suggestedImage || '',
      suggested_format: np.suggestedFormat || 'static',
      image_url: null,
      image_type: null,
      score: null,
      reject_note: null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('upsurge_posts').upsert(row);
    setPosts(prev => [...prev, np]);
    setQuickDay(null);
  };

  // Planner
  const platTotal  =Object.values(planPlatPcts).reduce((a,b)=>a+b,0);
  const pillarTotal=Object.values(planPillarPcts).reduce((a,b)=>a+b,0);
  const toggleDay=d=>setPlanActiveDays(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d]);
  const toggleSelectedDate=d=>setPlanSelectedDates(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d]);
  const buildPreview=()=>{
    if(planDateMode){
      setPlanPreview(distributeByDates({selectedDays:planSelectedDates,pillarPcts:planPillarPcts}));
    } else {
      setPlanPreview(distributePosts({totalPosts:planTotal,platformPcts:planPlatPcts,pillarPcts:planPillarPcts,activeDays:planActiveDays,year,month}));
    }
    setPlanStep(2);
  };
  const runBatchGen=async()=>{
    console.log('runBatchGen started');
    const forceMultiPlat = planDateMode || planMultiPlat;
    if(!forceMultiPlat&&(platTotal!==100||pillarTotal!==100)){setPlanError("Both mixes must total 100%");return;}
    if(forceMultiPlat&&pillarTotal!==100){setPlanError("Pillar mix must total 100%");return;}
    setPlanError("");setPlanStep(3);setPlanProgress(0);

    if (forceMultiPlat) {
      // ── MULTI-PLATFORM MODE ──
      // Each slot is a topic, generate 3 platform versions per topic
      const allNewPosts = [];
      const chunkSize = 5; // fewer per chunk since each produces 3x posts
      const chunks = [];
      for(let i=0;i<planPreview.length;i+=chunkSize) chunks.push(planPreview.slice(i,i+chunkSize));

      for(let ci=0;ci<chunks.length;ci++){
        const chunk = chunks[ci];
        for (const slot of chunk) {
          try {
            const results = await generateMultiPlatform({
              pillar: slot.pillar,
              topic: planTheme ? `${planTheme} — ${slot.pillar} content` : '',
              formats: {instagram:"static",facebook:"static",tiktok:"reel"},
              brandConfig, topPerformers, bottomPerformers,
            });
            for (const r of results) {
              const d = applyOptimalTime(new Date(year,month,slot.day), r.platform);
              const newId = uid();
              allNewPosts.push({id:newId,date:d,platform:r.platform,pillar:slot.pillar,status:"pending",caption:r.caption||"",hashtags:r.hashtags||"",hook:r.hook||"",suggestedImage:r.suggestedImage||"",suggestedFormat:r.suggestedFormat||"static",voiceoverScript:r.voiceoverScript||"",score:null,imageUrl:null,imageGenerating:false});
            }
          } catch(e) {
            console.error('Multi-platform gen failed for slot:', slot, e.message);
          }
        }
        setPlanProgress(Math.round(((ci+1)/chunks.length)*100));
      }

      // Save all to Supabase
      console.log('Saving', allNewPosts.length, 'multi-platform posts to Supabase');
      for (const np of allNewPosts) {
        await supabase.from('upsurge_posts').upsert({
          id: np.id, date: np.date.toISOString(), platform: np.platform, pillar: np.pillar, status: np.status,
          caption: np.caption, hashtags: np.hashtags || '', hook: np.hook || '', suggested_image: np.suggestedImage || '',
          suggested_format: np.suggestedFormat || 'static', image_url: null, image_type: null, score: null,
          reject_note: null, updated_at: new Date().toISOString(),
        });
      }
      setPosts(prev=>[...prev.filter(p=>!(p.date.getMonth()===month&&p.date.getFullYear()===year&&["pending","draft"].includes(p.status))),...allNewPosts]);
      setPlanStep(4);

    } else {
      // ── STANDARD MODE (existing behavior) ──
      const chunkSize=10, chunks=[];
      for(let i=0;i<planPreview.length;i+=chunkSize) chunks.push(planPreview.slice(i,i+chunkSize));
      const allResults=[];
      for(let ci=0;ci<chunks.length;ci++){
        try{const r=await batchGenerateMonth({posts:chunks[ci].map((p,i)=>({...p,index:ci*chunkSize+i+1})),month,year,theme:planTheme,brandConfig,topPerformers,bottomPerformers});allResults.push(...r);setPlanProgress(Math.round(((ci+1)/chunks.length)*100));}
        catch(e){console.error('Batch failed:', e);setPlanError(`Batch ${ci+1} failed: ${e.message}`);setPlanStep(2);return;}
      }
      console.log('All batches done, allResults:', allResults.length);
      const newPosts=planPreview.map((slot,i)=>({id:uid(),date:applyOptimalTime(new Date(year,month,slot.day),slot.platform),platform:slot.platform,pillar:slot.pillar,status:"pending",caption:allResults[i]?.caption||"",hashtags:allResults[i]?.hashtags||"",hook:allResults[i]?.hook||"",suggestedImage:allResults[i]?.suggestedImage||"",suggestedFormat:allResults[i]?.suggestedFormat||"static",voiceoverScript:allResults[i]?.voiceoverScript||"",score:null,imageUrl:null,imageGenerating:false}));
      console.log('Saving', newPosts.length, 'posts to Supabase');
      for (const np of newPosts) {
        const { error } = await supabase.from('upsurge_posts').upsert({
          id: np.id, date: np.date.toISOString(), platform: np.platform, pillar: np.pillar, status: np.status,
          caption: np.caption, hashtags: np.hashtags || '', hook: np.hook || '', suggested_image: np.suggestedImage || '',
          suggested_format: np.suggestedFormat || 'static', image_url: null, image_type: null, score: null,
          reject_note: null, updated_at: new Date().toISOString(),
        });
        if (error) console.error('Supabase save error:', error);
      }
      setPosts(prev=>[...prev.filter(p=>!(p.date.getMonth()===month&&p.date.getFullYear()===year&&["pending","draft"].includes(p.status))),...newPosts]);
      setPlanStep(4);
    }
  };
  const closePlanner=()=>{setPlannerOpen(false);setPlanStep(1);setPlanError("");setPlanSelectedDates([]);setPlanDateMode(false);};

  // Multi-platform generate
  const handleGenerate=async()=>{
    const topicToUse = genTopic.trim() || '';
    setGenError("");setGenLoading(true);setGenResults(null);
    try{
      const results = await generateMultiPlatform({pillar:genPillar,topic:topicToUse,formats:genFormats,brandConfig,topPerformers,bottomPerformers});
      setGenResults(results);
      setGenSelected(new Set(results.map((_,i)=>i)));
    } catch(e){setGenError("Generation failed.");}
    setGenLoading(false);
  };
  const addStylePosts = async (newPosts) => {
    for (const p of newPosts) {
      const rawDate = new Date(year, month, Math.floor(Math.random() * 28) + 1);
      const d = applyOptimalTime(rawDate, p.platform);
      const newId = uid();
      const np = {
        id: newId,
        date: d,
        platform: p.platform,
        pillar: p.pillar,
        status: "pending",
        caption: p.caption,
        hashtags: p.hashtags || '',
        hook: p.hook || '',
        suggestedImage: p.suggestedImage || '',
        suggestedFormat: p.suggestedFormat || 'static',
        score: null,
        imageUrl: null,
        imageGenerating: false,
      };
      const row = {
        id: newId,
        date: d.toISOString(),
        platform: np.platform,
        pillar: np.pillar,
        status: np.status,
        caption: np.caption,
        hashtags: np.hashtags,
        hook: np.hook,
        suggested_image: np.suggestedImage,
        suggested_format: np.suggestedFormat,
        image_url: null,
        image_type: null,
        score: null,
        reject_note: null,
        updated_at: new Date().toISOString(),
      };
      await supabase.from('upsurge_posts').upsert(row);
      setPosts(prev => [...prev, np]);
    }
    setView("drafts");
  };

  const addGenToDrafts=async()=>{
    if(!genResults) return;
    const selected = genResults.filter((_,i)=>genSelected.has(i));
    for (const r of selected) {
      const rawDate = genDate?new Date(genDate+"T00:00:00"):new Date(year,month,Math.floor(Math.random()*28)+1);
      const d = applyOptimalTime(rawDate, r.platform);
      const newId = uid();
      const np = {id:newId,date:d,platform:r.platform,pillar:genPillar,status:"pending",caption:r.caption,hashtags:r.hashtags,hook:r.hook,suggestedImage:r.suggestedImage,suggestedFormat:r.suggestedFormat,voiceoverScript:r.voiceoverScript||"",score:null,imageUrl:null,imageGenerating:false};
      const row = {id:newId,date:d.toISOString(),platform:np.platform,pillar:np.pillar,status:np.status,caption:np.caption,hashtags:np.hashtags||'',hook:np.hook||'',suggested_image:np.suggestedImage||'',suggested_format:np.suggestedFormat||'static',image_url:null,image_type:null,score:null,reject_note:null,updated_at:new Date().toISOString()};
      await supabase.from('upsurge_posts').upsert(row);
      setPosts(prev=>[...prev,np]);
    }
    setGenResults(null);setGenTopic("");setGenDate("");setView("drafts");
  };

  // ── RENDER ──
  const navItems=[["📅 Calendar","calendar"],[`✏️ Drafts${draftPosts.length>0?` (${draftPosts.length})`:""}`, "drafts"],["⚡ Generate","generate"],["🎯 Style","style"],["📊 Analytics","analytics"],["⚙️ Config","config"],["🖼 Assets","assets"]];

  return (
    <div style={{fontFamily:"'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",background:T.bg,color:T.text,minHeight:"100vh",display:"flex",flexDirection:"column"}}>

      {/* Header */}
      <header style={{background:T.surf,borderBottom:`1px solid ${T.border}`,padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:52,flexShrink:0,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,background:BRAND_GRADIENT,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,color:"#fff",flexShrink:0}}>U</div>
          {!isMobile&&<span style={{fontWeight:700,fontSize:14,letterSpacing:"-0.4px",whiteSpace:"nowrap"}}>UpSurge Social Engine</span>}
          <span style={{fontSize:10,color:T.muted,background:T.surf2,padding:"2px 6px",borderRadius:4,fontWeight:600,whiteSpace:"nowrap"}}>V4</span>
        </div>
        <nav style={{display:"flex",gap:2}}>
          {navItems.map(([label,v])=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:isMobile?"6px 8px":"6px 11px",borderRadius:6,border:"none",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:600,background:view===v?T.accent:"transparent",color:view===v?T.bg:T.muted,transition:"all 0.15s",whiteSpace:"nowrap"}}>
              {isMobile?label.split(" ")[0]:label}
            </button>
          ))}
        </nav>
        <div style={{display:"flex",gap:6,alignItems:"center",fontSize:11,flexShrink:0}}>
          {topPerformers.length>0&&<span style={{color:T.green}}>📈 {topPerformers.length}</span>}
          {!isMobile&&<span style={{color:"#5EEBEB"}}>$0.07/img</span>}
        </div> 
        <button onClick={async ()=>{await supabase.auth.signOut();window.location.href='/login';}}
          style={{padding:"6px 13px",borderRadius:6,border:"1px solid #222235",cursor:"pointer",fontSize:12,fontWeight:600,background:"transparent",color:"#6B6B8A"}}>
          Sign Out
        </button>
      </header>

      <main style={{flex:1,padding:isMobile?12:20,maxWidth:1200,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>

        {/* ══ CALENDAR ══════════════════════════════════════════ */}
        {view==="calendar"&&(<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button onClick={prevMonth} style={navBtnStyle}>‹</button>
              <h2 style={{margin:0,fontSize:isMobile?17:21,fontWeight:700,letterSpacing:"-0.5px"}}>{MONTH_NAMES[month]} {year}</h2>
              <button onClick={nextMonth} style={navBtnStyle}>›</button>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {!isMobile&&<span style={{fontSize:13,color:T.muted}}>{monthPosts.length} posts</span>}
              <button onClick={()=>{setPlannerOpen(true);setPlanStep(1);}} style={{background:BRAND_GRADIENT,border:"none",color:"#fff",borderRadius:7,padding:isMobile?"7px 10px":"8px 14px",cursor:"pointer",fontSize:isMobile?11:13,fontWeight:800,whiteSpace:"nowrap"}}>
                {isMobile?"🗓 Plan":"🗓 Plan This Month"}
              </button>
            </div>
          </div>

          {/* Mobile: list view */}
          {isMobile ? (
            <MobilePostList
              posts={monthPosts}
              month={month}
              year={year}
              onPostClick={post=>{setEditPost({...post});setEditMode(false);setShowPrompt(false);}}
              onAddPost={()=>openQuickAdd(today.getDate())}
            />
          ) : (
            /* Desktop: calendar grid */
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
                {DAY_NAMES.map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:600,color:T.muted,letterSpacing:"0.06em",padding:"5px 0",textTransform:"uppercase"}}>{d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                {Array.from({length:firstDayOfMonth(year,month)}).map((_,i)=><div key={`e${i}`} style={{background:"#0D0D18",minHeight:100,borderRadius:5}}/>)}
                {Array.from({length:daysInMonth(year,month)}).map((_,i)=>{
                  const day=i+1, dayP=postsOnDay(day);
                  const isToday=today.getDate()===day&&today.getMonth()===month&&today.getFullYear()===year;
                  return (
                    <div key={day} style={{background:T.surf,minHeight:100,borderRadius:5,padding:6,border:isToday?`1px solid ${T.accent}`:`1px solid ${T.border}`,cursor:"pointer",position:"relative"}}
                      onClick={e=>{if(!e.target.closest("[data-post]")) openQuickAdd(day);}}>
                      <div style={{fontSize:11,fontWeight:isToday?700:400,color:isToday?T.accent:T.muted,marginBottom:4,pointerEvents:"none"}}>{day}</div>
                      {dayP.map(post=>{
                        const pil=pillarOf(post.pillar),plt=platformOf(post.platform);
                        const isRejected=post.status==="rejected";
                        return (
                          <div key={post.id} data-post="1"
                            onClick={e=>{e.stopPropagation();setEditPost({...post});setEditMode(false);setShowPrompt(false);}}
                            style={{background:isRejected?"#EF444411":post.imageUrl?`${pil.color}28`:`${pil.color}18`,border:`1px solid ${isRejected?"#EF444444":`${pil.color}44`}`,borderRadius:4,padding:"3px 6px",marginBottom:3,cursor:"pointer",position:"relative"}}>
                            {post.imageUrl&&<div style={{position:"absolute",top:2,right:3,width:5,height:5,borderRadius:"50%",background:BRAND_GRADIENT}}/>}
                            <div style={{fontSize:9,color:isRejected?T.red:pil.color,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.04em"}}>{plt.label}{isRejected?" ✕":""}</div>
                            <div style={{fontSize:10,color:"#A0A0C0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{post.caption.substring(0,36)}…</div>
                            {post.score&&<div style={{fontSize:9,color:T.accent}}>{"★".repeat(post.score)}</div>}
                          </div>
                        );
                      })}
                      {dayP.length===0&&<div style={{position:"absolute",bottom:5,right:7,fontSize:18,color:T.border,pointerEvents:"none"}}>+</div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>)}

        {/* ══ DRAFTS ════════════════════════════════════════════ */}
        {view==="drafts"&&(<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:8}}>
            <div>
              <h2 style={{margin:"0 0 4px",fontSize:21,fontWeight:700}}>Approval Queue</h2>
              <p style={{margin:0,fontSize:13,color:T.muted}}>Generate images, review, approve or reject before sending to GHL</p>
            </div>
            <div style={{display:"flex",gap:8}}>
              {/* Bulk generate button */}
              {draftPosts.filter(p=>!p.imageUrl).length > 0 && (
                <button onClick={handleBulkGenerate} disabled={bulkGenerating}
                  style={{background:bulkGenerating?"#1A1A2E":BRAND_GRADIENT,border:"none",color:bulkGenerating?T.muted:"#fff",borderRadius:7,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
                  {bulkGenerating?"⚡ Queuing…":`🖼 Generate All Images (${draftPosts.filter(p=>!p.imageUrl).length})`}
                </button>
              )}
              <button onClick={()=>setView("generate")} style={{background:T.accent,border:"none",color:T.bg,borderRadius:7,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:800,whiteSpace:"nowrap"}}>⚡ New Post</button>
            </div>
          </div>

          {draftPosts.filter(p=>p.imageGenerating).length > 0 && (
            <div style={{padding:"10px 14px",background:"#5EEBEB11",border:"1px solid #5EEBEB33",borderRadius:8,marginBottom:14}}>
              <p style={{fontSize:12,color:"#5EEBEB",margin:0}}>⚡ Sequential image queue running — generating one image at a time to stay within rate limits. {draftPosts.filter(p=>p.imageGenerating).length} in progress.</p>
            </div>
          )}

          {draftPosts.length===0?(
            <div style={{textAlign:"center",padding:80,color:T.muted}}>
              <div style={{fontSize:38,marginBottom:10}}>✨</div>
              <p style={{margin:0}}>Queue is empty. Use "Plan This Month" to generate your content calendar.</p>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {draftPosts.map(post=>{
                const pil=pillarOf(post.pillar),plt=platformOf(post.platform);
                const isRejected=post.status==="rejected";
                return (
                  <div key={post.id} style={{background:T.surf,border:`1px solid ${isRejected?"#EF444444":T.border}`,borderRadius:10,padding:isMobile?"12px":"14px 18px",display:"flex",gap:12,flexWrap:isMobile?"wrap":"nowrap"}}>
                    <div style={{width:4,alignSelf:"stretch",background:isRejected?T.red:pil.color,borderRadius:2,flexShrink:0}}/>
                    {/* Creative preview */}
                    <div style={{width:isMobile?"100%":140,flexShrink:0}}>
                      <CreativePreview post={post} onGenerate={()=>enqueue(post.id)} generating={post.imageGenerating} onGenerateCover={()=>generateCover(post)} coverGenerating={post.coverGenerating}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
                        {badge(plt.color,plt.label)}{badge(pil.color,pil.label)}
                        <span style={{fontSize:11,color:T.muted}}>{post.date.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                        {badge(STATUSES[post.status]?.color||T.muted,STATUSES[post.status]?.label)}
                        {post.suggestedFormat&&badge("#5EEBEB",post.suggestedFormat)}
                      </div>
                      {isRejected&&post.rejectNote&&<p style={{fontSize:12,color:T.red,margin:"0 0 8px",fontStyle:"italic"}}>✕ Rejected: "{post.rejectNote}"</p>}
                      <p style={{fontSize:14,lineHeight:1.65,color:T.text,margin:"0 0 6px"}}>{post.caption}</p>
                      <p style={{fontSize:12,color:T.muted,margin:0}}>{post.hashtags}</p>
                      <InlineHookEditor post={post} onSave={savePost} />
                      {post.suggestedImage&&<p style={{fontSize:11,color:"#5EEBEB",fontStyle:"italic",margin:"4px 0 0"}}>🖼 {post.suggestedImage}</p>}
              {post.voiceoverScript&&<p style={{fontSize:11,color:"#8B5CF6",fontStyle:"italic",margin:"4px 0 0"}}>🎙 {post.voiceoverScript}</p>}
                    </div>
                    <div style={{display:"flex",flexDirection:isMobile?"row":"column",gap:7,flexShrink:0,flexWrap:"wrap"}}>
                      {isRejected?(
                        <button onClick={()=>regeneratePost(post)} disabled={post.imageGenerating}
                          style={{background:BRAND_GRADIENT,border:"none",color:"#fff",borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
                          {post.imageGenerating?"…":"⚡ Regen"}
                        </button>
                      ):(
                        <button onClick={()=>approvePost(post.id)} style={{background:"#10B98122",border:"1px solid #10B98144",color:T.green,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>✓ Approve</button>
                      )}
                      {!isRejected&&<button onClick={()=>openReject(post)} style={{background:"#EF444411",border:"1px solid #EF444433",color:T.red,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>✕ Reject</button>}
                      {!isRejected&&<button onClick={()=>setVariationsPost(post)} style={{background:"#8B5CF611",border:"1px solid #8B5CF633",color:"#A78BFA",borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>≡ Variations</button>}
                      {!isRejected&&(post.suggestedFormat==="reel"||post.suggestedFormat==="story_video")&&post.imageUrl&&<button onClick={()=>sendToCanva(post)} style={{background:"#00C4CC11",border:"1px solid #00C4CC33",color:"#00C4CC",borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>🎨 Canva</button>}
                      <button onClick={()=>{setEditPost({...post});setEditMode(true);}} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:12}}>✎</button>
                      <button onClick={()=>deletePost(post.id)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>)}

        {/* ══ MULTI-PLATFORM GENERATE ═══════════════════════════ */}
        {view==="generate"&&(
          <div style={{maxWidth:720}}>
            <h2 style={{fontSize:21,fontWeight:700,marginBottom:6}}>Multi-Platform Generator</h2>
            <p style={{fontSize:13,color:T.muted,margin:"0 0 22px"}}>
              One topic → 3 platform-optimized posts. Each caption, hashtags, and hook tailored for Instagram, Facebook, and TikTok.
            </p>
            <div style={{marginBottom:16}}>
              <label style={lbl}>Pillar</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {PILLARS.map(p=><button key={p.id} onClick={()=>setGenPillar(p.id)} style={chipStyle(genPillar===p.id,p.color)}>{p.label}</button>)}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <label style={lbl}>Format per Platform</label>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[{id:"instagram",label:"Instagram",color:"#E1306C"},{id:"facebook",label:"Facebook",color:"#1877F2"},{id:"tiktok",label:"TikTok",color:"#69C9D0"}].map(plt=>(
                  <div key={plt.id} style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:13,color:plt.color,fontWeight:700,width:80}}>{plt.label}</span>
                    <div style={{display:"flex",gap:5}}>
                      {(plt.id==="tiktok"?[{id:"reel",label:"Reel"}]:[{id:"static",label:"Static"},{id:"carousel",label:"Carousel"},{id:"reel",label:"Reel"}]).map(f=>(
                        <button key={f.id} onClick={()=>setGenFormats(prev=>({...prev,[plt.id]:f.id}))} style={chipStyle(genFormats[plt.id]===f.id,"#5EEBEB")}>{f.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{marginBottom:14}}><label style={lbl}>Topic or Angle</label>
              <input value={genTopic} onChange={e=>setGenTopic(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleGenerate()} placeholder="e.g. peptide therapy benefits, low T warning signs, morning routine for optimal T..." style={{...inputStyle,width:"100%",boxSizing:"border-box"}}/></div>
            <div style={{marginBottom:22}}><label style={lbl}>Schedule Date (optional)</label>
              <input type="date" value={genDate} onChange={e=>setGenDate(e.target.value)} style={inputStyle}/></div>
            {genError&&<p style={{color:T.red,fontSize:13,marginBottom:10}}>{genError}</p>}
            <button onClick={handleGenerate} disabled={genLoading} style={{background:genLoading?"#1A1A2E":BRAND_GRADIENT,border:"none",color:genLoading?T.muted:"#fff",borderRadius:8,padding:"12px",cursor:genLoading?"default":"pointer",fontSize:14,fontWeight:800,width:"100%",marginBottom:22,transition:"all 0.2s"}}>
              {genLoading?"⚡ Generating 3 Platform Versions…":"⚡ Generate for Instagram + Facebook + TikTok"}
            </button>
            {genResults&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,fontWeight:800,color:"#10B981",textTransform:"uppercase",letterSpacing:"0.06em"}}>3 Platform Versions Generated</span>
                  <span style={{fontSize:12,color:T.muted}}>{genSelected.size} selected</span>
                </div>
                {genResults.map((r,i)=>{
                  const plt=platformOf(r.platform);
                  const isSelected=genSelected.has(i);
                  return (
                    <div key={i} onClick={()=>setGenSelected(prev=>{const n=new Set(prev);if(n.has(i))n.delete(i);else n.add(i);return n;})}
                      style={{background:T.surf,border:`1px solid ${isSelected?plt.color:T.border}`,borderRadius:10,padding:16,cursor:"pointer",transition:"border-color 0.15s"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${isSelected?plt.color:T.border}`,background:isSelected?plt.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700,flexShrink:0}}>{isSelected&&"✓"}</div>
                          {badge(plt.color,plt.label)}
                          {badge(pillarOf(genPillar).color,pillarOf(genPillar).label)}
                          {r.suggestedFormat&&badge("#5EEBEB",r.suggestedFormat)}
                        </div>
                      </div>
                      {r.hook&&(
                        <div style={{background:`${plt.color}11`,border:`1px solid ${plt.color}33`,borderRadius:6,padding:"7px 11px",marginBottom:10}}>
                          <span style={{fontSize:10,fontWeight:700,color:plt.color,textTransform:"uppercase"}}>Hook</span>
                          <p style={{fontSize:13,color:T.text,margin:"3px 0 0",lineHeight:1.5,fontWeight:600}}>{r.hook}</p>
                        </div>
                      )}
                      <p style={{fontSize:14,lineHeight:1.7,color:T.text,margin:"0 0 8px",whiteSpace:"pre-line"}}>{r.caption}</p>
                      <p style={{fontSize:12,color:T.muted,margin:"0 0 4px"}}>{r.hashtags}</p>
                      {r.suggestedImage&&<p style={{fontSize:11,color:"#5EEBEB",fontStyle:"italic",margin:"4px 0 0"}}>🖼 {r.suggestedImage}</p>}
                      {r.voiceoverScript&&<p style={{fontSize:11,color:"#8B5CF6",fontStyle:"italic",margin:"4px 0 0"}}>🎙 {r.voiceoverScript}</p>}
                    </div>
                  );
                })}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addGenToDrafts} disabled={genSelected.size===0}
                    style={{flex:2,background:genSelected.size>0?BRAND_GRADIENT:T.surf2,border:"none",color:genSelected.size>0?"#fff":T.muted,borderRadius:8,padding:"13px",cursor:"pointer",fontSize:14,fontWeight:800}}>
                    ✓ Add {genSelected.size} Post{genSelected.size!==1?"s":""} to Queue
                  </button>
                  <button onClick={handleGenerate} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:8,padding:"13px",cursor:"pointer",fontSize:13}}>↺ Regen All</button>
                </div>
              </div>
            )}
          </div>
        )}

        {view==="style"&&(
          <StyleReplicator
            brandConfig={brandConfig}
            brandAssets={BRAND_ASSETS}
            topPerformers={topPerformers}
            bottomPerformers={bottomPerformers}
            onAddPosts={addStylePosts}
            isMobile={isMobile}
          />
        )}
        {view==="analytics"&&<AnalyticsDashboard posts={posts}/>}
        {view==="config"&&<BrandConfigPanel config={brandConfig} onChange={setBrandConfig}/>}
        {view==="assets"&&<AssetLibrary brandConfig={brandConfig} assets={brandAssets} onAssetsChanged={loadBrandAssets}/>}
      </main>

      {/* ══ PLANNER MODAL ═════════════════════════════════════════ */}
      {plannerOpen&&(
        <Modal onClose={closePlanner} title={planStep===1?"Plan This Month":planStep===2?`Preview — ${planPreview.length} posts`:planStep===3?"Generating…":"Done ✓"}>
          {planStep===1&&(
            <div style={{display:"flex",flexDirection:"column",gap:18}}>
              <div style={{display:"flex",gap:6,background:T.surf,padding:4,borderRadius:8}}>
                <button onClick={()=>setPlanDateMode(false)} style={{flex:1,background:!planDateMode?T.accent:"transparent",color:!planDateMode?"#fff":T.muted,border:"none",borderRadius:6,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:700}}>Auto Schedule</button>
                <button onClick={()=>setPlanDateMode(true)} style={{flex:1,background:planDateMode?T.accent:"transparent",color:planDateMode?"#fff":T.muted,border:"none",borderRadius:6,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:700}}>Pick Specific Dates</button>
              </div>
              {planDateMode?(
                <>
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                      <label style={lbl}>Select Dates in {MONTH_NAMES[month]} {year}</label>
                      <span style={{fontSize:12,color:planSelectedDates.length>0?T.accent:T.muted,fontWeight:700}}>{planSelectedDates.length} date{planSelectedDates.length===1?"":"s"} → {planSelectedDates.length*3} posts</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,background:T.surf,padding:8,borderRadius:8}}>
                      {DAY_NAMES.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:600,color:T.muted,padding:"4px 0"}}>{d}</div>)}
                      {Array.from({length:firstDayOfMonth(year,month)}).map((_,i)=><div key={`e${i}`}/>)}
                      {Array.from({length:daysInMonth(year,month)}).map((_,i)=>{
                        const d=i+1;
                        const sel=planSelectedDates.includes(d);
                        return(
                          <button key={d} onClick={()=>toggleSelectedDate(d)} style={{aspectRatio:"1",border:`1px solid ${sel?T.accent:T.border}`,background:sel?`${T.accent}33`:"transparent",color:sel?T.accent:T.text,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:sel?700:500}}>{d}</button>
                        );
                      })}
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:8}}>
                      <button onClick={()=>setPlanSelectedDates(Array.from({length:daysInMonth(year,month)},(_,i)=>i+1))} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Select All</button>
                      <button onClick={()=>setPlanSelectedDates([])} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Clear</button>
                    </div>
                  </div>
                  <div style={{padding:"10px 12px",background:"#5EEBEB11",border:`1px solid #5EEBEB33`,borderRadius:8}}>
                    <p style={{fontSize:12,fontWeight:700,color:"#5EEBEB",margin:0}}>3-Platform Mode (auto)</p>
                    <p style={{fontSize:11,color:T.muted,margin:"2px 0 0"}}>Each selected date gets 1 Instagram + 1 Facebook + 1 TikTok post.</p>
                  </div>
                </>
              ):(
                <>
                  <div>
                    <label style={lbl}>Total Posts This Month</label>
                    <div style={{display:"flex",alignItems:"center",gap:14}}>
                      <input type="range" min={5} max={60} step={1} value={planTotal} onChange={e=>setPlanTotal(Number(e.target.value))} style={{flex:1}}/>
                      <span style={{fontSize:24,fontWeight:700,color:T.accent,minWidth:36}}>{planTotal}</span>
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Post on Days</label>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {DAY_NAMES.map((d,i)=>(
                        <button key={d} onClick={()=>toggleDay(i)} style={{width:38,height:38,borderRadius:6,border:`1px solid ${planActiveDays.includes(i)?T.accent:T.border}`,background:planActiveDays.includes(i)?`${T.accent}22`:"transparent",color:planActiveDays.includes(i)?T.accent:T.muted,cursor:"pointer",fontSize:12,fontWeight:600}}>{d}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><label style={lbl}>Platform Mix</label><span style={{fontSize:12,color:platTotal===100?T.green:T.red,fontWeight:600}}>{platTotal}%{platTotal!==100?" ≠ 100%":" ✓"}</span></div>
                    {PLATFORMS.map(p=>(
                      <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                        <span style={{fontSize:13,color:T.text,width:80}}>{p.label}</span>
                        <input type="range" min={0} max={100} step={5} value={planPlatPcts[p.id]} onChange={e=>setPlanPlatPcts(v=>({...v,[p.id]:Number(e.target.value)}))} style={{flex:1}}/>
                        <input type="number" min={0} max={100} value={planPlatPcts[p.id]} onChange={e=>setPlanPlatPcts(v=>({...v,[p.id]:Math.max(0,Math.min(100,Number(e.target.value)))}))} style={{width:44,background:T.surf,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 6px",color:T.text,fontSize:13,textAlign:"center"}}/>
                        <span style={{fontSize:12,color:T.muted}}>%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><label style={lbl}>Pillar Mix</label><span style={{fontSize:12,color:pillarTotal===100?T.green:T.red,fontWeight:600}}>{pillarTotal}%{pillarTotal!==100?" ≠ 100%":" ✓"}</span></div>
                {PILLARS.map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                    <span style={{fontSize:13,color:T.text,width:80}}>{p.label}</span>
                    <input type="range" min={0} max={100} step={5} value={planPillarPcts[p.id]} onChange={e=>setPlanPillarPcts(v=>({...v,[p.id]:Number(e.target.value)}))} style={{flex:1}}/>
                    <input type="number" min={0} max={100} value={planPillarPcts[p.id]} onChange={e=>setPlanPillarPcts(v=>({...v,[p.id]:Math.max(0,Math.min(100,Number(e.target.value)))}))} style={{width:44,background:T.surf,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 6px",color:T.text,fontSize:13,textAlign:"center"}}/>
                    <span style={{fontSize:12,color:T.muted}}>%</span>
                  </div>
                ))}
              </div>
              <div><label style={lbl}>Monthly Theme (optional)</label>
                <input value={planTheme} onChange={e=>setPlanTheme(e.target.value)} placeholder="e.g. New Year reset, summer performance, peptide spotlight…" style={{...inputStyle,width:"100%",boxSizing:"border-box"}}/></div>
              {!planDateMode&&(
                <div style={{padding:"12px 14px",background:planMultiPlat?"#5EEBEB11":"transparent",border:`1px solid ${planMultiPlat?"#5EEBEB33":T.border}`,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10}} onClick={()=>setPlanMultiPlat(v=>!v)}>
                  <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${planMultiPlat?"#5EEBEB":T.border}`,background:planMultiPlat?"#5EEBEB":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700,flexShrink:0}}>{planMultiPlat&&"✓"}</div>
                  <div>
                    <p style={{fontSize:13,fontWeight:700,color:planMultiPlat?"#5EEBEB":T.text,margin:0}}>Multi-Platform Mode</p>
                    <p style={{fontSize:11,color:T.muted,margin:"2px 0 0"}}>Each topic → 3 posts (Instagram + Facebook + TikTok). Platform mix is ignored — every topic gets all 3 platforms. Total posts = {planTotal} topics × 3 = {planTotal*3} posts.</p>
                  </div>
                </div>
              )}
              {planError&&<p style={{color:T.red,fontSize:13,margin:0}}>{planError}</p>}
              {(() => {
                const ok = planDateMode
                  ? (pillarTotal===100 && planSelectedDates.length>0)
                  : (planMultiPlat
                      ? (pillarTotal===100 && planActiveDays.length>0)
                      : (platTotal===100 && pillarTotal===100 && planActiveDays.length>0));
                return (
                  <button onClick={buildPreview} disabled={!ok}
                    style={{background:ok?BRAND_GRADIENT:T.surf2,border:"none",color:ok?"#fff":T.muted,borderRadius:8,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:800}}>
                    Preview Schedule →
                  </button>
                );
              })()}
            </div>
          )}
          {planStep===2&&(
            <div>
              <p style={{fontSize:13,color:T.muted,marginTop:0,marginBottom:10}}>{planPreview.length} posts across {MONTH_NAMES[month]}. Images generated separately via sequential queue after approval.</p>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {PLATFORMS.map(p=>{const cnt=planPreview.filter(x=>x.platform===p.id).length;return cnt?<span key={p.id} style={{background:`${p.color}22`,color:p.color,fontSize:12,fontWeight:600,padding:"4px 10px",borderRadius:5}}>{p.label}: {cnt}</span>:null;})}
              </div>
              <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:4,marginBottom:16}}>
                {planPreview.map((p,i)=>{const pil=pillarOf(p.pillar),plt=platformOf(p.platform);return(
                  <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 8px",background:T.surf,borderRadius:5}}>
                    <span style={{fontSize:12,color:T.muted,width:52}}>{MONTH_NAMES[month].slice(0,3)} {p.day}</span>
                    <span style={{fontSize:11,color:plt.color,fontWeight:700,width:72}}>{plt.label}</span>
                    <span style={{fontSize:11,color:pil.color,background:`${pil.color}18`,padding:"2px 7px",borderRadius:4}}>{pil.label}</span>
                  </div>
                );})}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setPlanStep(1)} style={btnSecondary}>← Back</button>
                <button onClick={runBatchGen} style={{...btnPrimary,flex:2,background:BRAND_GRADIENT,color:"#fff"}}>⚡ Generate All {planPreview.length} Posts</button>
              </div>
            </div>
          )}
          {planStep===3&&(
            <div style={{textAlign:"center",padding:"28px 0"}}>
              <div style={{fontSize:38,marginBottom:14}}>⚡</div>
              <p style={{fontSize:15,fontWeight:600,color:T.text,margin:"0 0 8px"}}>Generating {planPreview.length} posts…</p>
              <p style={{fontSize:13,color:T.muted,margin:"0 0 22px"}}>Claude is writing brand-intelligent content for your entire month.</p>
              <div style={{background:T.surf2,borderRadius:20,height:8,overflow:"hidden"}}>
                <div style={{height:"100%",background:BRAND_GRADIENT_H,borderRadius:20,width:`${planProgress}%`,transition:"width 0.5s ease"}}/>
              </div>
              <p style={{fontSize:12,color:T.muted,marginTop:8}}>{planProgress}%</p>
            </div>
          )}
          {planStep===4&&(
            <div style={{textAlign:"center",padding:"18px 0"}}>
              <div style={{fontSize:44,marginBottom:14}}>🎉</div>
              <p style={{fontSize:16,fontWeight:700,color:T.text,margin:"0 0 8px"}}>{planPreview.length} posts ready for review</p>
              <p style={{fontSize:13,color:T.muted,margin:"0 0 22px"}}>Go to Approval Queue → use "Generate All Images" to queue all images sequentially.</p>
              <div style={{display:"flex",gap:8}}>
                <button onClick={closePlanner} style={btnSecondary}>Back to Calendar</button>
                <button onClick={()=>{closePlanner();setView("drafts");}} style={{...btnPrimary,background:BRAND_GRADIENT,color:"#fff"}}>Review Queue →</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ══ POST DETAIL / EDIT ════════════════════════════════════ */}
      {editPost&&(
        <Modal onClose={()=>{setEditPost(null);setEditMode(false);setShowPrompt(false);}} title={editMode?"Edit Post":showPrompt?"Prompt Inspector":"Post Detail"} width={600}>
          {!editMode&&!showPrompt?(
            <div>
              <div style={{display:"flex",gap:7,marginBottom:10,flexWrap:"wrap"}}>
                {badge(platformOf(editPost.platform).color,platformOf(editPost.platform).label)}
                {badge(pillarOf(editPost.pillar).color,pillarOf(editPost.pillar).label)}
                {badge(STATUSES[editPost.status]?.color||T.muted,STATUSES[editPost.status]?.label)}
                {editPost.suggestedFormat&&badge("#5EEBEB",editPost.suggestedFormat)}
              </div>
              <p style={{fontSize:12,color:T.muted,margin:"0 0 12px"}}>{editPost.date.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p>
              {editPost.rejectNote&&<p style={{fontSize:12,color:T.red,margin:"0 0 10px",fontStyle:"italic"}}>✕ Rejected: "{editPost.rejectNote}"</p>}
              <div style={{marginBottom:14}}>
                <CreativePreview post={editPost} onGenerate={()=>enqueue(editPost.id)} generating={posts.find(p=>p.id===editPost.id)?.imageGenerating||false} onGenerateCover={()=>generateCover(editPost)} coverGenerating={posts.find(p=>p.id===editPost.id)?.coverGenerating||false}/>
              </div>
              <p style={{fontSize:14,lineHeight:1.7,color:T.text,margin:"0 0 10px"}}>{editPost.caption}</p>
              <p style={{fontSize:12,color:T.muted,margin:"0 0 8px"}}>{editPost.hashtags}</p>
              <InlineHookEditor post={editPost} onSave={(updated) => { savePost(updated); setEditPost(updated); }} />
              {editPost.suggestedImage&&<p style={{fontSize:12,color:"#5EEBEB",fontStyle:"italic",margin:"0 0 12px"}}>🖼 {editPost.suggestedImage}</p>}
              {editPost.status==="posted"&&(
                <div style={{padding:"10px 12px",background:T.surf,borderRadius:7,marginBottom:14}}>
                  <p style={{fontSize:12,color:T.muted,margin:"0 0 6px"}}>Rate performance (feeds into future prompts):</p>
                  <StarRating score={editPost.score} onChange={score=>{scorePost(editPost.id,score);setEditPost(p=>({...p,score}));}} size={20}/>
                </div>
              )}
              <div style={{display:"flex",gap:7,marginTop:12,flexWrap:"wrap"}}>
                {(editPost.status==="draft"||editPost.status==="pending")&&(<>
                  <button onClick={()=>approvePost(editPost.id)} style={{flex:1,background:"#10B98122",border:"1px solid #10B98144",color:T.green,borderRadius:7,padding:"9px",cursor:"pointer",fontSize:13,fontWeight:700}}>✓ Approve → GHL</button>
                  <button onClick={()=>{openReject(editPost);setEditPost(null);}} style={{flex:1,background:"#EF444411",border:"1px solid #EF444433",color:T.red,borderRadius:7,padding:"9px",cursor:"pointer",fontSize:13,fontWeight:700}}>✕ Reject</button>
                </>)}
                {editPost.status==="scheduled"&&(
                  <button onClick={async()=>{await supabase.from('upsurge_posts').update({status:'posted',updated_at:new Date().toISOString()}).eq('id',editPost.id);setPosts(prev=>prev.map(x=>x.id===editPost.id?{...x,status:'posted'}:x));setEditPost(prev=>({...prev,status:'posted'}));}} style={{flex:1,background:"#10B98122",border:"1px solid #10B98144",color:T.green,borderRadius:7,padding:"9px",cursor:"pointer",fontSize:13,fontWeight:700}}>✓ Mark as Posted</button>
                )}
                {editPost.status==="rejected"&&(
                  <button onClick={()=>{regeneratePost(editPost);setEditPost(null);}} style={{flex:2,background:BRAND_GRADIENT,border:"none",color:"#fff",borderRadius:7,padding:"9px",cursor:"pointer",fontSize:13,fontWeight:800}}>⚡ Regenerate</button>
                )}
                <button onClick={()=>setEditMode(true)} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:7,padding:"9px",cursor:"pointer",fontSize:13}}>✎ Edit</button>
                <button onClick={()=>setShowPrompt(true)} style={{flex:1,background:"transparent",border:"1px solid #5EEBEB44",color:"#5EEBEB",borderRadius:7,padding:"9px",cursor:"pointer",fontSize:13}}>🔍 Prompt</button>
                {(editPost.suggestedFormat==="reel"||editPost.suggestedFormat==="story_video")&&editPost.imageUrl&&<button onClick={()=>sendToCanva(editPost)} style={{flex:1,background:"#00C4CC11",border:"1px solid #00C4CC33",color:"#00C4CC",borderRadius:7,padding:"9px",cursor:"pointer",fontSize:13,fontWeight:700}}>🎨 Canva</button>}
                <button onClick={()=>deletePost(editPost.id)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:7,padding:"9px 12px",cursor:"pointer",fontSize:13}}>🗑</button>
              </div>
            </div>
          ):editMode?(
            <EditPostForm post={editPost} onSave={savePost} onCancel={()=>setEditMode(false)}/>
          ):(
            <div>
              <button onClick={()=>setShowPrompt(false)} style={{...btnSecondary,marginBottom:16,flex:"none"}}>← Back</button>
              <div style={{marginTop:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#5EEBEB",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                    {(editPost.suggestedFormat==="reel"||editPost.suggestedFormat==="story_video")?"Video Prompt":"Image Prompt"} — grok-imagine-{(editPost.suggestedFormat==="reel"||editPost.suggestedFormat==="story_video")?"video":"image-pro"}
                  </span>
                  <button onClick={()=>{
                    const assetId=extractAssetId(editPost.suggestedImage);
                    const isVideo=editPost.suggestedFormat==="reel";
                    const prompt=isVideo?buildVideoPrompt(editPost.platform,editPost.pillar,editPost.suggestedImage,brandConfig):buildImagePrompt(editPost.platform,editPost.pillar,editPost.suggestedImage,assetId,brandConfig,editPost.hook,'',editPost.caption);
                    navigator.clipboard.writeText(prompt);
                  }} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:5,padding:"4px 8px",cursor:"pointer",fontSize:11}}>Copy</button>
                </div>
                <pre style={{fontSize:11,color:"#8888BB",background:"#0A0A14",padding:12,borderRadius:6,overflow:"auto",maxHeight:320,lineHeight:1.6,whiteSpace:"pre-wrap",margin:0}}>
                  {(()=>{const assetId=extractAssetId(editPost.suggestedImage);const isVideo=editPost.suggestedFormat==="reel";return isVideo?buildVideoPrompt(editPost.platform,editPost.pillar,editPost.suggestedImage,brandConfig):buildImagePrompt(editPost.platform,editPost.pillar,editPost.suggestedImage,assetId,brandConfig,editPost.hook,'',editPost.caption);})()}
                </pre>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ══ REJECT MODAL ══════════════════════════════════════════ */}
      {rejectTarget&&(
        <Modal onClose={()=>setRejectTarget(null)} title="Reject Post">
          <p style={{fontSize:14,color:T.text,margin:"0 0 6px"}}>{rejectTarget.caption.substring(0,80)}…</p>
          <p style={{fontSize:13,color:T.muted,margin:"0 0 18px"}}>Add a rejection note — injected into both the Claude AND Grok prompts on regeneration.</p>
          <div style={{marginBottom:18}}>
            <label style={lbl}>What's wrong with this post?</label>
            <textarea value={rejectNote} onChange={e=>setRejectNote(e.target.value)} rows={3}
              placeholder="e.g. Too salesy / Hook didn't grab me / Wrong image direction — try a product macro / Tone wrong for LinkedIn"
              style={{...inputStyle,width:"100%",boxSizing:"border-box",resize:"vertical"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setRejectTarget(null)} style={btnSecondary}>Cancel</button>
            <button onClick={confirmReject} style={{...btnPrimary,background:T.red,color:"#fff"}}>✕ Confirm Reject</button>
          </div>
        </Modal>
      )}

      {/* ══ QUICK-ADD MODAL ═══════════════════════════════════════ */}
      {quickDay!==null&&(
        <Modal onClose={()=>setQuickDay(null)} title={`Add Post — ${MONTH_NAMES[month]} ${quickDay}`}>
          <div style={{display:"flex",gap:6,marginBottom:18}}>
            {[["ai","⚡ AI Generate"],["manual","✎ Manual"]].map(([mode,label])=>(
              <button key={mode} onClick={()=>{setQuickMode(mode);setQuickResult(null);}} style={{flex:1,padding:"8px",borderRadius:7,border:`1px solid ${quickMode===mode?T.accent:T.border}`,background:quickMode===mode?`${T.accent}22`:"transparent",color:quickMode===mode?T.accent:T.muted,cursor:"pointer",fontSize:13,fontWeight:600}}>{label}</button>
            ))}
          </div>
          <div style={{marginBottom:14}}><label style={lbl}>Platform</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{PLATFORMS.map(p=><button key={p.id} onClick={()=>setQuickPlatform(p.id)} style={chipStyle(quickPlatform===p.id,p.color)}>{p.label}</button>)}</div></div>
          <div style={{marginBottom:16}}><label style={lbl}>Pillar</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{PILLARS.map(p=><button key={p.id} onClick={()=>setQuickPillar(p.id)} style={chipStyle(quickPillar===p.id,p.color)}>{p.label}</button>)}</div></div>
          {quickMode==="ai"&&!quickResult&&(<>
            <div style={{marginBottom:14}}><label style={lbl}>Topic (optional)</label>
              <input value={quickTopic} onChange={e=>setQuickTopic(e.target.value)} placeholder="e.g. testosterone and sleep quality…" style={{...inputStyle,width:"100%",boxSizing:"border-box"}}/></div>
            <button onClick={handleQuickGen} disabled={quickLoading} style={{width:"100%",background:quickLoading?"#1A1A2E":BRAND_GRADIENT,border:"none",color:quickLoading?T.muted:"#fff",borderRadius:8,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:800}}>
              {quickLoading?"Generating…":"⚡ Generate"}
            </button>
          </>)}
          {(quickMode==="manual"||quickResult)&&(<>
          <div style={{marginBottom:14}}><label style={lbl}>Format</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{[{id:"static",label:"Static Image"},{id:"carousel",label:"Carousel"},{id:"reel",label:"Video/Reel"}].map(f=><button key={f.id} onClick={()=>setQuickFormat?.(f.id)} style={chipStyle(quickFormat===f.id,"#5EEBEB")}>{f.label}</button>)}</div></div>
            <div style={{marginBottom:12}}><label style={lbl}>Caption</label>
              <textarea value={quickCaption} onChange={e=>setQuickCaption(e.target.value)} rows={4} style={{...inputStyle,width:"100%",boxSizing:"border-box",resize:"vertical"}}/></div>
            <div style={{marginBottom:16}}><label style={lbl}>Hashtags</label>
              <input value={quickHashtags} onChange={e=>setQuickHashtags(e.target.value)} style={{...inputStyle,width:"100%",boxSizing:"border-box"}}/></div>
            <button onClick={saveQuickPost} disabled={!quickCaption.trim()} style={{width:"100%",background:quickCaption.trim()?BRAND_GRADIENT:T.surf2,border:"none",color:quickCaption.trim()?"#fff":T.muted,borderRadius:8,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:800}}>
              + Add to Calendar
            </button>
          </>)}
        </Modal>
      )}

      {/* ══ VARIATIONS MODAL ══════════════════════════════════════ */}
      {variationsPost && (
        <VariationsModal
          post={variationsPost}
          brandConfig={brandConfig}
          topPerformers={topPerformers}
          bottomPerformers={bottomPerformers}
          onClose={() => setVariationsPost(null)}
          onSelect={(variation) => {
            setPosts(prev => prev.map(p => p.id === variationsPost.id
              ? { ...p, caption: variation.caption, hashtags: variation.hashtags, hook: variation.hook, imageUrl: null }
              : p
            ));
            setVariationsPost(null);
          }}
        />
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────
const inputStyle   = { background:T.surf, border:`1px solid ${T.border}`, borderRadius:7, padding:"9px 12px", color:T.text, fontSize:13, outline:"none" };
const selectStyle  = { width:"100%", background:T.surf, border:`1px solid ${T.border}`, borderRadius:7, padding:"9px 10px", color:T.text, fontSize:13 };
const btnPrimary   = { flex:1, background:T.accent, border:"none", color:T.bg, borderRadius:8, padding:"10px", cursor:"pointer", fontSize:14, fontWeight:800 };
const btnSecondary = { flex:1, background:"transparent", border:`1px solid ${T.border}`, color:T.muted, borderRadius:8, padding:"10px", cursor:"pointer", fontSize:13 };
const navBtnStyle  = { background:T.surf, border:`1px solid ${T.border}`, color:T.text, borderRadius:6, width:30, height:30, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" };
