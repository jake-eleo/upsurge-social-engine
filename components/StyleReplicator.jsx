// ================================================================
// UpSurge Style Replicator — Instagram Post Style Analysis + Generation
//
// Upload a screenshot of any Instagram post → Claude Vision extracts
// the "style DNA" (hook formula, tone, structure, visual approach) →
// Generate new UpSurge posts that replicate that winning style.
//
// SUPPORTS: Single image, multi-image carousel (upload all slides),
//           or paste caption text directly.
// ================================================================

import { useState, useRef } from "react";
import { BRAND } from '../brand.config';

// ── Style tokens (matching ELEOSocialEngine) ──────────────────────
const T = {
  bg:"#0B0B14", surf:"#13131F", surf2:"#1A1A2E",
  border:"#222235", text:"#E0E0EC", muted:"#6B6B8A", accent:"#F59E0B",
  green:"#10B981", red:"#EF4444", blue:"#5EEBEB",
};

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

const lbl = { display:"block", fontSize:11, fontWeight:700, color:"#8888AA", marginBottom:7, textTransform:"uppercase", letterSpacing:"0.06em" };
const inputStyle = { background:T.surf, border:`1px solid ${T.border}`, borderRadius:7, padding:"9px 12px", color:T.text, fontSize:13, outline:"none" };
const chipStyle = (active,color) => ({ padding:"5px 11px", borderRadius:6, border:`1px solid ${active?color:T.border}`, background:active?`${color}22`:"transparent", color:active?color:T.muted, cursor:"pointer", fontSize:12, fontWeight:500, transition:"all 0.12s" });

