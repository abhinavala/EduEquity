// lib/canvasExport.ts
// Two capture methods:
//   Primary: tldraw's toImage — clean vector-quality PNG of all shapes
//   Fallback: html2canvas on the container div — captures exact pixel view
//
// We try tldraw first. If it fails or canvas is empty, fall back.
// The fallback is actually MORE accurate for annotation coordinates
// because it captures exactly what the user sees, pixel-for-pixel.

import type { RefObject } from "react";
import { Editor } from "tldraw";

export interface CanvasExportResult {
  base64: string; // Raw base64, no "data:" prefix — ready for Groq image_url
  width: number;
  height: number;
  method: "tldraw" | "html2canvas";
}

export async function exportCanvasAsBase64(
  editor: Editor,
  containerRef?: RefObject<HTMLDivElement | null>
): Promise<CanvasExportResult | null> {
  // Try tldraw export first
  try {
    const result = await exportViaTldraw(editor);
    if (result) return result;
  } catch (err) {
    console.warn("tldraw export failed, trying html2canvas:", err);
  }

  // Fallback to html2canvas
  if (containerRef?.current) {
    try {
      return await exportViaHtml2Canvas(containerRef.current);
    } catch (err) {
      console.error("html2canvas also failed:", err);
    }
  }

  return null;
}

async function exportViaTldraw(editor: Editor): Promise<CanvasExportResult | null> {
  // Empty array = all shapes on current page; toImage returns undefined when no shapes
  const result = await editor.toImage([], {
    format: "png",
    background: true,
    scale: 1,
    pixelRatio: 1,
  });
  if (!result) return null;

  const base64 = await blobToBase64(result.blob);
  return {
    base64,
    width: result.width,
    height: result.height,
    method: "tldraw",
  };
}

async function exportViaHtml2Canvas(
  container: HTMLDivElement
): Promise<CanvasExportResult | null> {
  const { default: html2canvas } = await import("html2canvas");

  const canvas = await html2canvas(container, {
    useCORS: true,
    scale: 1,
    logging: false,
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const base64 = canvas.toDataURL("image/png").split(",")[1];
  return {
    base64,
    width: canvas.width,
    height: canvas.height,
    method: "html2canvas",
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
