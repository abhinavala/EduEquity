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
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbarButton,
  useEditor,
  useRelevantStyles,
  useTranslation,
  useValue,
} from "tldraw";
import { useCallback } from "react";

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
      <path
        d="M16.2 5.8 18.6 8.2 20.4 6.4 18 4z"
        fill={color}
      />
      <path
        d="m4 20 2.8-.8L4.8 17z"
        fill={color}
      />
    </svg>
  );
}

function StylePopoverButton() {
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

  const handleStylesOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        editor.updateInstanceState({ isChangingStyle: false });
      }
    },
    [editor]
  );

  const theme = getDefaultColorTheme({ isDarkMode });
  const currentColor =
    color?.type === "shared"
      ? getColorValue(theme, color.value, "solid")
      : getColorValue(theme, "black", "solid");
  const currentSize = size?.type === "shared" ? size.value : "m";

  return (
    <TldrawUiPopover id="eduequity-style-menu" onOpenChange={handleStylesOpenChange}>
      <TldrawUiPopoverTrigger>
        <TldrawUiToolbarButton
          type="icon"
          data-testid="eduequity-style-menu.button"
          title={msg("style-panel.title")}
          disabled={disableStylePanel}
        >
          <div className="eduequity-style-trigger">
            <PencilPreviewIcon
              color={disableStylePanel ? "var(--tl-color-muted-1)" : currentColor}
              size={currentSize}
            />
          </div>
        </TldrawUiToolbarButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent side="left" align="center" sideOffset={12} autoFocusFirstButton={false}>
        <div className="eduequity-style-popover">
          <DefaultStylePanel />
        </div>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
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
      <StylePopoverButton />
    </DefaultToolbar>
  );
}
