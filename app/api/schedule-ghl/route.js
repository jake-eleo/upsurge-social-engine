import { NextResponse } from 'next/server';

// SCHEDULING STUBBED — no external posting. Swap in GHL or Ayrshare here later.
//
// UpSurge does not post to any external scheduler. Approving a post simply marks
// it "scheduled" in Supabase and the UI (handled client-side). This endpoint is
// kept so the existing approval flow has something to call, but it performs NO
// external request — it just acknowledges success.
//
// To wire up real posting later: read `post` from the request body and call your
// social API (GoHighLevel, Ayrshare, Meta Graph, etc.) here, then return success.
export async function POST(request) {
  let post = null;
  try {
    post = await request.json();
  } catch {
    // ignore malformed body — stub succeeds regardless
  }
  console.log('[schedule] STUBBED — no external posting. postId:', post?.id ?? '(none)');
  return NextResponse.json({ success: true, stubbed: true });
}
