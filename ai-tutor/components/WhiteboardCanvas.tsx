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
  const initializedPanelsRef = useRef<WeakSet<HTMLElement>>(new WeakSet());

  useEffect(() => {
    editorRef.current?.user.updateUserPreferences({ locale: tldrawLocale });
  }, [tldrawLocale]);

  useEffect(() => {
    const root = document.querySelector(".eduequity-canvas");
    if (!root) return;

    const makePanelDraggable = (panel: HTMLElement) => {
      if (initializedPanelsRef.current.has(panel)) return;
      initializedPanelsRef.current.add(panel);

      const rect = panel.getBoundingClientRect();
      panel.style.position = "fixed";
      panel.style.left = `${Math.max(8, rect.left)}px`;
      panel.style.top = `${Math.max(8, rect.top)}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.zIndex = "9999";

      const handle = document.createElement("div");
      handle.setAttribute("aria-label", "Drag style panel");
      handle.textContent = "↕ Drag";
      handle.style.width = "100%";
      handle.style.height = "22px";
      handle.style.display = "flex";
      handle.style.alignItems = "center";
      handle.style.justifyContent = "center";
      handle.style.fontSize = "11px";
      handle.style.fontWeight = "600";
      handle.style.letterSpacing = "0.02em";
      handle.style.cursor = "grab";
      handle.style.userSelect = "none";
      handle.style.touchAction = "none";
      handle.style.borderBottom = "1px solid rgba(148, 163, 184, 0.35)";
      handle.style.background = "rgba(248, 250, 252, 0.95)";

      panel.insertBefore(handle, panel.firstChild);

      let pointerId: number | null = null;
      let startX = 0;
      let startY = 0;
      let originLeft = 0;
      let originTop = 0;

      const onPointerMove = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        const nextLeft = Math.max(8, originLeft + (event.clientX - startX));
        const nextTop = Math.max(8, originTop + (event.clientY - startY));
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
      };

      const onPointerUp = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        pointerId = null;
        handle.style.cursor = "grab";
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch {
          // no-op
        }
      };

      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        originLeft = parseFloat(panel.style.left || "0") || 0;
        originTop = parseFloat(panel.style.top || "0") || 0;
        handle.style.cursor = "grabbing";
        handle.setPointerCapture(event.pointerId);
      });

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerUp);
    };

    const scanPanels = () => {
      const panels = root.querySelectorAll<HTMLElement>(".tlui-style-panel");
      panels.forEach(makePanelDraggable);
    };

    scanPanels();

    const observer = new MutationObserver(() => {
      scanPanels();
    });

    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, []);

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
