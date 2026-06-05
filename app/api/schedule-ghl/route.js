import { NextResponse } from 'next/server';

// SCHEDULING via Make.com webhook (replaces GHL). Set MAKE_WEBHOOK_URL to your
// Make custom-webhook URL; this route forwards each approved post to it, and your
// Make scenario routes it to Instagram/Facebook/TikTok. If MAKE_WEBHOOK_URL is
// unset, this safely no-ops (post is still marked "scheduled" locally).
// To swap providers later (Ayrshare, direct Meta API, etc.), change only this file.
export async function POST(request) {
  let post = null;
  try {
    post = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'bad request body' }, { status: 400 });
  }

  const webhook = process.env.MAKE_WEBHOOK_URL;
  if (!webhook) {
    console.log('[schedule] MAKE_WEBHOOK_URL not set — no external posting. postId:', post?.id ?? '(none)');
    return NextResponse.json({ success: true, stubbed: true });
  }

  // Build a clean, platform-agnostic payload for the Make scenario to map.
  const text = [post.caption, post.hashtags].filter(Boolean).join('\n\n');
  const carouselUrls = Array.isArray(post.carouselUrls) ? post.carouselUrls : [];
  const mediaType = post.imageType
    || (post.suggestedFormat === 'carousel' ? 'carousel'
      : (post.suggestedFormat === 'reel' || post.suggestedFormat === 'story_video') ? 'video'
      : 'image');

  const payload = {
    postId: post.id || '',
    platform: post.platform || '',
    caption: post.caption || '',
    hashtags: post.hashtags || '',
    text,
    mediaType,
    mediaUrl: post.imageUrl || carouselUrls[0] || '',
    carouselUrls,
    scheduledDate: post.date || '',
  };

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[schedule] Make webhook error', res.status, errText.slice(0, 200));
      return NextResponse.json({ success: false, error: `webhook ${res.status}` }, { status: 502 });
    }
    console.log('[schedule] Sent to Make:', payload.platform, payload.postId);
    return NextResponse.json({ success: true, posted: true });
  } catch (e) {
    console.error('[schedule] Make webhook exception:', e.message);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
