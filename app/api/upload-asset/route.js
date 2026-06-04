import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase-admin';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const assetId = formData.get('assetId');
    const name = formData.get('name');

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop();
    const filename = `brand-assets/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('upsurge-assets')
      .upload(filename, buffer, { contentType: file.type, upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: urlData } = supabaseAdmin.storage
      .from('upsurge-assets')
      .getPublicUrl(filename);

    const newAsset = {
      id: assetId,
      name: name,
      image_url: urlData.publicUrl,
      description: '',
      media_type: file.type,
      usage_tags: [],
      usage_notes: '',
      visual_description: '',
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = await supabaseAdmin.from('upsurge_brand_assets').upsert(newAsset);
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    return NextResponse.json({ success: true, asset: newAsset });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}