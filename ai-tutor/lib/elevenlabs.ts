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

interface SpeechPlaybackState {
  isSpeaking: boolean;
  isPaused: boolean;
}

const playbackListeners = new Set<(state: SpeechPlaybackState) => void>();
let playbackState: SpeechPlaybackState = {
  isSpeaking: false,
  isPaused: false,
};
let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;

function emitPlaybackState(nextState: SpeechPlaybackState) {
  playbackState = nextState;
  playbackListeners.forEach((listener) => listener(playbackState));
}

function clearPlaybackState() {
  activeAudio = null;
  activeUtterance = null;
  emitPlaybackState({
    isSpeaking: false,
    isPaused: false,
  });
}

export function getSpeechPlaybackState() {
  return playbackState;
}

export function subscribeToSpeechPlayback(listener: (state: SpeechPlaybackState) => void) {
  playbackListeners.add(listener);
  listener(playbackState);

  return () => {
    playbackListeners.delete(listener);
  };
}

export function toggleSpeechPlaybackPause() {
  if (activeAudio) {
    if (activeAudio.paused) {
      void activeAudio.play()
        .then(() => {
          emitPlaybackState({ isSpeaking: true, isPaused: false });
        })
        .catch(() => {
          emitPlaybackState({ isSpeaking: true, isPaused: true });
        });
      return false;
    }

    activeAudio.pause();
    emitPlaybackState({ isSpeaking: true, isPaused: true });
    return true;
  }

  if (window.speechSynthesis && activeUtterance) {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      emitPlaybackState({ isSpeaking: true, isPaused: false });
      return false;
    }

    window.speechSynthesis.pause();
    emitPlaybackState({ isSpeaking: true, isPaused: true });
    return true;
  }

  return false;
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
  activeAudio = audio;
  activeUtterance = null;
  emitPlaybackState({
    isSpeaking: true,
    isPaused: false,
  });

  return new Promise((resolve, reject) => {
    audio.onplay = () => {
      emitPlaybackState({ isSpeaking: true, isPaused: false });
    };

    audio.onpause = () => {
      if (audio.ended) return;
      emitPlaybackState({ isSpeaking: true, isPaused: true });
    };

    // ── THIS IS THE CRITICAL CALLBACK ──────────────────────────────
    // The canvas unlock (setSessionState("idle")) fires AFTER this.
    // Do not resolve() earlier — the student must hear the full question
    // before they can touch the canvas again.
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      clearPlaybackState();
      resolve();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      clearPlaybackState();
      reject(new Error("Audio playback failed"));
    };

    void audio.play().catch((error) => {
      URL.revokeObjectURL(audioUrl);
      clearPlaybackState();
      reject(error);
    });
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
    activeAudio = null;
    activeUtterance = utterance;
    emitPlaybackState({
      isSpeaking: true,
      isPaused: false,
    });
    if (options.languageLocale) {
      utterance.lang = options.languageLocale;
    }
    const voice = findBrowserVoice(options.languageLocale);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.onpause = () => emitPlaybackState({ isSpeaking: true, isPaused: true });
    utterance.onresume = () => emitPlaybackState({ isSpeaking: true, isPaused: false });
    utterance.onend = () => {
      clearPlaybackState();
      resolve();
    };
    utterance.onerror = () => {
      clearPlaybackState();
      resolve();
    }; // always resolve — canvas must unlock
    window.speechSynthesis.speak(utterance);
  });
}
