"use client";

import {
  DefaultColorStyle,
  DefaultSizeStyle,
  DefaultStylePanel,
  DefaultToolbar,
  DefaultToolbarContent,
  getColorValue,
  getDefaultColorTheme,
  STROKE_SIZES,
  TldrawUiToolbarButton,
  useEditor,
  useRelevantStyles,
  useTranslation,
  useValue,
} from "tldraw";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

function PencilPreviewIcon({ color, size }: { color: string; size: "s" | "m" | "l" | "xl" }) {
  const strokeWidth = Math.max(2, STROKE_SIZES[size] ?? STROKE_SIZES.m);

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 19.2 17.2 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path d="M16.2 5.8 18.6 8.2 20.4 6.4 18 4z" fill={color} />
      <path d="m4 20 2.8-.8L4.8 17z" fill={color} />
    </svg>
  );
}

function FloatingStylePanel({
  isOpen,
  isMinimized,
  onMinimizeToggle,
  position,
  onPositionChange,
  children,
}: {
  isOpen: boolean;
  isMinimized: boolean;
  onMinimizeToggle: () => void;
  position: { x: number; y: number };
  onPositionChange: (position: { x: number; y: number }) => void;
  children: React.ReactNode;
}) {
  const dragStateRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!dragStateRef.current) return;

      const nextX = Math.max(12, dragStateRef.current.originX + event.clientX - dragStateRef.current.x);
      const nextY = Math.max(12, dragStateRef.current.originY + event.clientY - dragStateRef.current.y);
      onPositionChange({ x: nextX, y: nextY });
    }

    function handlePointerUp() {
      dragStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [onPositionChange]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;

    dragStateRef.current = {
      x: event.clientX,
      y: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  }

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="eduequity-style-floating-panel"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="eduequity-style-floating-header"
        onPointerDown={handlePointerDown}
      >
        <span className="eduequity-style-floating-title">Styles</span>
        <button
          type="button"
          className="eduequity-style-floating-action"
          onClick={onMinimizeToggle}
          aria-label={isMinimized ? "Expand style panel" : "Minimize style panel"}
          title={isMinimized ? "Expand" : "Minimize"}
        >
          {isMinimized ? "+" : "−"}
        </button>
      </div>

      {!isMinimized && <div className="eduequity-style-floating-body">{children}</div>}
    </div>,
    document.body
  );
}

function StylePanelButton() {
  const editor = useEditor();
  const msg = useTranslation();
  const relevantStyles = useRelevantStyles();
  const color = relevantStyles?.get(DefaultColorStyle);
  const size = relevantStyles?.get(DefaultSizeStyle);
  const isDarkMode = useValue("is dark mode", () => editor.user.getIsDarkMode(), [editor]);
  const disableStylePanel = useValue(
    "disable style panel",
    () => editor.isInAny("hand", "zoom", "eraser", "laser"),
    [editor]
  );
  const triggerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 124, y: 110 });

  const theme = getDefaultColorTheme({ isDarkMode });
  const currentColor =
    color?.type === "shared"
      ? getColorValue(theme, color.value, "solid")
      : getColorValue(theme, "black", "solid");
  const currentSize = size?.type === "shared" ? size.value : "m";

  function handleTogglePanel() {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        x: Math.max(16, rect.right + 16),
        y: Math.max(16, rect.top - 24),
      });
      setIsMinimized(false);
      editor.updateInstanceState({ isChangingStyle: true });
      setIsOpen(true);
      return;
    }

    editor.updateInstanceState({ isChangingStyle: false });
    setIsOpen((value) => !value);
  }

  function handleMinimizeToggle() {
    setIsMinimized((value) => !value);
  }

  return (
    <>
      <div ref={triggerRef}>
        <TldrawUiToolbarButton
          type="icon"
          data-testid="eduequity-style-menu.button"
          title={msg("style-panel.title")}
          disabled={disableStylePanel}
          onClick={handleTogglePanel}
        >
          <div className="eduequity-style-trigger">
            <PencilPreviewIcon
              color={disableStylePanel ? "var(--tl-color-muted-1)" : currentColor}
              size={currentSize}
            />
          </div>
        </TldrawUiToolbarButton>
      </div>

      <FloatingStylePanel
        isOpen={isOpen}
        isMinimized={isMinimized}
        onMinimizeToggle={handleMinimizeToggle}
        position={position}
        onPositionChange={setPosition}
      >
        <div className="eduequity-style-popover">
          <DefaultStylePanel />
        </div>
      </FloatingStylePanel>
    </>
  );
}

export default function RightSideToolbar() {
  return (
    <DefaultToolbar
      orientation="vertical"
      minItems={6}
      minSizePx={340}
      maxItems={9}
      maxSizePx={640}
    >
      <DefaultToolbarContent />
      <StylePanelButton />
    </DefaultToolbar>
  );
}
