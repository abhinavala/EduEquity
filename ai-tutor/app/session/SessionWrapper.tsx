"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Editor, createShapeId, toRichText } from "tldraw";
import WhiteboardCanvas from "@/components/WhiteboardCanvas";
import AnnotationOverlay from "@/components/AnnotationOverlay";
import VoiceController from "@/components/VoiceController";
import { exportCanvasAsBase64 } from "@/lib/canvasExport";
import { speakText, speakTextFallback } from "@/lib/elevenlabs";
import { AnnotationBox, ClaudeResponse, ConversationTurn, SessionState } from "@/lib/types";

interface SessionWrapperProps {
  courseMaterial: string;
}

function insertProblem(editor: Editor, text: string) {
  try {
    const vp = editor.getViewportPageBounds();
    editor.createShape({
      id: createShapeId(),
      type: "text",
      x: vp.x + 40,
      y: vp.y + 40,
      props: {
        richText: toRichText(text),
        autoSize: true,
        size: "m",
        font: "draw",
        color: "blue",
      },
    });
  } catch (err) {
    console.warn("Could not insert practice problem on canvas:", err);
  }
}

export default function SessionWrapper({ courseMaterial }: SessionWrapperProps) {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [annotation, setAnnotation] = useState<AnnotationBox | null>(null);
  const [statusText, setStatusText] = useState<string>("");

  const editorRef = useRef<Editor | null>(null);
  const courseMaterialRef = useRef<string>(courseMaterial);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<ConversationTurn[]>([]);

  useEffect(() => {
    courseMaterialRef.current = courseMaterial;
  }, [courseMaterial]);

  const isCanvasLocked = sessionState === "processing" || sessionState === "speaking";

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  const handleTranscript = useCallback(
    async (transcript: string) => {
      if (!editorRef.current || isCanvasLocked) return;

      setAnnotation(null);
      conversationRef.current.push({
        role: "user",
        content: transcript,
        timestamp: Date.now(),
      });

      setSessionState("processing");
      setStatusText("Thinking...");

      try {
        const exportResult = await exportCanvasAsBase64(editorRef.current, canvasContainerRef);

        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            courseMaterial: courseMaterialRef.current,
            canvasImageBase64: exportResult?.base64 ?? null,
            conversationHistory: conversationRef.current.slice(0, -1).slice(-8),
          }),
        });

        if (!response.ok) throw new Error(`API error ${response.status}`);

        const aiResponse: ClaudeResponse = await response.json();

        conversationRef.current.push({
          role: "assistant",
          content: aiResponse.speech_text,
          timestamp: Date.now(),
        });

        if (aiResponse.type === "annotation" && aiResponse.annotation) {
          setAnnotation(aiResponse.annotation);
        }

        if (aiResponse.type === "practice_problem" && aiResponse.practice_problem && editorRef.current) {
          insertProblem(editorRef.current, aiResponse.practice_problem);
        }

        setStatusText(aiResponse.speech_text);
        setSessionState("speaking");

        try {
          await speakText(aiResponse.speech_text);
        } catch {
          await speakTextFallback(aiResponse.speech_text);
        }

        setSessionState("idle");
        setStatusText("");
      } catch (error) {
        console.error("Pipeline error:", error);
        setSessionState("idle");
        setStatusText("Something went wrong — try again");
        setTimeout(() => setStatusText(""), 3000);
      }
    },
    [isCanvasLocked]
  );

  return (
    <main className="relative w-full h-screen overflow-hidden bg-white">
      <div ref={canvasContainerRef} className="absolute inset-0">
        <WhiteboardCanvas isLocked={isCanvasLocked} onEditorReady={handleEditorReady} />
      </div>

      <AnnotationOverlay annotation={annotation} />

      {annotation && (
        <div className="absolute left-4 top-4 z-[100] bg-black/90 text-white text-xs p-3 rounded-lg font-mono space-y-1 min-w-[160px] shadow-xl border border-white/20">
          <div className="text-yellow-400 font-bold">Annotation</div>
          <div className="text-white/80 text-[10px]">x: {annotation.x_pct.toFixed(1)}% · y: {annotation.y_pct.toFixed(1)}%</div>
        </div>
      )}

      {statusText && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] max-w-lg px-4 w-full">
          <div className="bg-black/75 text-white text-sm px-5 py-3 rounded-2xl text-center shadow-xl">
            {sessionState === "processing" ? "🤔 " : "💬 "}
            {statusText}
          </div>
        </div>
      )}

      <VoiceController onTranscriptReady={handleTranscript} isAiActive={isCanvasLocked} />

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[90] pointer-events-none">
        <div className="bg-black/60 text-white text-xs px-4 py-2 rounded-full font-mono">
          {sessionState} · {isCanvasLocked ? "locked" : "unlocked"}
        </div>
      </div>
    </main>
  );
}
