import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase-admin';
import { buildMakePayload, sendToMake } from '../../../lib/schedule';

// Manual / immediate post to the Make.com webhook. NOTE: the normal flow now
// schedules posts (Approve marks them "scheduled" and /api/run-scheduler posts
// them at their date). This route remains for an explicit "post now" action.
// To swap providers (Ayrshare, direct Meta API, etc.), edit lib/schedule.js.
export async function POST(request) {
  let post = null;
  try {
    post = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'bad request body' }, { status: 400 });
  }

  // Build the payload from the DB row, not the client copy — the browser's post
  // object can be stale (old tab, partial state) and the DB is the source of
  // truth for media URLs. Falls back to the request body if the row isn't found.
  let source = post;
  if (post?.id) {
    const { data: row, error } = await supabaseAdmin
      .from('upsurge_posts')
      .select('*')
      .eq('id', post.id)
      .maybeSingle();
    if (error) console.error('[schedule] DB lookup failed, using client body:', error.message);
    if (row) source = row;
  }

  const payload = buildMakePayload(source);
  console.log('[schedule] payload:', JSON.stringify(payload));

  const result = await sendToMake(payload);
  if (result.skipped) {
    console.log('[schedule] MAKE_WEBHOOK_URL not set — no external posting. postId:', post?.id ?? '(none)');
    return NextResponse.json({ success: true, stubbed: true });
  }
  if (!result.ok) {
    console.error('[schedule] Make webhook error:', result.error);
    return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  }
  console.log('[schedule] Sent to Make:', payload.platform, payload.postId, 'carouselCount:', payload.carouselCount);
  return NextResponse.json({ success: true, posted: true });
}
