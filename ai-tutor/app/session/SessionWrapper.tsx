"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Editor } from "tldraw";
import WhiteboardCanvas from "@/components/WhiteboardCanvas";
import AnnotationOverlay from "@/components/AnnotationOverlay";
import { AnnotationBox, SessionState } from "@/lib/types";

interface SessionWrapperProps {
  courseMaterial: string;  // Passed from SetupScreen (Phase 5) — empty for now
}

export default function SessionWrapper({ courseMaterial }: SessionWrapperProps) {

  // ── All app state lives here ──────────────────────────────────────
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [annotation, setAnnotation] = useState<AnnotationBox | null>(null);

  // tldraw editor ref — Phase 3 uses this for canvas screenshots
  const editorRef = useRef<Editor | null>(null);

  // Course material ref — Phase 2 sends this in every Groq API call
  const courseMaterialRef = useRef<string>(courseMaterial);
  useEffect(() => {
    courseMaterialRef.current = courseMaterial;
  }, [courseMaterial]);

  // Canvas container ref — Phase 3 uses for html2canvas fallback
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Derived: canvas is locked during AI work
  const isCanvasLocked = sessionState === "processing" || sessionState === "speaking";

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  // ── PHASE 1 TEST — remove in Phase 6 ─────────────────────────────
  const testToggle = () => {
    if (sessionState === "idle") {
      setSessionState("processing");
      setAnnotation({ x_pct: 30, y_pct: 35, width_pct: 22, height_pct: 10 });
    } else {
      setSessionState("idle");
      setAnnotation(null);
    }
  };

  return (
    <main className="relative w-full h-screen overflow-hidden bg-white">

      {/* Canvas layer */}
      <div ref={canvasContainerRef} className="absolute inset-0">
        <WhiteboardCanvas isLocked={isCanvasLocked} onEditorReady={handleEditorReady} />
      </div>

      {/* Red annotation box layer */}
      <AnnotationOverlay annotation={annotation} />

      {/* PHASE 1 TEST CONTROLS — delete in Phase 6 */}
      <div className="absolute top-4 right-4 z-[100]">
        <button
          onClick={testToggle}
          className={`px-4 py-2 rounded-lg font-bold text-white text-sm shadow-lg ${
            isCanvasLocked ? "bg-red-500" : "bg-green-500"
          }`}
        >
          {isCanvasLocked ? "🔒 LOCKED — click to unlock" : "🔓 UNLOCKED — click to lock"}
        </button>
      </div>

      {/* Debug status bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[100]">
        <div className="bg-black/60 text-white text-xs px-4 py-2 rounded-full font-mono">
          state: {sessionState} | locked: {isCanvasLocked ? "yes" : "no"}
        </div>
      </div>

      {/*
        PLACEHOLDERS — future phases mount here:
        Phase 2: <VoiceController onTranscriptReady={handleTranscript} isAiActive={isCanvasLocked} />
        Phase 4: ElevenLabs audio trigger inside handleTranscript
      */}
    </main>
  );
}
