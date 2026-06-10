// Shared scheduling helpers — used by /api/schedule-ghl (manual/immediate) and
// /api/run-scheduler (the cron that posts due items). One place defines the
// Make.com payload shape and the webhook call, so providers can be swapped here.

// Accepts a post in either client (camelCase) or DB-row (snake_case) shape and
// returns the platform-agnostic payload the Make scenario expects.
export function buildMakePayload(p) {
  const caption = p.caption || '';
  const hashtags = p.hashtags || '';
  const text = [caption, hashtags].filter(Boolean).join('\n\n');
  const carouselUrls = p.carouselUrls || p.carousel_urls || [];
  const imageUrl = p.imageUrl || p.image_url || '';
  const imageType = p.imageType || p.image_type || '';
  const suggestedFormat = p.suggestedFormat || p.suggested_format || '';
  const mediaType = imageType
    || (suggestedFormat === 'carousel' ? 'carousel'
      : (suggestedFormat === 'reel' || suggestedFormat === 'story_video') ? 'video'
      : 'image');
  const urls = Array.isArray(carouselUrls) ? carouselUrls : [];
  // Make.com maps flat fields far more easily than arrays, so each slide is
  // also sent as carouselUrl1..carouselUrl10 (empty string when unused).
  const flatUrls = {};
  for (let i = 0; i < 10; i++) flatUrls[`carouselUrl${i + 1}`] = urls[i] || '';
  return {
    postId: p.id || '',
    platform: p.platform || '',
    caption,
    hashtags,
    text,
    mediaType,
    mediaUrl: imageUrl || urls[0] || '',
    carouselUrls: urls,
    // Array-of-objects shape for modules (e.g. Instagram carousel) that need
    // one object per item with a media type and URL. Both common key names
    // (url / image_url) are included so either maps.
    carouselItems: urls.map((u) => ({ media_type: 'IMAGE', url: u, image_url: u })),
    carouselCount: urls.length,
    carouselUrlsJoined: urls.join(','),
    ...flatUrls,
    scheduledDate: p.date || '',
  };
}

// POSTs a payload to the Make.com webhook. Returns { ok, skipped?, error? }.
export async function sendToMake(payload) {
  const webhook = process.env.MAKE_WEBHOOK_URL;
  if (!webhook) return { ok: false, skipped: true, reason: 'MAKE_WEBHOOK_URL not set' };
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, error: `webhook ${res.status}: ${errText.slice(0, 150)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
