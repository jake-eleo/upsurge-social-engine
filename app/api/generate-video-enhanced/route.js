import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase-admin';

// ── Enhanced Video Pipeline ───────────────────────────────────────
// 1. Grok generates video with native audio + reference images
// 2. xAI TTS generates voiceover with 'leo' voice
// 3. FFmpeg merges voiceover onto video
// 4. Upload to Supabase
// ──────────────────────────────────────────────────────────────────

const XAI_API_KEY = process.env.XAI_API_KEY;
const POLL_INTERVAL = 5000; // 5 seconds
const POLL_TIMEOUT = 300000; // 5 minutes

// ── Step 1: Generate video with Grok ──────────────────────────────
async function generateVideo({ prompt, duration, aspectRatio, resolution, referenceImageUrls, imageUrl, voiceoverScript, hook }) {
  const body = {
    model: 'grok-imagine-video',
    prompt,
    duration: referenceImageUrls?.length > 0 ? Math.min(duration || 10, 10) : (duration || 15),
    aspect_ratio: aspectRatio || '9:16',
    resolution: resolution || '720p',
  };

  // Image-to-video: use a single image as the starting frame
  if (imageUrl) {
    body.image = { url: imageUrl };
  }

  // Reference images: influence what appears without locking first frame
  if (referenceImageUrls && referenceImageUrls.length > 0) {
    body.reference_images = referenceImageUrls.slice(0, 7).map(url => ({ url }));
  }

  // Voiceover injection — use custom script if provided, fall back to hook
  const customScript = voiceoverScript || hook || '';
  console.log('🎙 Custom voiceover script:', customScript);
  if (customScript.trim().length > 0) {
    // Strip SSML/pause tags — Grok video model doesn't parse them
    const cleanScript = customScript
      .replace(/\[pause\]|\[long-pause\]/gi, ',')
      .replace(/<\/?emphasis>|<\/?slow>|<\/?soft>|<\/?whisper>/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    // Prepend the exact script at the TOP so Grok weights it heavily
    body.prompt = `NARRATOR SPEAKS ONLY THIS EXACT SENTENCE: "${cleanScript}". Deep authoritative male voice, clinical pacing.\n\n${body.prompt}`;
  }
  console.log('🎬 Prompt length:', body.prompt.length);
  console.log('Grok video request:', { promptStart: body.prompt.substring(0, 200), duration: body.duration, aspectRatio: body.aspect_ratio, refImages: referenceImageUrls?.length || 0 });

  const response = await fetch('https://api.x.ai/v1/videos/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('❌ Grok Video API error:', response.status);
    console.error('❌ Error body:', errText);
    console.error('❌ Prompt length:', body.prompt?.length);
    console.error('❌ Prompt first 300:', body.prompt?.substring(0, 300));
    console.error('❌ Prompt last 300:', body.prompt?.substring(body.prompt.length - 300));
    throw new Error(`Grok Video API ${response.status}: ${errText.substring(0, 200)}`);
  }

  const { request_id } = await response.json();
  console.log('Grok video request_id:', request_id);

  // Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < POLL_TIMEOUT) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const pollResponse = await fetch(`https://api.x.ai/v1/videos/${request_id}`, {
      headers: { 'Authorization': `Bearer ${XAI_API_KEY}` },
    });

    const data = await pollResponse.json();

    if (data.status === 'done') {
      console.log('Grok video done:', data.video?.url?.substring(0, 60));
      return data.video.url;
    } else if (data.status === 'failed' || data.status === 'expired') {
      throw new Error(`Grok video ${data.status}`);
    }
    // else pending, keep polling
  }

  throw new Error('Grok video generation timed out');
}

