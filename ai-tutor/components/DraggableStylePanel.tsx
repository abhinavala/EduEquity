"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { DefaultStylePanel } from "tldraw";

/**
 * Wraps tldraw's DefaultStylePanel in a floating panel that can be closed and dragged.
 * Renders via portal into document.body so position:fixed works (tldraw's layout uses transform).
 */
export function DraggableStylePanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [position, setPosition] = useState({ x: 16, y: 80 });
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      e.stopPropagation();
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [position.x, position.y]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    setPosition((prev) => ({
      x: dragStart.current.posX + e.clientX - dragStart.current.x,
      y: dragStart.current.posY + e.clientY - dragStart.current.y,
    }));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const panelContent = !isOpen ? (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="fixed z-[9999] flex items-center gap-1.5 rounded-lg bg-black/90 text-white text-xs font-medium px-3 py-2 shadow-xl border border-white/20 hover:bg-black transition-colors"
      style={{ left: position.x, top: position.y }}
      title="Open style panel"
    >
      <span aria-hidden>🎨</span>
      Colors & style
    </button>
  ) : (
    <div
      className="fixed z-[9999] flex flex-col rounded-xl bg-black/95 text-white shadow-2xl border border-white/20 overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        minWidth: 220,
      }}
    >
      {/* Drag handle row — drag here to move; close button on the right */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing border-b border-white/20 bg-white/10 touch-none"
      >
        <span className="text-[11px] font-semibold text-white/90">Styles — drag to move</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
          className="p-1.5 rounded hover:bg-white/20 text-white/90 hover:text-white transition-colors touch-none"
          aria-label="Close panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-2 max-h-[70vh] overflow-auto overscroll-contain">
        <DefaultStylePanel />
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(panelContent, document.body);
}
