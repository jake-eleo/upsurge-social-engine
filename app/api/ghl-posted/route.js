import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase-admin';

export async function POST(request) {
  const body = await request.json();
  const postId = body.postId || body.id || body.customData?.postId;
  if (postId) {
    await supabaseAdmin
      .from('upsurge_posts')
      .update({ status: 'posted', updated_at: new Date().toISOString() })
      .eq('id', postId);
  }
  return NextResponse.json({ received: true });
}