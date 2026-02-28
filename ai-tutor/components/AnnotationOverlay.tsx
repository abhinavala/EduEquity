"use client";

import { AnnotationBox } from "@/lib/types";

interface AnnotationOverlayProps {
  annotation: AnnotationBox | null;
}

export default function AnnotationOverlay({ annotation }: AnnotationOverlayProps) {
  if (!annotation) return null;

  return (
    /*
      MUST cover the exact same area as WhiteboardCanvas.
      absolute inset-0 = same dimensions as the viewport.
      pointer-events-none = clicks pass through to canvas below.
      z-40 = below lock overlay (z-50), above tldraw content.
      Coordinates are % → CSS left/top/width/height %.
    */
    <div className="absolute inset-0 z-40 pointer-events-none">
      <div
        className="absolute border-4 border-red-500 rounded-sm"
        style={{
          left: `${annotation.x_pct}%`,
          top: `${annotation.y_pct}%`,
          width: `${annotation.width_pct}%`,
          height: `${annotation.height_pct}%`,
          backgroundColor: "rgba(239, 68, 68, 0.15)",
        }}
      />
    </div>
  );
}
