"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { AssetRecordType, Editor, TLAssetId, TLShapeId, createShapeId, getHashForString, toRichText } from "tldraw";
import WhiteboardCanvas from "@/components/WhiteboardCanvas";
import AnnotationOverlay from "@/components/AnnotationOverlay";
import CourseMaterialSidebar from "@/components/CourseMaterialSidebar";
import VoiceController from "@/components/VoiceController";
import { CanvasCaptureArea, exportCanvasAsBase64 } from "@/lib/canvasExport";
import { refineAnnotationForCanvas } from "@/lib/annotationRefinement";
import {
  getSpeechPlaybackState,
  speakText,
  speakTextFallback,
  subscribeToSpeechPlayback,
  toggleSpeechPlaybackPause,
} from "@/lib/elevenlabs";
import {
  AnnotationBox,
  ClaudeResponse,
  ConversationTurn,
  SessionMetrics,
  SessionState,
  UploadedMaterialEntry,
} from "@/lib/types";
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

interface InsertedBoardMaterial {
  shapeIds: TLShapeId[];
  assetIds: TLAssetId[];
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

function buildAssetId(entryId: string, pageId: string, dataUrl: string) {
  return AssetRecordType.createId(getHashForString(`${entryId}:${pageId}:${dataUrl}`));
}

function getPrimaryShapeBounds(editor: Editor, shapeIds: TLShapeId[]) {
  if (shapeIds.length === 0) return null;

  const bounds = editor.getShapePageBounds(shapeIds[0]);
  if (!bounds) return null;

  return {
    x: bounds.x,
    y: bounds.y,
    w: Math.max(1, bounds.w),
    h: Math.max(1, bounds.h),
  };
}

function getBoardPageLayout(
  viewport: ReturnType<Editor["getViewportPageBounds"]>,
  assetWidth: number,
  assetHeight: number,
  y: number
) {
  const horizontalPadding = 56;
  const verticalPadding = 88;
  const availableWidth = Math.max(320, viewport.width - horizontalPadding * 2);
  const availableHeight = Math.max(320, viewport.height - verticalPadding * 2);
  const scale = Math.max(
    0.05,
    Math.min(availableWidth / Math.max(assetWidth, 1), availableHeight / Math.max(assetHeight, 1))
  );
  const w = Math.max(260, assetWidth * scale);
  const h = Math.max(320, assetHeight * scale);

  return {
    x: viewport.midX - w / 2,
    y,
    w,
    h,
  };
}

function centerBoardMaterial(editor: Editor, shapeIds: TLShapeId[]) {
  const bounds = getPrimaryShapeBounds(editor, shapeIds);
  if (!bounds) return;

  editor.centerOnPoint(
    {
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2,
    },
    { animation: { duration: 280 } }
  );
}

function fitBoardMaterialPages(editor: Editor, inserted: InsertedBoardMaterial) {
  const viewport = editor.getViewportPageBounds();
  let nextY = viewport.minY + 88;
  const updates: Array<Parameters<Editor["updateShapes"]>[0][number]> = [];

  for (let index = 0; index < inserted.shapeIds.length; index += 1) {
    const shapeId = inserted.shapeIds[index];
    const assetId = inserted.assetIds[index];
    const asset = editor.getAsset(assetId);
    const imageProps = asset?.type === "image" ? asset.props : null;
    const assetWidth = typeof imageProps?.w === "number" ? imageProps.w : 1;
    const assetHeight = typeof imageProps?.h === "number" ? imageProps.h : 1;
    const layout = getBoardPageLayout(viewport, assetWidth, assetHeight, nextY);

    updates.push({
      id: shapeId,
      type: "image",
      x: layout.x,
      y: layout.y,
      props: {
        w: layout.w,
        h: layout.h,
      },
    });

    nextY += layout.h + 40;
  }

  if (updates.length === 0) return;

  editor.run(
    () => {
      editor.updateShapes(updates);
    },
    { ignoreShapeLock: true }
  );
}

function fillBoardMaterial(editor: Editor, inserted: InsertedBoardMaterial) {
  fitBoardMaterialPages(editor, inserted);

  const bounds = getPrimaryShapeBounds(editor, inserted.shapeIds);
  if (!bounds) return;

  editor.zoomToBounds(bounds, {
    inset: 24,
    animation: { duration: 320 },
  });
}

function insertBoardMaterialEntry(
  editor: Editor,
  entry: UploadedMaterialEntry,
  startY: number
): { inserted: InsertedBoardMaterial; nextY: number } {
  const viewport = editor.getViewportPageBounds();
  let nextY = startY;
  const shapeIds: TLShapeId[] = [];
  const assetIds: TLAssetId[] = [];
  const assetsToCreate: Array<Parameters<Editor["createAssets"]>[0][number]> = [];
  const shapesToCreate: Array<Parameters<Editor["createShapes"]>[0][number]> = [];

  for (const page of entry.boardPages) {
    const assetId = buildAssetId(entry.id, page.id, page.dataUrl);
    const shapeId = createShapeId();
    const layout = getBoardPageLayout(viewport, page.width, page.height, nextY);

    assetIds.push(assetId);
    shapeIds.push(shapeId);
    assetsToCreate.push({
      id: assetId,
      typeName: "asset" as const,
      type: "image" as const,
      props: {
        name: page.name,
        src: page.dataUrl,
        w: page.width,
        h: page.height,
        fileSize: page.fileSize,
        mimeType: page.mimeType,
        isAnimated: false,
      },
      meta: {},
    });
    shapesToCreate.push({
      id: shapeId,
      type: "image" as const,
      x: layout.x,
      y: layout.y,
      isLocked: true,
      opacity: 1,
      props: {
        assetId,
        w: layout.w,
        h: layout.h,
      },
    });

    nextY += layout.h + 40;
  }

  editor.run(() => {
    const missingAssets = assetsToCreate.filter((asset) => !editor.getAsset(asset.id));
    if (missingAssets.length > 0) {
      editor.createAssets(missingAssets);
    }

    if (shapesToCreate.length > 0 && editor.canCreateShapes(shapesToCreate)) {
      editor.createShapes(shapesToCreate);
      editor.sendToBack(shapeIds);
    }
  });

  return {
    inserted: { shapeIds, assetIds },
    nextY: nextY + 24,
  };
}

export default function SessionWrapper({ initialCourseMaterial = "" }: SessionWrapperProps) {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [annotation, setAnnotation] = useState<ActiveAnnotation | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [annotationCount, setAnnotationCount] = useState(0);
  const [practiceProblemCount, setPracticeProblemCount] = useState(0);
  const [visualAidCount, setVisualAidCount] = useState(0);
  const [speechPlaybackState, setSpeechPlaybackState] = useState(() => getSpeechPlaybackState());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [uploadedMaterials, setUploadedMaterials] = useState<UploadedMaterialEntry[]>([]);
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
  const insertedBoardMaterialsRef = useRef<Map<string, InsertedBoardMaterial>>(new Map());
  const boardInsertionCursorRef = useRef<number | null>(null);
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

  useEffect(() => {
    return subscribeToSpeechPlayback(setSpeechPlaybackState);
  }, []);

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setEditor(editor);
  }, []);

  const handleCourseMaterialChange = useCallback((courseMaterial: string) => {
    courseMaterialRef.current = courseMaterial;
  }, []);

  const handleMaterialEntriesChange = useCallback((entries: UploadedMaterialEntry[]) => {
    setUploadedMaterials(entries);
  }, []);

  useEffect(() => {
    if (!editor) return;

    const displayedEntryIds = new Set(
      uploadedMaterials.filter((entry) => entry.displayOnBoard).map((entry) => entry.id)
    );
    for (const [entryId, inserted] of insertedBoardMaterialsRef.current.entries()) {
      if (displayedEntryIds.has(entryId)) continue;

      editor.run(
        () => {
          if (inserted.shapeIds.length > 0) {
            editor.deleteShapes(inserted.shapeIds);
          }

          if (inserted.assetIds.length > 0) {
            editor.deleteAssets(inserted.assetIds);
          }
        },
        { ignoreShapeLock: true }
      );

      insertedBoardMaterialsRef.current.delete(entryId);
    }

    if (insertedBoardMaterialsRef.current.size === 0) {
      boardInsertionCursorRef.current = null;
    }

    const newlyInsertedShapeIds: TLShapeId[] = [];
    let nextY = boardInsertionCursorRef.current ?? editor.getViewportPageBounds().minY + 104;
    for (const entry of uploadedMaterials) {
      if (
        insertedBoardMaterialsRef.current.has(entry.id) ||
        !entry.displayOnBoard ||
        entry.boardPages.length === 0
      ) {
        continue;
      }

      const result = insertBoardMaterialEntry(editor, entry, nextY);
      insertedBoardMaterialsRef.current.set(entry.id, result.inserted);
      newlyInsertedShapeIds.push(...result.inserted.shapeIds);
      nextY = result.nextY;
    }

    boardInsertionCursorRef.current = nextY;

    if (newlyInsertedShapeIds.length > 0) {
      centerBoardMaterial(editor, newlyInsertedShapeIds);
    }
  }, [editor, uploadedMaterials]);

  const runTutorTurn = useCallback(
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

  const handleTranscript = useCallback(
    (transcript: string) => {
      void runTutorTurn(transcript);
    },
    [runTutorTurn]
  );

  const handleCreateVisual = useCallback(() => {
    const latestUserTurn = [...conversationRef.current].reverse().find((turn) => turn.role === "user");
    const visualPrompt = latestUserTurn
      ? `Create a visual explanation on the whiteboard for my most recent question: "${latestUserTurn.content}". Base it on what we are discussing right now.`
      : "Create a visual explanation on the whiteboard for the current problem or drawing in front of us.";

    void runTutorTurn(visualPrompt);
  }, [runTutorTurn]);

  const handleToggleSpeechPause = useCallback(() => {
    toggleSpeechPlaybackPause();
  }, []);

  const handleFillBoardEntry = useCallback((entryId: string) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;

    const inserted = insertedBoardMaterialsRef.current.get(entryId);
    if (!inserted || inserted.shapeIds.length === 0) return;

    fillBoardMaterial(currentEditor, inserted);
  }, []);

  const handleCenterBoardEntry = useCallback((entryId: string) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;

    const inserted = insertedBoardMaterialsRef.current.get(entryId);
    if (!inserted || inserted.shapeIds.length === 0) return;

    centerBoardMaterial(currentEditor, inserted.shapeIds);
  }, []);

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
        onMaterialEntriesChange={handleMaterialEntriesChange}
        onFillBoardEntry={handleFillBoardEntry}
        onCenterBoardEntry={handleCenterBoardEntry}
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
        onCreateVisual={handleCreateVisual}
        onToggleSpeechPause={handleToggleSpeechPause}
        isAiActive={isCanvasLocked}
        isSpeaking={sessionState === "speaking" && speechPlaybackState.isSpeaking}
        isSpeechPaused={speechPlaybackState.isPaused}
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
