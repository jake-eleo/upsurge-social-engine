// ================================================================
// BRAND CONFIG — UpSurge Supplements
// ----------------------------------------------------------------
// Single source of truth for brand-specific values. To rebrand this
// app for a different business, edit THIS file (and the Supabase
// table/bucket names + env vars per SUPABASE_SETUP.sql / ENV_TEMPLATE.txt).
// Colors were sampled from the UpSurge logo (cyan→violet wordmark gradient).
// ================================================================

// ── Accent colors (sampled from logo) ─────────────────────────────
const PRIMARY = '#5EEBEB';   // electric aqua / bright cyan (left of wordmark)
const SECONDARY = '#C983F3'; // vivid violet / purple (right of wordmark)

const COLORS = {
  bg:        '#0B0B14', // near-black app background
  surface:   '#13131F', // card / panel surface
  surface2:  '#1A1A2E', // raised surface / hover
  border:    '#222235', // hairline borders
  text:      '#E0E0EC', // primary text
  muted:     '#6B6B8A', // secondary / muted text
  primary:   PRIMARY,   // primary accent
  secondary: SECONDARY, // secondary accent
  // convenience gradients derived from the two accents
  gradient:   `linear-gradient(135deg, ${PRIMARY}, ${SECONDARY})`,
  gradientH:  `linear-gradient(90deg, ${PRIMARY}, ${SECONDARY})`,
};

export const BRAND = {
  // ── Identity ────────────────────────────────────────────────────
  identity: {
    name:         'UpSurge Supplements',
    shortName:    'UpSurge',
    tagline:      'Fuel Your Fitness Goals',
    positioning:  'Elevate Your Performance',
    website:      'https://upsurgesupps.com',
    shopUrl:      'https://upsurgesupps.com/collections/all',
    supportEmail: 'contact@upsurgesupps.com',
    socials: {
      facebook:  'https://facebook.com/upsurgesupps',
      instagram: 'https://instagram.com/upsurgesupps',
      tiktok:    'https://tiktok.com/@upsurgesupps',
    },
    // Real trust signals — safe to feature in marketing.
    trustSignals: ['USA-made', 'GMP-certified', 'FDA-registered facility'],
  },

  // ── Colors ──────────────────────────────────────────────────────
  colors: COLORS,

  // ── Audience ────────────────────────────────────────────────────
  targetAudience:
    'Fitness-focused adults 18+, both men and women, who work out and want more ' +
    'energy, better recovery, fat loss, sharper focus, and overall health. Unisex — ' +
    'speak to anyone who trains and cares about how they feel and perform.',

  // ── Voice ───────────────────────────────────────────────────────
  // Flex across these four tones depending on the content/pillar.
  voiceModes: ['energetic', 'scientific', 'premium', 'budget-friendly'],
  voiceGuidance:
    'Flex the tone to fit the post: ENERGETIC for hype/lifestyle/offers (punchy, ' +
    'motivating, gym-floor energy), SCIENTIFIC for education (clear, credible, ' +
    'ingredient-led — no jargon dumps), PREMIUM for product spotlights and brand ' +
    'moments (clean, confident, quality-forward), and BUDGET-FRIENDLY for value ' +
    'messaging (bundles, free shipping, "more for your money"). Always inclusive and ' +
    'gender-neutral. No bro-culture, no medical/clinical authority, no "Dr." persona.',

  // ── Compliance ──────────────────────────────────────────────────
  complianceType: 'supplement', // drives FTC/FDA supplement marketing rules in prompts

  // ── Feature flags ───────────────────────────────────────────────
  genderAware:    false,    // UpSurge is unisex — single palette, gender-neutral subjects
  videoProvider:  'grok',   // 'grok' = Grok enhanced pipeline (no HeyGen)
  scheduling:     'stub',   // 'stub' = approval marks "scheduled" locally, no external posting

  // ── Products ────────────────────────────────────────────────────
  products: [
    { name: 'Up-Fuel',      category: 'Pre/Intra Workout',        description: 'Preworkout for energy, pumps, and focus before training.' },
    { name: 'Amino-Surge',  category: 'Pre/Intra Workout',        description: 'BCAAs to support muscle recovery and intra-workout endurance.' },
    { name: 'Pulse',        category: 'Weight Loss / Fat Burners', description: 'Natural energy with fat-burning support.' },
    { name: 'ThermoSurge',  category: 'Weight Loss / Fat Burners', description: 'Intense thermogenic fat burner with focus support.' },
    { name: 'DreamSlim',    category: 'Weight Loss / Fat Burners', description: 'Nighttime fat burner with sleep support.' },
    { name: 'Shroom-Surge', category: 'Overall Health',           description: 'Mushroom nootropic for focus and energy.' },
    { name: 'Weight Loss Bundle', category: 'Bundles',            description: 'Bundle of fat-loss support products at a value price.' },
    { name: 'Workout Bundle',     category: 'Bundles',            description: 'Bundle of training-day essentials at a value price.' },
  ],

  // ── Product categories ──────────────────────────────────────────
  productCategories: [
    'Pre/Intra Workout',
    'Weight Loss / Fat Burners',
    'Overall Health',
    'Bundles',
  ],
};

export default BRAND;