// ── Convert file to base64 ────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Analyze style from screenshots via Claude Vision ──────────────
// Accepts an array of { base64, mediaType } — works for 1 image or many
async function analyzeScreenshots(images) {
  const imageBlocks = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.base64 },
  }));

  const isCarousel = images.length > 1;
  const carouselContext = isCarousel
    ? `You are looking at ${images.length} slides from an Instagram CAROUSEL post. Analyze the carousel as a unified piece of content — the visual progression across slides, how the narrative builds, and the design consistency. `
    : `You are looking at an Instagram post screenshot. `;

  const response = await fetch("/api/generate-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text: `${carouselContext}You are an elite social media strategist. Extract the complete "style DNA" of this post so we can replicate its winning patterns for a fitness supplements brand (${BRAND.identity.name}).

Analyze every dimension of this post and respond ONLY with valid JSON (no markdown fences, no preamble):

{
  "postType": "${isCarousel ? 'carousel' : 'single_image | carousel | reel_thumbnail | story | text_post'}",${isCarousel ? `
  "carouselAnalysis": {
    "slideCount": ${images.length},
    "narrativeArc": "Describe how the content builds across slides — e.g. 'Hook → Evidence → Evidence → CTA', 'Problem → 3 Solutions → CTA', 'Myth slide → Truth slide → Proof → CTA'",
    "slideBreakdown": [${images.map((_, i) => `{"slide": ${i + 1}, "purpose": "What this slide does in the sequence", "visualDescription": "What's on this slide — layout, text, imagery"}`).join(', ')}],
    "designConsistency": "Describe the visual thread tying slides together — shared colors, fonts, layout grid, recurring elements",
    "swipeMotivation": "What makes the viewer keep swiping to the next slide"
  },` : ''}
  "hookFormula": "Describe the exact hook technique used in the first line — e.g. contrarian claim, specific number, curiosity gap, pattern interrupt, identity statement, question, bold declaration",
  "hookText": "The actual first line / hook text from the post",
  "captionStructure": {
    "totalLength": "short (under 100 chars) | medium (100-250) | long (250+)",
    "lineBreaks": "frequent (every 1-2 sentences) | moderate (paragraphs) | minimal (wall of text)",
    "emojiUsage": "none | minimal (1-2) | moderate (3-5) | heavy (6+)",
    "hashtagPlacement": "inline | end_of_caption | first_comment | none_visible",
    "hashtagCount": 0,
    "ctaStyle": "direct_link | question_engagement | comment_prompt | dm_prompt | none",
    "ctaText": "The actual CTA text if visible"
  },
  "tone": {
    "primary": "authoritative | conversational | clinical | motivational | vulnerable | provocative | educational | storytelling",
    "secondary": "Pick a second tone that blends with primary",
    "personality": "One sentence describing the voice personality — e.g. 'Confident doctor who talks like your smartest friend'",
    "formality": "casual | professional | clinical | mixed"
  },
  "contentPattern": {
    "pillarMatch": "education | social_proof | lifestyle | offer",
    "framework": "Describe the content framework — e.g. 'Problem → Agitate → Solution', 'Myth vs Reality', 'Before/After', 'List of tips', 'Story arc', 'Data point → Insight → CTA'",
    "valueDelivery": "How does this post deliver value to the reader in one sentence"
  },
  "visualStyle": {
    "composition": "Describe the visual layout, colors, typography style, image treatment${isCarousel ? ', and how design flows across slides' : ''}",
    "textOverlay": "yes_headline | yes_full_text | minimal_text | no_text",
    "overlayStyle": "If text overlay exists, describe font style, color, placement, background treatment",
    "colorPalette": "Describe the dominant 2-3 colors",
    "mood": "clinical | warm | dark_premium | bright_energetic | minimal_clean | editorial",
    "imageSubject": "What is the main visual subject${isCarousel ? ' across all slides' : ''}"
  },
  "whatMakesItWork": "2-3 sentences explaining WHY this post would perform well — the psychological triggers, the scroll-stopping element, the engagement driver${isCarousel ? ', and why the carousel format specifically amplifies this' : ''}",
  "replicationBlueprint": "A specific, actionable 3-4 sentence instruction for recreating this post's style for a men's hormone optimization clinic. Include the hook formula, caption structure, tone, and visual direction.${isCarousel ? ' Include how to structure the carousel slide progression.' : ''}"
}`
          }
        ],
      }],
    }),
  });

  if (!response.ok) throw new Error(`Claude API ${response.status}`);
  const data = await response.json();
  const raw = data.content?.[0]?.text || "{}";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ── Generate posts using analyzed style ───────────────────────────
async function generateFromStyle({ styleProfile, platform, pillar, topic, count, brandConfig, brandAssets, topPerformers, bottomPerformers }) {
  const assetList = brandAssets.map(a => '- ' + a.id + ': ' + (a.usageNotes || a.description || a.name)).join('\n');

  const carouselInstructions = styleProfile.carouselAnalysis
    ? `\n\nCAROUSEL STRUCTURE TO REPLICATE:
- Narrative arc: ${styleProfile.carouselAnalysis.narrativeArc}
- Slide count: ${styleProfile.carouselAnalysis.slideCount}
- Design consistency: ${styleProfile.carouselAnalysis.designConsistency}
- Swipe motivation: ${styleProfile.carouselAnalysis.swipeMotivation}
For carousel posts, describe each slide in suggestedImage like: "ASSET_ID + Slide 1: [description] | Slide 2: [description] | Slide 3: [description]"` : '';

  const response = await fetch("/api/generate-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: `You are ${BRAND.identity.name}'s social media content engine. You have been given a "Style DNA" profile extracted from a high-performing Instagram post. Your job is to CREATE NEW, ORIGINAL posts for ${BRAND.identity.name} that replicate the WINNING PATTERNS of that style — but with UpSurge's energetic brand voice and offers.

## BRAND
${BRAND.identity.name} (${BRAND.identity.shortName}) — ${BRAND.identity.tagline}. Positioning: ${BRAND.identity.positioning}.
Trust signals: ${BRAND.identity.trustSignals.join(', ')}. Fitness supplements brand — NOT a clinic, no doctor persona.
CTA: "${brandConfig.primaryCTA}" | Link: ${brandConfig.bookingLink}
${brandConfig.currentPromo ? `Promo: ${brandConfig.currentPromo}` : ""}

## TARGET CUSTOMER
${BRAND.targetAudience}

## COMPLIANCE (supplement marketing — non-negotiable)
Structure/function claims only ("supports energy", "promotes recovery"). NEVER disease claims ("cures/treats/prevents") or weight-loss guarantees ("lose 20 lbs"). No medical/clinical authority framing.

## PRODUCTS
${BRAND.products.map(p => `- ${p.name} (${p.category})`).join('\n')}

## BRAND ASSETS (reference by ID in suggestedImage)
${assetList}

${topPerformers.length > 0 ? `## TOP PERFORMING ${BRAND.identity.shortName} POSTS (combine these patterns with the style DNA)
${topPerformers.map((p,i) => `${i+1}. [${p.platform} | ${p.pillar} | Score: ${p.score}/5] "${p.caption}"`).join("\n")}` : ""}

Respond ONLY with valid JSON. No markdown fences, no preamble.`,
      messages: [{
        role: "user",
        content: `## STYLE DNA TO REPLICATE
${JSON.stringify(styleProfile, null, 2)}

## REPLICATION BLUEPRINT
${styleProfile.replicationBlueprint}${carouselInstructions}

## TASK
Generate ${count} NEW posts for UpSurge that replicate this style DNA.
Platform: ${platform}
Pillar: ${pillar}
${topic ? `Topic/angle: ${topic}` : ""}

RULES:
- Match the hook formula: "${styleProfile.hookFormula}"
- Match the caption structure: ${styleProfile.captionStructure.totalLength} length, ${styleProfile.captionStructure.lineBreaks} line breaks
- Match the tone: ${styleProfile.tone.primary} + ${styleProfile.tone.secondary} — "${styleProfile.tone.personality}"
- Match the content framework: "${styleProfile.contentPattern.framework}"
- Match the CTA style: ${styleProfile.captionStructure.ctaStyle}
- Emoji usage: ${styleProfile.captionStructure.emojiUsage}
- DO NOT copy the original post's content — create ORIGINAL UpSurge content using the same STRUCTURAL PATTERNS
- Every post must tie back to UpSurge's products and CTA

Caption lengths: instagram 130–200 chars (hook before char 125) | facebook 200–320 | linkedin 280–420 | tiktok 70–120

Return JSON array:
[{"caption":"...","hashtags":"5-8 hashtags","hook":"opening line matching the analyzed hook formula","suggestedImage":"ASSET_ID + detailed scene description matching the visual style: ${styleProfile.visualStyle.mood}, ${styleProfile.visualStyle.composition}","suggestedFormat":"${styleProfile.postType === 'carousel' ? 'carousel' : styleProfile.postType === 'reel_thumbnail' ? 'reel' : 'static'}","styleNotes":"One sentence on how this post replicates the style DNA"}]`
      }],
    }),
  });

  if (!response.ok) throw new Error(`Claude API ${response.status}`);
  const data = await response.json();
  const raw = data.content?.[0]?.text || "[]";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ── Badge helper ──────────────────────────────────────────────────
const badge = (color,label) => <span style={{background:`${color}22`,color,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap"}}>{label}</span>;

// ─────────────────────────────────────────────────────────────────
// STYLE REPLICATOR COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function StyleReplicator({ brandConfig, brandAssets, topPerformers, bottomPerformers, onAddPosts, isMobile }) {
  // Steps: upload → analyze → configure → generate → review
  const [step, setStep] = useState("upload"); // upload | analyzing | profile | generating | results
  
  // Upload state — supports multiple images for carousel analysis
  const [screenshots, setScreenshots] = useState([]); // [{ file, preview, base64, mediaType }, ...]
  const [pastedCaption, setPastedCaption] = useState("");
  const [inputMode, setInputMode] = useState("screenshot"); // screenshot | caption
  const fileInputRef = useRef(null);
  
  // Analysis state
  const [styleProfile, setStyleProfile] = useState(null);
  const [analyzeError, setAnalyzeError] = useState("");
  
  // Generation config
  const [genPlatform, setGenPlatform] = useState("instagram");
  const [genPillar, setGenPillar] = useState("education");
  const [genTopic, setGenTopic] = useState("");
  const [genCount, setGenCount] = useState(3);
  
  // Results
  const [results, setResults] = useState([]);
  const [genError, setGenError] = useState("");
  const [selectedResults, setSelectedResults] = useState(new Set());

  // ── Handle file upload (supports multiple) ──
  const handleFiles = async (fileList) => {
    const newImages = [];
    for (const file of fileList) {
      if (!file || !file.type.startsWith("image/")) continue;
      const preview = URL.createObjectURL(file);
      const base64 = await fileToBase64(file);
      newImages.push({ file, preview, base64, mediaType: file.type });
    }
    if (newImages.length > 0) {
      setScreenshots(prev => [...prev, ...newImages]);
    }
  };

  const removeScreenshot = (index) => {
    setScreenshots(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].preview);
      next.splice(index, 1);
      return next;
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFiles(files);
  };

  // ── Analyze ──
  const handleAnalyze = async () => {
    setStep("analyzing");
    setAnalyzeError("");
    try {
      if (inputMode === "screenshot" && screenshots.length > 0) {
        const images = screenshots.map(s => ({ base64: s.base64, mediaType: s.mediaType }));
        const profile = await analyzeScreenshots(images);
        setStyleProfile(profile);
        setStep("profile");
      } else if (inputMode === "caption" && pastedCaption.trim()) {
        // For pasted caption, use text-only analysis
        const response = await fetch("/api/generate-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `You are an elite social media strategist. Analyze this Instagram caption and extract its "style DNA" so we can replicate the pattern for a fitness supplements brand.

CAPTION:
"""
${pastedCaption}
"""

Respond ONLY with valid JSON (no markdown fences):
{
  "postType": "text_post",
  "hookFormula": "Describe the hook technique",
  "hookText": "The actual first line",
  "captionStructure": {
    "totalLength": "short | medium | long",
    "lineBreaks": "frequent | moderate | minimal",
    "emojiUsage": "none | minimal | moderate | heavy",
    "hashtagPlacement": "inline | end_of_caption | first_comment | none_visible",
    "hashtagCount": 0,
    "ctaStyle": "direct_link | question_engagement | comment_prompt | dm_prompt | none",
    "ctaText": ""
  },
  "tone": {
    "primary": "authoritative | conversational | clinical | motivational | vulnerable | provocative | educational | storytelling",
    "secondary": "second tone",
    "personality": "One sentence voice description",
    "formality": "casual | professional | clinical | mixed"
  },
  "contentPattern": {
    "pillarMatch": "education | social_proof | lifestyle | offer",
    "framework": "Content framework description",
    "valueDelivery": "How it delivers value"
  },
  "visualStyle": {
    "composition": "Cannot determine from caption only",
    "textOverlay": "unknown",
    "overlayStyle": "unknown",
    "colorPalette": "unknown",
    "mood": "Infer mood from caption tone",
    "imageSubject": "Suggest based on caption content"
  },
  "whatMakesItWork": "2-3 sentences on why this works",
  "replicationBlueprint": "3-4 sentence actionable replication guide"
}`
            }],
          }),
        });
        if (!response.ok) throw new Error(`Claude API ${response.status}`);
        const data = await response.json();
        const raw = data.content?.[0]?.text || "{}";
        const profile = JSON.parse(raw.replace(/```json|```/g, "").trim());
        setStyleProfile(profile);
        setStep("profile");
      }
    } catch (e) {
      console.error("Analysis failed:", e);
      setAnalyzeError("Analysis failed — " + e.message);
      setStep("upload");
    }
  };

  // ── Generate from style ──
  const handleGenerate = async () => {
    setStep("generating");
    setGenError("");
    try {
      const posts = await generateFromStyle({
        styleProfile,
        platform: genPlatform,
        pillar: genPillar,
        topic: genTopic,
        count: genCount,
        brandConfig,
        brandAssets,
        topPerformers,
        bottomPerformers,
      });
      setResults(Array.isArray(posts) ? posts : [posts]);
      setSelectedResults(new Set(posts.map((_, i) => i)));
      setStep("results");
    } catch (e) {
      console.error("Generation failed:", e);
      setGenError("Generation failed — " + e.message);
      setStep("profile");
    }
  };

  // ── Add selected to drafts ──
  const handleAddToDrafts = () => {
    const selected = results.filter((_, i) => selectedResults.has(i));
    if (selected.length === 0) return;
    onAddPosts(selected.map(r => ({
      platform: genPlatform,
      pillar: genPillar,
      caption: r.caption,
      hashtags: r.hashtags,
      hook: r.hook,
      suggestedImage: r.suggestedImage,
      suggestedFormat: r.suggestedFormat || "static",
    })));
    // Reset for another round
    setResults([]);
    setSelectedResults(new Set());
    setStep("profile"); // Stay on profile so they can generate more
  };

  // ── Reset everything ──
  const handleReset = () => {
    setStep("upload");
    screenshots.forEach(s => URL.revokeObjectURL(s.preview));
    setScreenshots([]);
    setPastedCaption("");
    setStyleProfile(null);
    setResults([]);
    setSelectedResults(new Set());
    setGenError("");
    setAnalyzeError("");
  };

  // ── RENDER ──
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px" }}>Style Replicator</h2>
          <p style={{ fontSize: 13, color: T.muted, margin: "0 0 20px" }}>
            Upload a screenshot of any Instagram post you admire → Claude extracts the style DNA → generate UpSurge posts that replicate the winning patterns.
          </p>
        </div>
        {step !== "upload" && (
          <button onClick={handleReset} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.muted, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>
            ↺ Start Over
          </button>
        )}
      </div>

      {/* ── STEP: UPLOAD ─────────────────────────────────────── */}
      {step === "upload" && (
        <div>
          {/* Input mode toggle */}
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            {[["screenshot", "📱 Screenshot"], ["caption", "📝 Paste Caption"]].map(([mode, label]) => (
              <button key={mode} onClick={() => setInputMode(mode)}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${inputMode === mode ? T.accent : T.border}`, background: inputMode === mode ? `${T.accent}22` : "transparent", color: inputMode === mode ? T.accent : T.muted, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {label}
              </button>
            ))}
          </div>

          {inputMode === "screenshot" ? (
            <>
              {/* Drop zone */}
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${screenshots.length > 0 ? T.green : T.border}`,
                  borderRadius: 12,
                  padding: screenshots.length > 0 ? 14 : 48,
                  textAlign: "center",
                  cursor: "pointer",
                  background: screenshots.length > 0 ? `${T.green}08` : "transparent",
                  transition: "all 0.2s",
                  marginBottom: 18,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={e => { if (e.target.files.length > 0) handleFiles(Array.from(e.target.files)); e.target.value = ''; }}
                />
                {screenshots.length > 0 ? (
                  <div>
                    {/* Thumbnail grid */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
                      {screenshots.map((s, i) => (
                        <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                          <img src={s.preview} alt={`Slide ${i + 1}`}
                            style={{ width: isMobile ? 80 : 110, height: isMobile ? 80 : 110, objectFit: "cover", borderRadius: 8, border: `1px solid ${T.border}` }} />
                          {/* Slide number badge */}
                          <div style={{ position: "absolute", top: 4, left: 4, background: "#000000CC", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>
                            {i + 1}
                          </div>
                          {/* Remove button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeScreenshot(i); }}
                            style={{ position: "absolute", top: 4, right: 4, background: "#000000CC", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>
                            ✕
                          </button>
                        </div>
                      ))}
                      {/* Add more button */}
                      <div
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        style={{ width: isMobile ? 80 : 110, height: isMobile ? 80 : 110, borderRadius: 8, border: `2px dashed ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                        <span style={{ fontSize: 20, color: T.muted, lineHeight: 1 }}>+</span>
                        <span style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Add slide</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: T.green, fontWeight: 600, margin: "0 0 2px" }}>
                      ✓ {screenshots.length} {screenshots.length === 1 ? "image" : "slides"} loaded
                    </p>
                    <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>
                      {screenshots.length > 1 ? "Claude will analyze the full carousel — slide progression, design consistency, and narrative arc" : "Drop or click to add more slides for carousel analysis"}
                    </p>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.6 }}>📱</div>
                    <p style={{ fontSize: 14, color: T.text, margin: "0 0 6px", fontWeight: 600 }}>Drop Instagram screenshots here</p>
                    <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Single post or multiple slides for carousel — PNG, JPG, WebP</p>
                  </div>
                )}
              </div>

              {/* Tips */}
              <div style={{ padding: "12px 14px", background: `${T.blue}08`, border: `1px solid ${T.blue}22`, borderRadius: 8, marginBottom: 18 }}>
                <p style={{ fontSize: 12, color: "#4499FF", margin: 0, lineHeight: 1.6 }}>
                  <strong>Single post:</strong> Screenshot the full post including caption.
                  <br/>
                  <strong>Carousel:</strong> Screenshot each slide individually and upload all of them. Claude will analyze the visual progression, narrative arc, and design consistency across all slides together.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Paste caption */}
              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>Paste the Instagram caption</label>
                <textarea
                  value={pastedCaption}
                  onChange={e => setPastedCaption(e.target.value)}
                  rows={8}
                  placeholder={"Paste the full caption here including hashtags...\n\nExample:\n\"Your testosterone naturally declines after 30.\n\nBut here's what most doctors won't tell you...\n\n#hormone #menshealth\""}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.6 }}
                />
                <p style={{ fontSize: 11, color: T.muted, margin: "6px 0 0" }}>
                  {pastedCaption.length} chars — Claude will analyze tone, hook, structure, and CTA pattern
                </p>
              </div>
            </>
          )}

          {analyzeError && (
            <p style={{ fontSize: 13, color: T.red, margin: "0 0 12px" }}>{analyzeError}</p>
          )}

          <button
            onClick={handleAnalyze}
            disabled={(inputMode === "screenshot" && screenshots.length === 0) || (inputMode === "caption" && !pastedCaption.trim())}
            style={{
              width: "100%",
              background: ((inputMode === "screenshot" && screenshots.length > 0) || (inputMode === "caption" && pastedCaption.trim()))
                ? "linear-gradient(135deg,#5EEBEB,#C983F3)" : T.surf2,
              border: "none",
              color: ((inputMode === "screenshot" && screenshots.length > 0) || (inputMode === "caption" && pastedCaption.trim()))
                ? "#fff" : T.muted,
              borderRadius: 8, padding: "13px", cursor: "pointer", fontSize: 14, fontWeight: 800,
            }}
          >
            🔍 Analyze Style DNA {screenshots.length > 1 ? `(${screenshots.length} slides)` : ""}
          </button>
        </div>
      )}

      {/* ── STEP: ANALYZING ──────────────────────────────────── */}
      {step === "analyzing" && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🔬</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: T.text, margin: "0 0 8px" }}>Extracting Style DNA…</p>
          <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
            {screenshots.length > 1
              ? `Claude Vision is analyzing ${screenshots.length} carousel slides — visual progression, design system, narrative arc, and engagement patterns.`
              : "Claude Vision is analyzing hook formula, caption structure, tone, visual style, and engagement patterns."
            }
          </p>
          <div style={{ marginTop: 20, height: 4, background: T.surf2, borderRadius: 4, overflow: "hidden", maxWidth: 300, margin: "20px auto 0" }}>
            <div style={{ height: "100%", background: "linear-gradient(90deg,#5EEBEB,#C983F3)", borderRadius: 4, width: "60%", animation: "pulse 1.5s ease-in-out infinite" }} />
          </div>
        </div>
      )}

      {/* ── STEP: STYLE PROFILE ──────────────────────────────── */}
      {step === "profile" && styleProfile && (
        <div>
          {/* Profile header */}
          <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.green, textTransform: "uppercase", letterSpacing: "0.06em" }}>Style DNA Extracted</span>
              <div style={{ display: "flex", gap: 6 }}>
                {badge("#4499FF", styleProfile.postType)}
                {badge(PILLARS.find(p => p.id === styleProfile.contentPattern?.pillarMatch)?.color || T.muted, styleProfile.contentPattern?.pillarMatch || "—")}
              </div>
            </div>

            {/* Carousel analysis (only shows for multi-slide uploads) */}
            {styleProfile.carouselAnalysis && (
              <div style={{ background: "#E1306C11", border: "1px solid #E1306C33", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#E1306C", textTransform: "uppercase" }}>Carousel Analysis — {styleProfile.carouselAnalysis.slideCount} slides</span>
                <p style={{ fontSize: 13, color: T.text, margin: "6px 0 4px", fontWeight: 600 }}>{styleProfile.carouselAnalysis.narrativeArc}</p>
                <p style={{ fontSize: 11, color: T.muted, margin: "0 0 8px" }}>Swipe driver: {styleProfile.carouselAnalysis.swipeMotivation}</p>
                {/* Slide breakdown */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {styleProfile.carouselAnalysis.slideBreakdown?.map((slide, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 8px", background: T.surf2, borderRadius: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#E1306C", flexShrink: 0, minWidth: 50 }}>Slide {slide.slide}</span>
                      <div>
                        <p style={{ fontSize: 11, color: T.text, margin: 0, fontWeight: 600 }}>{slide.purpose}</p>
                        <p style={{ fontSize: 10, color: T.muted, margin: "2px 0 0" }}>{slide.visualDescription}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: T.muted, margin: "8px 0 0", fontStyle: "italic" }}>Design thread: {styleProfile.carouselAnalysis.designConsistency}</p>
              </div>
            )}

            {/* Hook */}
            <div style={{ background: `${T.red}11`, border: `1px solid ${T.red}33`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.red, textTransform: "uppercase" }}>Hook Formula</span>
              <p style={{ fontSize: 14, color: T.text, margin: "4px 0 0", fontWeight: 600, lineHeight: 1.5 }}>{styleProfile.hookFormula}</p>
              {styleProfile.hookText && (
                <p style={{ fontSize: 12, color: T.muted, margin: "6px 0 0", fontStyle: "italic" }}>"{styleProfile.hookText}"</p>
              )}
            </div>

            {/* Tone + Structure grid */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
              {/* Tone */}
              <div style={{ background: T.surf2, borderRadius: 8, padding: "10px 14px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#8B5CF6", textTransform: "uppercase" }}>Tone</span>
                <p style={{ fontSize: 13, color: T.text, margin: "4px 0 2px", fontWeight: 600 }}>
                  {styleProfile.tone.primary} + {styleProfile.tone.secondary}
                </p>
                <p style={{ fontSize: 11, color: T.muted, margin: 0, lineHeight: 1.5 }}>{styleProfile.tone.personality}</p>
              </div>
              {/* Structure */}
              <div style={{ background: T.surf2, borderRadius: 8, padding: "10px 14px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#3B82F6", textTransform: "uppercase" }}>Structure</span>
                <p style={{ fontSize: 12, color: T.text, margin: "4px 0 0", lineHeight: 1.6 }}>
                  {styleProfile.captionStructure.totalLength} length · {styleProfile.captionStructure.lineBreaks} breaks · {styleProfile.captionStructure.emojiUsage} emoji
                </p>
                <p style={{ fontSize: 11, color: T.muted, margin: "2px 0 0" }}>
                  CTA: {styleProfile.captionStructure.ctaStyle}
                </p>
              </div>
            </div>

            {/* Framework */}
            <div style={{ background: `${T.accent}11`, border: `1px solid ${T.accent}33`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, textTransform: "uppercase" }}>Content Framework</span>
              <p style={{ fontSize: 13, color: T.text, margin: "4px 0 0", lineHeight: 1.5 }}>{styleProfile.contentPattern?.framework}</p>
            </div>

            {/* Visual style */}
            {styleProfile.visualStyle && styleProfile.visualStyle.composition !== "Cannot determine from caption only" && (
              <div style={{ background: T.surf2, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#5EEBEB", textTransform: "uppercase" }}>Visual Style</span>
                <p style={{ fontSize: 12, color: T.text, margin: "4px 0 2px", lineHeight: 1.5 }}>{styleProfile.visualStyle.composition}</p>
                <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>Mood: {styleProfile.visualStyle.mood} · Subject: {styleProfile.visualStyle.imageSubject}</p>
              </div>
            )}

            {/* Why it works */}
            <div style={{ background: `${T.green}08`, border: `1px solid ${T.green}22`, borderRadius: 8, padding: "10px 14px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.green, textTransform: "uppercase" }}>Why It Works</span>
              <p style={{ fontSize: 13, color: T.text, margin: "4px 0 0", lineHeight: 1.6 }}>{styleProfile.whatMakesItWork}</p>
            </div>
          </div>

          {/* Generation config */}
          <div style={{ background: T.surf, border: `1px solid #5EEBEB33`, borderRadius: 12, padding: 18 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: "0 0 14px" }}>Generate UpSurge Posts Using This Style</p>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Platform</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PLATFORMS.map(p => (
                    <button key={p.id} onClick={() => setGenPlatform(p.id)} style={chipStyle(genPlatform === p.id, p.color)}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Pillar</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PILLARS.map(p => (
                    <button key={p.id} onClick={() => setGenPillar(p.id)} style={chipStyle(genPillar === p.id, p.color)}>{p.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Topic / Angle (optional)</label>
              <input value={genTopic} onChange={e => setGenTopic(e.target.value)}
                placeholder="e.g. peptide therapy benefits, low T warning signs, morning routine…"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>Number of Posts</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 3, 5].map(n => (
                  <button key={n} onClick={() => setGenCount(n)}
                    style={{ ...chipStyle(genCount === n, "#4499FF"), minWidth: 40, textAlign: "center" }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {genError && <p style={{ fontSize: 13, color: T.red, margin: "0 0 10px" }}>{genError}</p>}

            <button onClick={handleGenerate}
              style={{ width: "100%", background: "linear-gradient(135deg,#5EEBEB,#C983F3)", border: "none", color: "#fff", borderRadius: 8, padding: "13px", cursor: "pointer", fontSize: 14, fontWeight: 800 }}>
              ⚡ Generate {genCount} Post{genCount > 1 ? "s" : ""} with This Style
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: GENERATING ─────────────────────────────────── */}
      {step === "generating" && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>⚡</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: T.text, margin: "0 0 8px" }}>Generating {genCount} Style-Matched Posts…</p>
          <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
            Applying {styleProfile?.hookFormula} hook + {styleProfile?.tone.primary} tone to UpSurge content.
          </p>
        </div>
      )}

      {/* ── STEP: RESULTS ────────────────────────────────────── */}
      {step === "results" && results.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.green, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {results.length} Style-Matched Post{results.length > 1 ? "s" : ""} Generated
              </span>
              <p style={{ fontSize: 12, color: T.muted, margin: "4px 0 0" }}>
                Using: {styleProfile?.hookFormula} · {styleProfile?.tone.primary} tone · {styleProfile?.contentPattern?.framework}
              </p>
            </div>
            <span style={{ fontSize: 12, color: T.muted }}>{selectedResults.size} selected</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
            {results.map((post, i) => {
              const isSelected = selectedResults.has(i);
              return (
                <div key={i}
                  onClick={() => {
                    setSelectedResults(prev => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      return next;
                    });
                  }}
                  style={{
                    background: T.surf,
                    border: `1px solid ${isSelected ? T.green : T.border}`,
                    borderRadius: 10,
                    padding: 16,
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 4,
                        border: `2px solid ${isSelected ? T.green : T.border}`,
                        background: isSelected ? T.green : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, color: "#fff", fontWeight: 700, flexShrink: 0,
                      }}>
                        {isSelected && "✓"}
                      </div>
                      <span style={{ fontSize: 12, color: T.muted }}>Post {i + 1}</span>
                      {badge(PLATFORMS.find(p => p.id === genPlatform)?.color || T.muted, genPlatform)}
                      {badge(PILLARS.find(p => p.id === genPillar)?.color || T.muted, genPillar)}
                      {post.suggestedFormat && badge("#4499FF", post.suggestedFormat)}
                    </div>
                  </div>

                  {post.hook && (
                    <div style={{ background: "#EF444411", border: "1px solid #EF444433", borderRadius: 6, padding: "7px 11px", marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.red, textTransform: "uppercase" }}>Hook</span>
                      <p style={{ fontSize: 13, color: T.text, margin: "3px 0 0", lineHeight: 1.5, fontWeight: 600 }}>{post.hook}</p>
                    </div>
                  )}

                  <p style={{ fontSize: 14, lineHeight: 1.7, color: T.text, margin: "0 0 8px", whiteSpace: "pre-line" }}>{post.caption}</p>
                  <p style={{ fontSize: 12, color: T.muted, margin: "0 0 6px" }}>{post.hashtags}</p>
                  {post.suggestedImage && <p style={{ fontSize: 11, color: "#4499FF", fontStyle: "italic", margin: "0 0 6px" }}>🖼 {post.suggestedImage}</p>}
                  {post.styleNotes && <p style={{ fontSize: 11, color: "#8B5CF6", margin: 0 }}>🎯 {post.styleNotes}</p>}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleAddToDrafts}
              disabled={selectedResults.size === 0}
              style={{
                flex: 2,
                background: selectedResults.size > 0 ? "linear-gradient(135deg,#5EEBEB,#C983F3)" : T.surf2,
                border: "none",
                color: selectedResults.size > 0 ? "#fff" : T.muted,
                borderRadius: 8, padding: "13px", cursor: "pointer", fontSize: 14, fontWeight: 800,
              }}>
              ✓ Add {selectedResults.size} Post{selectedResults.size !== 1 ? "s" : ""} to Queue
            </button>
            <button onClick={() => { setStep("profile"); setResults([]); }}
              style={{ flex: 1, background: "transparent", border: `1px solid ${T.border}`, color: T.muted, borderRadius: 8, padding: "13px", cursor: "pointer", fontSize: 13 }}>
              ↺ Generate More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}