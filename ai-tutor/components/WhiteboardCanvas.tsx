"use client";

import { useEffect, useRef } from "react";
import { Tldraw, Editor } from "tldraw";
import "tldraw/tldraw.css";
import RightSideToolbar from "./RightSideToolbar";
import { EduEquityMenuPanel, EduEquityNavigationPanel } from "./TldrawTopPanels";

interface WhiteboardCanvasProps {
  isLocked: boolean;
  tldrawLocale: string;
  onEditorReady: (editor: Editor) => void;
}

export default function WhiteboardCanvas({
  isLocked,
  tldrawLocale,
  onEditorReady,
}: WhiteboardCanvasProps) {
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    editorRef.current?.user.updateUserPreferences({ locale: tldrawLocale });
  }, [tldrawLocale]);

  return (
    <div className="eduequity-canvas relative w-full h-screen">
      <Tldraw
        onMount={(editor) => {
          editor.user.updateUserPreferences({ locale: tldrawLocale });
          editorRef.current = editor;
          onEditorReady(editor);
        }}
        components={{
          MenuPanel: EduEquityMenuPanel,
          NavigationPanel: EduEquityNavigationPanel,
          Toolbar: RightSideToolbar,
        }}
      />

      {/*
        THE CANVAS LOCK:
        When isLocked=true, this invisible div (z-50) sits on top of tldraw.
        It intercepts ALL pointer events: clicks, scroll, pinch-zoom, draws.
        bg-transparent = invisible. cursor-wait = user feedback.
        We NEVER touch tldraw's internal API — this CSS trick is enough.
        The screenshot is taken after this renders, so nothing has moved.
      */}
      {isLocked && (
        <div
          className="absolute inset-0 z-50 cursor-wait bg-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
