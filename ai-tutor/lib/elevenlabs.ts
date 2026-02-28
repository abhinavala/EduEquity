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

export async function speakText(text: string): Promise<void> {
  const response = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs API route returned ${response.status}`);
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
export function speakTextFallback(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve(); // always resolve — canvas must unlock
    window.speechSynthesis.speak(utterance);
  });
}
