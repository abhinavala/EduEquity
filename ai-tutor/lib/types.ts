// lib/types.ts

export interface AnnotationBox {
  x_pct: number;      // 0–100: left edge as % of canvas width
  y_pct: number;      // 0–100: top edge as % of canvas height
  width_pct: number;  // 0–100: box width as % of canvas width
  height_pct: number; // 0–100: box height as % of canvas height
}

export interface ClaudeResponse {
  // Named ClaudeResponse for interface consistency — powered by Groq/Llama
  type: "annotation" | "practice_problem" | "socratic_response";
  speech_text: string;         // What ElevenLabs speaks aloud
  annotation?: AnnotationBox;  // Present only when type === "annotation"
  practice_problem?: string;   // Present only when type === "practice_problem"
}

export type SessionState = "idle" | "listening" | "processing" | "speaking";
// idle       → student draws and speaks freely
// listening  → mic open, capturing speech
// processing → Groq API call in flight, canvas LOCKED
// speaking   → ElevenLabs audio playing, canvas LOCKED
