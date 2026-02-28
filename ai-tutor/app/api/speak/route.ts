import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
      console.error("ElevenLabs credentials missing from .env.local");
      return NextResponse.json({ error: "ElevenLabs not configured" }, { status: 500 });
    }

    // eleven_turbo_v2_5 = lowest latency, optimized for real-time streaming
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.3,
            use_speaker_boost: true,
          },
          optimize_streaming_latency: 3,  // minimize time-to-first-audio
        }),
      }
    );

    if (!elevenRes.ok) {
      const errorText = await elevenRes.text();
      console.error("ElevenLabs error:", elevenRes.status, errorText);
      return NextResponse.json(
        { error: "ElevenLabs request failed", detail: errorText },
        { status: elevenRes.status }
      );
    }

    // Stream the audio directly back to the browser
    return new NextResponse(elevenRes.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache, no-store",
        "Transfer-Encoding": "chunked",
      },
    });

  } catch (error) {
    console.error("Speak route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
