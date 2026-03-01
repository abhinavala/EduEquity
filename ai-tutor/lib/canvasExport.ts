// lib/canvasExport.ts
// Two capture methods:
//   Primary: html2canvas on the container div — captures exact pixel view
//   Fallback: tldraw's toImage — clean vector-quality PNG of all shapes
//
// For AI annotation coordinates, the exact viewport matters more than vector cleanliness.
// We therefore prefer html2canvas when a container ref is available and only fall back to
// tldraw's export if the DOM capture fails.

import type { RefObject } from "react";
import { Editor } from "tldraw";

export interface CanvasCaptureArea {
  left_pct: number;
  top_pct: number;
  width_pct: number;
  height_pct: number;
}

export interface CanvasExportResult {
  base64: string; // Raw base64, no "data:" prefix — ready for Groq image_url
  width: number;
  height: number;
  method: "tldraw" | "html2canvas";
  captureArea?: CanvasCaptureArea;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

export async function exportCanvasAsBase64(
  editor: Editor,
  containerRef?: RefObject<HTMLDivElement | null>
): Promise<CanvasExportResult | null> {
  if (containerRef?.current) {
    try {
      return await exportViaHtml2Canvas(containerRef.current);
    } catch (err) {
      console.warn("html2canvas export failed, trying tldraw:", err);
    }
  }

  try {
    const result = await exportViaTldraw(editor);
    if (result) return result;
  } catch (err) {
    console.error("tldraw export also failed:", err);
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
  const captureElement = (container.querySelector(".tl-canvas") as HTMLElement | null) ?? container;
  const containerRect = container.getBoundingClientRect();
  const captureRect = captureElement.getBoundingClientRect();

  const canvas = await html2canvas(captureElement, {
    useCORS: true,
    scale: 1,
    logging: false,
    backgroundColor: "#ffffff",
    width: Math.round(captureRect.width),
    height: Math.round(captureRect.height),
  });

  const base64 = canvas.toDataURL("image/png").split(",")[1];
  return {
    base64,
    width: canvas.width,
    height: canvas.height,
    method: "html2canvas",
    captureArea: {
      left_pct: clampPercent(((captureRect.left - containerRect.left) / containerRect.width) * 100),
      top_pct: clampPercent(((captureRect.top - containerRect.top) / containerRect.height) * 100),
      width_pct: clampPercent((captureRect.width / containerRect.width) * 100),
      height_pct: clampPercent((captureRect.height / containerRect.height) * 100),
    },
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
