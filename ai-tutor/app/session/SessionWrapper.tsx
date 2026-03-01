"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Editor, createShapeId, toRichText } from "tldraw";
import WhiteboardCanvas from "@/components/WhiteboardCanvas";
import AnnotationOverlay from "@/components/AnnotationOverlay";
import CourseMaterialSidebar from "@/components/CourseMaterialSidebar";
import VoiceController from "@/components/VoiceController";
import { CanvasCaptureArea, exportCanvasAsBase64 } from "@/lib/canvasExport";
import { refineAnnotationForCanvas } from "@/lib/annotationRefinement";
import { speakText, speakTextFallback } from "@/lib/elevenlabs";
import { AnnotationBox, ClaudeResponse, ConversationTurn, SessionMetrics, SessionState } from "@/lib/types";
import { DEFAULT_TUTOR_LANGUAGE, getTutorLanguage, TutorLanguageCode } from "@/lib/tutorLanguages";
import { getUiCopy } from "@/lib/uiTranslations";
import { playVisualPlan } from "@/lib/whiteboardVisuals";

interface SessionWrapperProps {
  initialCourseMaterial?: string;
}

interface ActiveAnnotation {
  box: AnnotationBox;
  captureArea?: CanvasCaptureArea;
  label?: string | null;
}

function insertProblem(editor: Editor, text: string) {
  try {
    const vp = editor.getViewportPageBounds();
    const width = Math.min(Math.max(vp.width * 0.34, 280), 520);
    editor.createShape({
      id: createShapeId(),
      type: "text",
      x: vp.x + Math.max(40, vp.width * 0.16),
      y: vp.y + 40,
      props: {
        richText: toRichText(text),
        autoSize: false,
        w: width,
        size: "m",
        font: "draw",
        color: "blue",
        textAlign: "start",
        scale: 1,
      },
    });
  } catch (err) {
    console.warn("Could not insert practice problem on canvas:", err);
  }
}

function buildAssistantHistoryEntry(response: ClaudeResponse, languageCode: TutorLanguageCode): string {
  const ui = getUiCopy(languageCode);
  const parts = [response.speech_text.trim()];

  if (response.practice_problem?.trim()) {
    parts.push(`${ui.practiceProblemHistoryPrefix}: ${response.practice_problem.trim()}`);
  }

  if (response.annotation) {
    parts.push(ui.annotationHistoryNote);
  }

  return parts.join("\n");
}

