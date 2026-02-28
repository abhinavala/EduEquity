"use client";

// AnnotationOverlay.tsx
// Renders the red highlight box over the student's mistake.
// Coordinates are percentages (0–100) from Groq's vision response.
//
// STACKING ORDER:
//   z-40 = above tldraw canvas, below the lock overlay (z-50)
//   pointer-events-none = clicks pass through when canvas is unlocked
//
// COORDINATE SYSTEM:
//   This div is absolute inset-0 — same pixel area as the canvas.
//   Groq's x_pct/y_pct applied as CSS % land on the same spot.

import { useEffect, useState } from "react";
import { AnnotationBox } from "@/lib/types";

interface AnnotationOverlayProps {
  annotation: AnnotationBox | null;
}

export default function AnnotationOverlay({ annotation }: AnnotationOverlayProps) {
  const [visible, setVisible] = useState(false);

  // Animate in — small delay ensures DOM is ready before transition
  useEffect(() => {
    if (annotation) {
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [annotation]);

  if (!annotation) return null;

  const boxStyle = {
    left: `${annotation.x_pct}%`,
    top: `${annotation.y_pct}%`,
    width: `${annotation.width_pct}%`,
    height: `${annotation.height_pct}%`,
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">

      {/* Main red box — scales in */}
      <div
        className={`absolute border-[3px] border-red-500 rounded-sm transition-all duration-300 ease-out ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
        style={{ ...boxStyle, backgroundColor: "rgba(239, 68, 68, 0.12)", transformOrigin: "center" }}
      />

      {/* Pulse ring — draws attention */}
      <div
        className={`absolute border-2 border-red-400 rounded-sm animate-ping ${
          visible ? "opacity-20" : "opacity-0"
        }`}
        style={boxStyle}
      />

      {/* "Check this" label above the box */}
      {visible && (
        <div
          className="absolute bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap"
          style={{
            left: `${annotation.x_pct}%`,
            top: `calc(${annotation.y_pct}% - 22px)`,
          }}
        >
          ⚠ Check this
        </div>
      )}
    </div>
  );
}
