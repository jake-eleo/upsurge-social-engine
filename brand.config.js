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
  // Auto-synced from the live upsurgesupps.com catalog (Shopify products.json).
  // `does` = what it supports (structure/function language); `ingredients` = key
  // actives/dosages pulled from the product descriptions. To refresh after a
  // product/reformulation change, re-pull products.json and regenerate this list.
  products: [
    // ── Pre / Intra Workout ──
    { name: 'Up-Fuel', category: 'Pre/Intra Workout',
      does: 'Pre-workout powder to support energy, endurance, focus, and pumps before training.',
      ingredients: '150mg Caffeine, 1,500mg Creatine Malate, Beta-Alanine, L-Arginine AKG, 550mg matrix (L-Taurine, Betaine Anhydrous, L-Citrulline Malate, Glycine, Tyrosine), B12/B6/Folate/Magnesium' },
    { name: 'Surge', category: 'Pre/Intra Workout',
      does: 'Capsule pre-workout to support nitric oxide, blood flow, pumps, and endurance (no powder).',
      ingredients: '400mg L-Arginine + 400mg L-Arginine AKG, 200mg L-Citrulline HCl, 200mg Citrulline Malate, 80mg Beta-Alanine, 15mg Niacin, 36mg Calcium' },
    { name: 'Amino-Surge', category: 'Pre/Intra Workout',
      does: 'BCAA + glutamine intra/post-workout to support muscle recovery, endurance, and hydration.',
      ingredients: '4,000mg BCAAs (2:1:1 Leucine/Isoleucine/Valine), 1,000mg L-Glutamine, 2.5mg Vitamin B6' },

    // ── Weight Loss / Fat Burners ──
    { name: 'Pulse', category: 'Weight Loss / Fat Burners',
      does: 'Daytime natural-energy and fat-burning support with appetite control and no jitters.',
      ingredients: '130mg each of Caffeine Anhydrous, Green Tea Extract (45% EGCG), Green Coffee Bean Extract, Raspberry Ketones, and Garcinia Cambogia (50% HCA)' },
    { name: 'ThermoSurge', category: 'Weight Loss / Fat Burners',
      does: 'Intense thermogenic fat burner supporting metabolism, energy, focus, and appetite control.',
      ingredients: '425mg Energy/Focus Blend (Caffeine Anhydrous, Phenylethylamine HCl, Glucomannan), 40mg Thermogenesis Blend (Raspberry Ketones, Yohimbe Bark, Green Tea Extract), 7mg Lipogenic Blend (Kola Nut, L-Carnitine)' },
    { name: 'DreamSlim', category: 'Weight Loss / Fat Burners',
      does: 'Nighttime fat burner + sleep support; supports restful sleep and overnight metabolism.',
      ingredients: '4mg Melatonin, 500mg Night Burn Blend (White Kidney Bean, Green Coffee Bean, L-Theanine, L-Carnitine Tartrate, CLA, L-Tryptophan), 340mg Mood & Sleep Blend (Ashwagandha, Lemon Balm, Passion Flower, Valerian Root, GABA, 5-HTP), Vitamin D, Magnesium, Niacin' },
    { name: 'GLP-Surge', category: 'Weight Loss / Fat Burners',
      does: 'Berberine for metabolic & weight management — supports healthy blood sugar, insulin sensitivity, and GLP-1 activity.',
      ingredients: '1,200mg Berberine HCl Blend (Berberis Aristata bark + standardized Berberine HCl)' },

    // ── Overall Health ──
    { name: 'Shroom-Surge', category: 'Overall Health',
      does: '10-mushroom nootropic complex supporting focus, clarity, natural energy, and immunity.',
      ingredients: '266mg core blend (Cordyceps, Reishi, Shiitake, Lion’s Mane) + 266mg blend (Maitake, Turkey Tail, Chaga, Royal Sun Agaricus, White Button, Wood Ear)' },
    { name: 'GutSurge', category: 'Overall Health',
      does: 'Digestive enzyme + probiotic supporting digestion, nutrient absorption, and reduced bloating.',
      ingredients: 'Makzyme-Pro (400mg; fungal protease + L. acidophilus/casei/plantarum), Bromelain (90 GDU), Papain (2670 TU), Fungal Lipase (1500 FIP), Fungal Lactase (600 LACU), Alpha-Galactosidase (300 GALU)' },
    { name: 'GutArmor', category: 'Overall Health',
      does: '60 Billion CFU probiotic supporting gut microbiome balance, digestion, and immune function.',
      ingredients: '60 Billion CFU blend (L. Acidophilus, B. Lactis, L. Plantarum, L. Paracasei) with MAKTREK Bi-Pass tech, Complex Marine Polysaccharide (50mg), Fructooligosaccharide (20mg)' },
    { name: 'ELEO Reset', category: 'Overall Health',
      does: 'Gentle detox + digestive cleanse supporting regularity, the microbiome, and a lighter feeling.',
      ingredients: '1,532mg cleansing blend (Psyllium Husk, Acai Berry, Inulin, Slippery Elm, Aloe Vera, Chlorella, Black Walnut Hull, Ginger Root, Hyssop, Papaya, Lycopene)' },
    { name: 'Vitamin K2+D3', category: 'Overall Health',
      does: 'Supports bone and heart health by aiding calcium absorption and directing calcium to bones.',
      ingredients: 'Vitamin D3 (125mcg), Vitamin K2 as MK-7 (100mcg), Calcium (210mg), BioPerine black pepper extract (5mg)' },
    { name: 'Vitamin B-12 Complex Drops', category: 'Overall Health',
      does: 'High-potency liquid B-complex supporting energy production, metabolism, and vitality.',
      ingredients: 'B-12 methylcobalamin (1,200mcg), B6, Niacin, Riboflavin, Pantothenic Acid (raspberry liquid, stevia-sweetened)' },
    { name: 'Omega 3 Fish Oil', category: 'Overall Health',
      does: 'High-potency EPA/DHA supporting heart, brain, and joint health (burp-free lemon).',
      ingredients: '1,200mg Fish Oil per softgel, 432mg EPA, 288mg DHA (720mg total Omega-3s), triple-filtered, wild-caught' },
    { name: 'Complete Multivitamin', category: 'Overall Health',
      does: 'All-in-one daily multivitamin with vitamins, minerals, botanicals, and antioxidants.',
      ingredients: 'Vitamins A/C/D/E + B-complex (folate, B-12), Calcium, Magnesium, Zinc, Selenium, Copper, Manganese, Chromium; Lutein, Lycopene, Saw Palmetto, Echinacea, green-tea & fruit extracts' },

    // ── Bundles ──
    { name: 'Weight Loss Bundle', category: 'Bundles',
      does: '24/7 fat-loss stack: Pulse (daytime energy + fat-burning) plus DreamSlim (overnight burn + sleep).',
      ingredients: 'Includes Pulse + DreamSlim (see those products for full ingredient lists).' },
    { name: 'Workout Bundle', category: 'Bundles',
      does: '3-in-1 training stack: Up-Fuel (pre-workout), Amino-Surge (intra/post recovery), and Surge (pumps).',
      ingredients: 'Includes Up-Fuel + Amino-Surge + Surge (see those products for full ingredient lists).' },
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
