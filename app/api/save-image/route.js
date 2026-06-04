import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase-admin';

export async function POST(request) {
  const { imageUrl, postId, imageType } = await request.json();
  try {
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);
    const ext = imageType === 'video' ? 'mp4' : 'jpg';
    const filename = `posts/${postId}.${ext}`;
    const contentType = imageType === 'video' ? 'video/mp4' : 'image/jpeg';
    const { data, error } = await supabaseAdmin.storage
      .from('upsurge-assets')
      .upload(filename, uint8Array, { contentType, upsert: true });
    if (error) throw error;
    const { data: urlData } = supabaseAdmin.storage
      .from('upsurge-assets')
      .getPublicUrl(filename);
    await supabaseAdmin
      .from('upsurge_posts')
      .update({ image_url: urlData.publicUrl, image_type: imageType, updated_at: new Date().toISOString() })
      .eq('id', postId);
    return NextResponse.json({ permanentUrl: urlData.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}