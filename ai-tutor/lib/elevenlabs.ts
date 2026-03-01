// lib/elevenlabs.ts
//
// speakText() is the key function in this file.
// It returns a Promise that resolves ONLY when the audio has finished playing.
// The caller does:
//
//   setSessionState("speaking");     // canvas locks
//   await speakText(text);           // waits here until audio ends
//   setSessionState("idle");         // canvas unlocks HERE — not before
//
// This is what makes annotation + audio perfectly synchronized.

interface SpeakTextOptions {
  languageCode?: string;
  languageLocale?: string;
}

function findBrowserVoice(languageLocale?: string) {
  if (!languageLocale || !window.speechSynthesis) return null;

  const lowerLocale = languageLocale.toLowerCase();
  const languagePrefix = lowerLocale.split("-")[0];
  const voices = window.speechSynthesis.getVoices();

  return (
    voices.find((voice) => voice.lang.toLowerCase() === lowerLocale) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(`${languagePrefix}-`)) ??
    voices.find((voice) => voice.lang.toLowerCase() === languagePrefix) ??
    null
  );
}

export async function speakText(text: string, options: SpeakTextOptions = {}): Promise<void> {
  const response = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, languageCode: options.languageCode }),
  });

  if (!response.ok) {
    let message = `ElevenLabs API route returned ${response.status}`;
    let detail: string | undefined;
    let code: string | undefined;
    let provider:
      | {
          type?: string;
          code?: string;
          status?: string;
          requestId?: string;
        }
      | undefined;
    try {
      const body = await response.json() as {
        code?: string;
        detail?: string;
        provider?: {
          type?: string;
          code?: string;
          status?: string;
          requestId?: string;
        };
      };
      detail = body.detail;
      code = body.code;
      provider = body.provider;
      if (body.code === "quota_or_payment" || response.status === 402) {
        message = detail && detail.length < 200
          ? `ElevenLabs 402: ${detail}`
          : "ElevenLabs quota or plan restriction. Check elevenlabs.io/dashboard.";
      }
    } catch {
      if (response.status === 402) {
        message = "ElevenLabs 402 — quota or plan restriction. Check elevenlabs.io/dashboard.";
      }
    }
    const err = new Error(message) as Error & {
      detail?: string;
      code?: string;
      status?: number;
      provider?: {
        type?: string;
        code?: string;
        status?: string;
        requestId?: string;
      };
    };
    if (detail) err.detail = detail;
    if (code) err.code = code;
    err.status = response.status;
    if (provider) err.provider = provider;
    throw err;
  }

  // Collect full audio blob from the stream
  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);

  return new Promise((resolve, reject) => {
    // ── THIS IS THE CRITICAL CALLBACK ──────────────────────────────
    // The canvas unlock (setSessionState("idle")) fires AFTER this.
    // Do not resolve() earlier — the student must hear the full question
    // before they can touch the canvas again.
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      resolve();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      reject(new Error("Audio playback failed"));
    };

    audio.play();
  });
}

// ── Browser TTS Fallback ────────────────────────────────────────────────
// Use ONLY if ElevenLabs fails (network error, quota, etc.)
// This is NOT the primary TTS — ElevenLabs is the sponsor requirement.
// Note: resolves even on error so canvas always unlocks.
export function speakTextFallback(text: string, options: SpeakTextOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (options.languageLocale) {
      utterance.lang = options.languageLocale;
    }
    const voice = findBrowserVoice(options.languageLocale);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve(); // always resolve — canvas must unlock
    window.speechSynthesis.speak(utterance);
  });
}
