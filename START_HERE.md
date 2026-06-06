# UpSurge Social Engine — Start Here

Your AI social-content engine for **UpSurge Supplements** (cloned & rebranded from the ELEO engine). This doc is the quick-reference + context primer. Double-clicking the **"UpSurge Social Engine"** desktop shortcut opens this file, the project folder, and launches Claude Code here for any further work.

- **Project folder:** `C:\Users\beaud\upsurge-social-engine`
- **GitHub:** https://github.com/jake-eleo/upsurge-social-engine
- **Live site:** your Vercel deployment
- **Stack:** Next.js + Supabase + Anthropic Claude (text) + xAI Grok (images/video)

---

## Run it locally
```powershell
cd C:\Users\beaud\upsurge-social-engine
npm install          # first time only
npm run dev          # http://localhost:3000
npm run build        # production build / sanity check
```

## Continue work with Claude Code
The desktop shortcut launches Claude Code in this folder. Or manually:
```powershell
cd C:\Users\beaud\upsurge-social-engine
claude
```

---

## The one file that controls the brand
**`brand.config.js`** is the single source of truth — name, tagline, links, colors (sampled from the logo: aqua `#5EEBEB` + violet `#C983F3`), audience, voice, compliance, feature flags, and the full **product list with ingredients** (auto-synced from upsurgesupps.com). To rebrand or update products, edit this file. To re-sync products, ask Claude Code to "re-sync products from the store."

Feature flags in there:
- `videoProvider: 'grok'` — video uses Grok (HeyGen removed)
- `scheduling: 'stub'` — superseded by the Make webhook (see below)
- `compositeProductHeroes: false` — Offer posts use designed ads via image-edits; set `true` for clean pixel-exact product-only shots (needs transparent PNGs)

---

## What's built
- **Images use your real product photos.** Posts that reference an uploaded asset go through xAI's image-**edits** endpoint (Grok actually uses the photo). All four pillars (Education, Social Proof, Lifestyle, Offer) use the asset when one is referenced.
- **Per-platform dimensions:** Instagram/LinkedIn 1:1, Facebook 16:9, TikTok 9:16, carousels 1:1.
- **Video voiceover** is capped to fit the ~10s clip (no overrun).
- **Scheduling via Make.com webhook** (no GHL). Approve → marks "scheduled" → the scheduler posts it at its date. Plus a **⚡ Post now** button for immediate posting.
- Model: `grok-imagine-image-quality` (migrated off the deprecated pro model).

## Supabase
- Tables: `upsurge_posts`, `upsurge_brand_config`, `upsurge_brand_assets`
- Bucket: `upsurge-assets` (public)
- Setup SQL: `SUPABASE_SETUP.sql`

## Environment variables (`.env.local` + Vercel)
See `ENV_TEMPLATE.txt`. Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`, `XAI_API_KEY`
- `MAKE_WEBHOOK_URL` — your Make.com webhook (enables posting)
- `CRON_SECRET` — protects the scheduler endpoint

## Scheduling setup (free)
1. Set `MAKE_WEBHOOK_URL` + `CRON_SECRET` in Vercel → redeploy.
2. In **Make.com**: build the scenario (webhook → router by `platform` → IG/FB/TikTok modules), connect your socials, turn it ON.
3. In **cron-job.org** (free): ping `https://YOUR-APP.vercel.app/api/run-scheduler?secret=YOUR_CRON_SECRET` every ~15 min so scheduled posts go out on time. (Vercel's free cron only runs daily — it's set as a backstop in `vercel.json`.)

---

## Remaining infra checklist
- [ ] Supabase project created + `SUPABASE_SETUP.sql` run + `upsurge-assets` bucket public
- [ ] Login user created in Supabase Auth
- [ ] All env vars set in Vercel
- [ ] Product photos uploaded in the **Assets** tab (IDs like `UPFUEL_PRODUCT`) — ideally transparent PNGs
- [ ] Make.com scenario built + socials connected + scenario ON
- [ ] cron-job.org job pinging the scheduler
- [ ] Test: generate a post → **Post now** → confirm it lands on the social account

## Reference docs in this folder
- `SUPABASE_SETUP.sql` — database + storage setup
- `ENV_TEMPLATE.txt` — all environment variables
- `brand.config.js` — brand + products