// ── Step 2: Generate voiceover with xAI TTS ──────────────────────
async function generateVoiceover(text, voiceId = 'leo') {
  if (!text || text.trim().length === 0) return null;

  console.log('TTS request:', { voiceId, textLength: text.length, text: text.substring(0, 80) + '...' });

  const response = await fetch('https://api.x.ai/v1/tts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language: 'en',
      output_format: {
        codec: 'mp3',
        sample_rate: 44100,
        bit_rate: 192000,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('TTS failed:', response.status, errText);
    return null; // Don't fail the whole pipeline for TTS
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  console.log('TTS audio generated:', audioBuffer.length, 'bytes');
  return audioBuffer;
}

// ── Step 3: Merge voiceover onto video with FFmpeg ────────────────
async function mergeAudioOntoVideo(videoUrl, voiceoverBuffer, postId) {
  // Dynamic import for ffmpeg
  let ffmpegPath, ffprobePath;
  try {
    const ffmpegStatic = await import('ffmpeg-static');
    ffmpegPath = ffmpegStatic.default;
  } catch (e) {
    console.warn('ffmpeg-static not available, skipping audio merge');
    return null;
  }

  const { execSync, execFileSync } = await import('child_process');
  const { writeFileSync, readFileSync, unlinkSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const os = await import('os');

  const tmpDir = os.tmpdir();
  const videoPath = join(tmpDir, `${postId}_video.mp4`);
  const audioPath = join(tmpDir, `${postId}_voiceover.mp3`);
  const outputPath = join(tmpDir, `${postId}_merged.mp4`);

  try {
    // Download video
    const videoResponse = await fetch(videoUrl);
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    writeFileSync(videoPath, videoBuffer);
    console.log('Video downloaded:', videoBuffer.length, 'bytes');

    // Write voiceover
    writeFileSync(audioPath, voiceoverBuffer);

    // FFmpeg merge: keep original video audio at lower volume, add voiceover on top
    // -filter_complex: mix original audio (lowered to 30%) with voiceover (100%)
    const ffmpegArgs = [
      '-i', videoPath,
      '-i', audioPath,
      '-filter_complex',
      '[0:a]volume=0.3[bg];[1:a]volume=1.0[vo];[bg][vo]amix=inputs=2:duration=shortest:dropout_transition=2[aout]',
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-y',
      outputPath,
    ];

    console.log('FFmpeg merging audio...');
    execFileSync(ffmpegPath, ffmpegArgs, { timeout: 60000 });
    console.log('FFmpeg merge complete');

    const mergedBuffer = readFileSync(outputPath);

    // Cleanup
    [videoPath, audioPath, outputPath].forEach(p => { try { unlinkSync(p); } catch(e) {} });

    return mergedBuffer;
  } catch (e) {
    console.error('FFmpeg merge failed:', e.message);
    // Cleanup on failure
    [videoPath, audioPath, outputPath].forEach(p => { try { if (existsSync(p)) unlinkSync(p); } catch(e) {} });
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────
export async function POST(request) {
  try {
    const {
      prompt,
      voiceoverScript,
      voiceId,
      duration,
      aspectRatio,
      resolution,
      referenceImageUrls,
      imageUrl,
      postId,
      hook,
      caption,
    } = await request.json();

    console.log('Enhanced video pipeline started:', { postId, hasVoiceover: !!voiceoverScript, refImages: referenceImageUrls?.length || 0 });
    // 0. Generate title card with hook text as starting frame
    let titleCardUrl = null;
    const hookText = hook || caption?.substring(0, 80) || '';
    if (hookText.trim().length > 0) {
      try {
        console.log('Generating title card with hook:', hookText.substring(0, 50));
        const titlePrompt = `Create a bold, cinematic title card for a short-form video. Dark background #0A0A14 with subtle aqua-to-violet gradient lighting (#5EEBEB to #C983F3) as rim light or atmospheric glow.

CENTER TEXT (CRITICAL — render this EXACTLY): "${hookText}"
The text must be large, bold, white uppercase sans-serif. Stack across 2-3 lines for impact. Add a subtle dark gradient or frosted glass panel behind the text for maximum legibility.

Aspect ratio: ${aspectRatio === '9:16' ? 'Vertical 9:16 (1080x1920)' : 'Horizontal 16:9 (1920x1080)'}
Style: Premium, cinematic, minimal. Like a Netflix documentary title card. No people, no photos — pure typography on a dark cinematic background with subtle light effects.
DO NOT add any logo or brand name.`;

        const titleResponse = await fetch('https://api.x.ai/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${XAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'grok-2-image',
            prompt: titlePrompt,
            n: 1,
          }),
        });

        if (titleResponse.ok) {
          const titleData = await titleResponse.json();
          titleCardUrl = titleData.data?.[0]?.url || null;
          console.log('Title card generated:', titleCardUrl ? 'YES' : 'NO');
        }
      } catch (e) {
        console.warn('Title card generation failed, proceeding without:', e.message);
      }
    }

    // 1. Generate video with Grok (includes native ambient audio)
    const videoUrl = await generateVideo({
      prompt,
      voiceoverScript: voiceoverScript || '',
      hook: hook || '',
      duration,
      aspectRatio,
      resolution,
      referenceImageUrls,
      imageUrl: titleCardUrl || imageUrl,
    });

    if (!videoUrl) throw new Error('No video URL returned');

    // 2. Download and upload to Supabase (Grok URLs are temporary)
    const videoResponse = await fetch(videoUrl);
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const filename = `posts/${postId}_reel.mp4`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('upsurge-assets')
      .upload(filename, videoBuffer, { contentType: 'video/mp4', upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from('upsurge-assets')
      .getPublicUrl(filename);
    const permanentUrl = urlData.publicUrl;

    // 5. Update post record
    await supabaseAdmin
      .from('upsurge_posts')
      .update({
        image_url: permanentUrl,
        image_type: 'video',
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

    console.log('Enhanced video pipeline complete:', permanentUrl);

    return NextResponse.json({
      permanentUrl,
      pipeline: 'enhanced-video',
      hasVoiceover: !!voiceoverScript,
    });
  } catch (e) {
    console.error('Enhanced video pipeline error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}