"use client";

import { Tldraw, Editor } from "tldraw";
import "tldraw/tldraw.css";
import { DraggableStylePanel } from "./DraggableStylePanel";

interface WhiteboardCanvasProps {
  isLocked: boolean;
  onEditorReady: (editor: Editor) => void;
}

export default function WhiteboardCanvas({ isLocked, onEditorReady }: WhiteboardCanvasProps) {
  return (
    <div className="relative w-full h-screen">

      <Tldraw
        onMount={onEditorReady}
        components={{
          StylePanel: DraggableStylePanel,
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