export default function SessionWrapper({ initialCourseMaterial = "" }: SessionWrapperProps) {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [annotation, setAnnotation] = useState<ActiveAnnotation | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [annotationCount, setAnnotationCount] = useState(0);
  const [practiceProblemCount, setPracticeProblemCount] = useState(0);
  const [visualAidCount, setVisualAidCount] = useState(0);
  const [selectedLanguageCode, setSelectedLanguageCode] = useState<TutorLanguageCode>(
    () => {
      if (typeof window === "undefined") return DEFAULT_TUTOR_LANGUAGE.code;
      return getTutorLanguage(window.localStorage.getItem("eduEquityTutorLanguage")).code;
    }
  );

  const editorRef = useRef<Editor | null>(null);
  const courseMaterialRef = useRef<string>(initialCourseMaterial);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<ConversationTurn[]>([]);
  const sessionStartedAtRef = useRef(Date.now());
  const visualAnimationTokenRef = useRef(0);
  const selectedLanguage = getTutorLanguage(selectedLanguageCode);
  const ui = getUiCopy(selectedLanguageCode);

  const isCanvasLocked = sessionState === "processing" || sessionState === "speaking";
  const sessionMetrics: SessionMetrics = {
    startedAt: sessionStartedAtRef.current,
    elapsedMs: Date.now() - sessionStartedAtRef.current,
    annotationCount,
    practiceProblemCount,
    visualAidCount,
    userTurnCount: conversationHistory.filter((turn) => turn.role === "user").length,
    assistantTurnCount: conversationHistory.filter((turn) => turn.role === "assistant").length,
    activeCourseFiles: [],
    tutorLanguageCode: selectedLanguageCode,
  };

  useEffect(() => {
    window.localStorage.setItem("eduEquityTutorLanguage", selectedLanguageCode);
  }, [selectedLanguageCode]);

  useEffect(() => {
    document.documentElement.lang = selectedLanguage.recognitionLocale;
    document.documentElement.dir = selectedLanguage.direction;
  }, [selectedLanguage.direction, selectedLanguage.recognitionLocale]);

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  const handleCourseMaterialChange = useCallback((courseMaterial: string) => {
    courseMaterialRef.current = courseMaterial;
  }, []);

  const handleTranscript = useCallback(
    async (transcript: string) => {
      if (!editorRef.current || isCanvasLocked) return;

      setAnnotation(null);
      visualAnimationTokenRef.current += 1;
      const previousConversation = conversationRef.current;
      const userTurn: ConversationTurn = {
        role: "user",
        content: transcript,
        timestamp: Date.now(),
      };
      const conversationForRequest = [...previousConversation, userTurn].slice(-10);
      conversationRef.current = conversationForRequest;
      setConversationHistory(conversationForRequest);

      setSessionState("processing");
      setStatusText(ui.thinking);

      try {
        const exportResult = await exportCanvasAsBase64(editorRef.current, canvasContainerRef);

        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            courseMaterial: courseMaterialRef.current,
            canvasImageBase64: exportResult?.base64 ?? null,
            conversationHistory: conversationForRequest,
            languageCode: selectedLanguage.code,
          }),
        });

        if (!response.ok) throw new Error(`API error ${response.status}`);

        const aiResponse: ClaudeResponse = await response.json();
        const assistantTurn: ConversationTurn = {
          role: "assistant",
          content: buildAssistantHistoryEntry(aiResponse, selectedLanguageCode),
          timestamp: Date.now(),
        };

        conversationRef.current = [...conversationForRequest, assistantTurn].slice(-12);
        setConversationHistory(conversationRef.current);

        if (aiResponse.type === "annotation" && aiResponse.annotation) {
          const refinedAnnotation = await refineAnnotationForCanvas(aiResponse.annotation, exportResult);
          setAnnotation({
            box: refinedAnnotation,
            captureArea: exportResult?.captureArea,
            label: aiResponse.annotation_label?.trim() || ui.checkThis,
          });
          setAnnotationCount((value) => value + 1);
        }

        if (aiResponse.type === "practice_problem" && aiResponse.practice_problem && editorRef.current) {
          insertProblem(editorRef.current, aiResponse.practice_problem);
          setPracticeProblemCount((value) => value + 1);
        }

        if (aiResponse.type === "visual_explanation" && aiResponse.visual_plan && editorRef.current) {
          const currentAnimationToken = visualAnimationTokenRef.current + 1;
          visualAnimationTokenRef.current = currentAnimationToken;
          setVisualAidCount((value) => value + 1);
          void playVisualPlan(editorRef.current, aiResponse.visual_plan, () => {
            return visualAnimationTokenRef.current !== currentAnimationToken;
          });
        }

        setStatusText(aiResponse.speech_text);
        setSessionState("speaking");

        try {
          await speakText(aiResponse.speech_text, {
            languageCode: selectedLanguage.code,
            languageLocale: selectedLanguage.recognitionLocale,
          });
        } catch {
          await speakTextFallback(aiResponse.speech_text, {
            languageCode: selectedLanguage.code,
            languageLocale: selectedLanguage.recognitionLocale,
          });
        }

        setSessionState("idle");
        setStatusText("");
      } catch (error) {
        console.error("Pipeline error:", error);
        conversationRef.current = previousConversation;
        setConversationHistory(previousConversation);
        setSessionState("idle");
        setStatusText(ui.tryAgain);
        setTimeout(() => setStatusText(""), 3000);
      }
    },
    [isCanvasLocked, selectedLanguage.code, selectedLanguage.recognitionLocale, selectedLanguageCode, ui.checkThis, ui.thinking, ui.tryAgain]
  );

  return (
    <main className="relative w-full h-screen overflow-hidden bg-white">
      <div ref={canvasContainerRef} className="absolute inset-0">
        <WhiteboardCanvas
          isLocked={isCanvasLocked}
          tldrawLocale={selectedLanguage.tldrawLocale}
          onEditorReady={handleEditorReady}
        />
      </div>

      <CourseMaterialSidebar
        onCourseMaterialChange={handleCourseMaterialChange}
        selectedLanguageCode={selectedLanguageCode}
        onLanguageChange={setSelectedLanguageCode}
        conversationHistory={conversationHistory}
        sessionMetrics={sessionMetrics}
      />

      <AnnotationOverlay annotation={annotation?.box ?? null} captureArea={annotation?.captureArea} label={annotation?.label ?? ui.checkThis} />

      {annotation && (
        <div className="absolute left-4 top-4 z-[100] bg-black/90 text-white text-xs p-3 rounded-lg font-mono space-y-1 min-w-[160px] shadow-xl border border-white/20">
          <div className="text-yellow-400 font-bold">{annotation.label ?? ui.annotation}</div>
          <div className="text-white/80 text-[10px]">x: {annotation.box.x_pct.toFixed(1)}% · y: {annotation.box.y_pct.toFixed(1)}%</div>
        </div>
      )}

      {statusText && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] max-w-lg px-4 w-full">
          <div
            dir={selectedLanguage.direction}
            className="bg-black/75 text-white text-sm px-5 py-3 rounded-2xl text-center shadow-xl"
          >
            {sessionState === "processing" ? "🤔 " : "💬 "}
            {statusText}
          </div>
        </div>
      )}

      <VoiceController
        onTranscriptReady={handleTranscript}
        isAiActive={isCanvasLocked}
        language={selectedLanguage}
      />

      <div className="absolute bottom-4 left-4 z-[90] pointer-events-none">
        <div dir={selectedLanguage.direction} className="bg-black/60 text-white text-xs px-4 py-2 rounded-full font-mono">
          {ui.sessionStateLabel(sessionState)} · {ui.lockLabel(isCanvasLocked)}
        </div>
      </div>
    </main>
  );
}
