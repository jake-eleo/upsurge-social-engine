import { NextResponse } from 'next/server';
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

  const result = await sendToMake(buildMakePayload(post));
  if (result.skipped) {
    console.log('[schedule] MAKE_WEBHOOK_URL not set — no external posting. postId:', post?.id ?? '(none)');
    return NextResponse.json({ success: true, stubbed: true });
  }
  if (!result.ok) {
    console.error('[schedule] Make webhook error:', result.error);
    return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  }
  console.log('[schedule] Sent to Make:', post?.platform, post?.id);
  return NextResponse.json({ success: true, posted: true });
}
