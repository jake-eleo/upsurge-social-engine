import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase-admin';
import { buildMakePayload, sendToMake } from '../../../lib/schedule';

// Scheduler: finds posts whose scheduled date/time has arrived and posts them via
// the Make.com webhook, then marks them "posted". Trigger this on an interval with
// a free external cron (e.g. cron-job.org every 10-15 min), since Vercel's free
// plan only allows once-daily crons. A daily Vercel cron is configured in
// vercel.json as a backstop.
//
// Security: if CRON_SECRET is set, the request must include it as
//   Authorization: Bearer <CRON_SECRET>   (Vercel cron sends this automatically)
//   or  ?secret=<CRON_SECRET>             (easy to set in cron-job.org)
export const maxDuration = 60;

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    const q = new URL(request.url).searchParams.get('secret');
    if (auth !== `Bearer ${secret}` && q !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  if (!process.env.MAKE_WEBHOOK_URL) {
    return NextResponse.json({ skipped: true, reason: 'MAKE_WEBHOOK_URL not set' });
  }

  // Due = approved/scheduled AND its time has passed.
  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabaseAdmin
    .from('upsurge_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('date', nowIso)
    .order('date', { ascending: true });

  if (error) {
    console.error('[scheduler] query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let posted = 0, failed = 0;
  for (const row of (due || [])) {
    const result = await sendToMake(buildMakePayload(row));
    if (result.ok) {
      await supabaseAdmin
        .from('upsurge_posts')
        .update({ status: 'posted', updated_at: new Date().toISOString() })
        .eq('id', row.id);
      posted++;
      console.log('[scheduler] posted', row.id, row.platform);
    } else {
      // Leave as "scheduled" so it retries on the next run.
      failed++;
      console.error('[scheduler] post failed (will retry)', row.id, result.error || result.reason);
    }
  }

  return NextResponse.json({ checked: due?.length || 0, posted, failed, at: nowIso });
}

// Cron services use GET; allow POST too for flexibility.
export const GET = handle;
export const POST = handle;
