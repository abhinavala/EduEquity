import { NextRequest, NextResponse } from "next/server";
import { getTutorLanguage, getTutorLanguageVoiceEnvKey } from "@/lib/tutorLanguages";

type ElevenLabsErrorPayload = {
  detail?: {
    type?: string;
    code?: string;
    message?: string;
    status?: string;
    request_id?: string;
  };
};

export async function POST(request: NextRequest) {
  try {
    const { text, languageCode } = await request.json() as {
      text?: string;
      languageCode?: string;
    };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const selectedLanguage = getTutorLanguage(languageCode);
    const voiceId =
      process.env[getTutorLanguageVoiceEnvKey(selectedLanguage.code)] ??
      process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
      console.error("ElevenLabs credentials missing from .env.local");
      return NextResponse.json({ error: "ElevenLabs not configured" }, { status: 500 });
    }

    // eleven_turbo_v2_5 = lowest latency (MASTER_CONTEXT requirement)
    const body: Record<string, unknown> = {
      text: text.trim(),
      model_id: "eleven_turbo_v2_5",
      language_code: selectedLanguage.elevenLabsLanguageCode,
    };
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      }
    );

    if (!elevenRes.ok) {
      const errorText = await elevenRes.text();
      let providerError: ElevenLabsErrorPayload["detail"];
      try {
        const parsed = JSON.parse(errorText) as ElevenLabsErrorPayload;
        providerError = parsed.detail;
      } catch {
        providerError = undefined;
      }

      console.error("ElevenLabs error:", elevenRes.status, errorText);
      // 402 = Payment Required — can be quota, billing, or plan restriction (e.g. model not on free tier)
      const isQuotaOrPayment = elevenRes.status === 402;
      return NextResponse.json(
        {
          error: isQuotaOrPayment
            ? "ElevenLabs quota or plan restriction"
            : "ElevenLabs request failed",
          code: isQuotaOrPayment ? "quota_or_payment" : undefined,
          detail: providerError?.message ?? errorText,
          provider: providerError
            ? {
                type: providerError.type,
                code: providerError.code,
                status: providerError.status,
                requestId: providerError.request_id,
              }
            : undefined,
          status: elevenRes.status,
        },
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
