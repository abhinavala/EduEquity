// lib/types.ts

import { TutorLanguageCode } from "@/lib/tutorLanguages";

export interface AnnotationBox {
  x_pct: number;      // 0–100: left edge as % of canvas width
  y_pct: number;      // 0–100: top edge as % of canvas height
  width_pct: number;  // 0–100: box width as % of canvas width
  height_pct: number; // 0–100: box height as % of canvas height
}

export interface VisualPlan {
  kind: "parabola_tangent_demo" | "concept_steps";
  expression: string;
  conceptLabel?: string | null;
  secondaryLabel?: string | null;
  tangentLabel?: string | null;
  insightLabel?: string | null;
}

export interface ClaudeResponse {
  // Named ClaudeResponse for interface consistency — powered by Groq/Llama
  type: "annotation" | "practice_problem" | "socratic_response" | "visual_explanation";
  speech_text: string;         // What ElevenLabs speaks aloud
  annotation?: AnnotationBox | null;  // Present only when type === "annotation"
  annotation_label?: string | null;
  practice_problem?: string | null;   // Present only when type === "practice_problem"
  visual_plan?: VisualPlan | null;
}

export type SessionState = "idle" | "listening" | "processing" | "speaking";
// idle       → student draws and speaks freely
// listening  → mic open, capturing speech
// processing → Groq API call in flight, canvas LOCKED
// speaking   → ElevenLabs audio playing, canvas LOCKED

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface TutorLanguageSelection {
  code: TutorLanguageCode;
}

export interface SessionMetrics {
  startedAt: number;
  elapsedMs: number;
  annotationCount: number;
  practiceProblemCount: number;
  visualAidCount: number;
  userTurnCount: number;
  assistantTurnCount: number;
  activeCourseFiles: string[];
  tutorLanguageCode: TutorLanguageCode;
}

export interface ProgressLetter {
  headline: string;
  summaryParagraph: string;
  accomplishments: string[];
  evidence: string[];
  nextSteps: string[];
}
