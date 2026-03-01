// lib/types.ts

import { TutorLanguageCode } from "@/lib/tutorLanguages";

export interface AnnotationBox {
  x_pct: number;      // 0–100: left edge as % of canvas width
  y_pct: number;      // 0–100: top edge as % of canvas height
  width_pct: number;  // 0–100: box width as % of canvas width
  height_pct: number; // 0–100: box height as % of canvas height
}

export interface VisualPlan {
  kind: "parabola_tangent_demo" | "concept_steps" | "integration_by_parts_demo" | "structured_diagram";
  expression: string;
  conceptLabel?: string | null;
  secondaryLabel?: string | null;
  tangentLabel?: string | null;
  insightLabel?: string | null;
  uPart?: string | null;
  dvPart?: string | null;
  duPart?: string | null;
  vPart?: string | null;
  assembledFormula?: string | null;
  promptSummary?: string | null;
  elements?: VisualElement[] | null;
}

export interface VisualPoint {
  x: number;
  y: number;
}

export interface VisualElement {
  kind: "text" | "box" | "ellipse" | "line" | "arrow" | "polyline" | "point";
  x: number;
  y: number;
  x2?: number | null;
  y2?: number | null;
  w?: number | null;
  h?: number | null;
  text?: string | null;
  label?: string | null;
  color?: string | null;
  size?: string | null;
  dash?: string | null;
  fill?: string | null;
  points?: VisualPoint[] | null;
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

export interface BoardPageAsset {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  width: number;
  height: number;
  fileSize: number;
  pageNumber?: number | null;
}

export interface UploadedMaterialEntry {
  id: string;
  name: string;
  mimeType: string;
  text: string;
  boardPages: BoardPageAsset[];
  displayOnBoard: boolean;
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
