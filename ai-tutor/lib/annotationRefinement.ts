"use client";

import { AnnotationBox } from "@/lib/types";
import { CanvasCaptureArea, CanvasExportResult } from "@/lib/canvasExport";

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ComponentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toPixelRect(annotation: AnnotationBox, width: number, height: number): PixelRect {
  const x = clamp(Math.round((annotation.x_pct / 100) * width), 0, width - 1);
  const y = clamp(Math.round((annotation.y_pct / 100) * height), 0, height - 1);
  const rectWidth = clamp(Math.round((annotation.width_pct / 100) * width), 1, width - x);
  const rectHeight = clamp(Math.round((annotation.height_pct / 100) * height), 1, height - y);

  return { x, y, width: rectWidth, height: rectHeight };
}

function expandRect(rect: PixelRect, imageWidth: number, imageHeight: number): PixelRect {
  const padX = Math.max(20, Math.round(rect.width * 0.75));
  const padY = Math.max(20, Math.round(rect.height * 0.75));
  const x = clamp(rect.x - padX, 0, imageWidth - 1);
  const y = clamp(rect.y - padY, 0, imageHeight - 1);
  const maxX = clamp(rect.x + rect.width + padX, x + 1, imageWidth);
  const maxY = clamp(rect.y + rect.height + padY, y + 1, imageHeight);

  return {
    x,
    y,
    width: maxX - x,
    height: maxY - y,
  };
}

function isInkPixel(data: Uint8ClampedArray, index: number) {
  const alpha = data[index + 3];
  if (alpha < 40) return false;

  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const saturation = maxChannel - minChannel;

  return luminance < 250 && (saturation > 8 || maxChannel < 235);
}

function getBestComponent(imageData: ImageData, targetRect: PixelRect): ComponentBounds | null {
  const { data, width, height } = imageData;
  const visited = new Uint8Array(width * height);
  const centerX = targetRect.x + targetRect.width / 2;
  const centerY = targetRect.y + targetRect.height / 2;
  let best: ComponentBounds | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const flatIndex = y * width + x;
      if (visited[flatIndex]) continue;

      const pixelIndex = flatIndex * 4;
      if (!isInkPixel(data, pixelIndex)) continue;

      visited[flatIndex] = 1;
      const queue = [flatIndex];
      let head = 0;
      const bounds: ComponentBounds = {
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
        pixelCount: 0,
      };

      while (head < queue.length) {
        const current = queue[head++];
        const currentX = current % width;
        const currentY = Math.floor(current / width);
        bounds.minX = Math.min(bounds.minX, currentX);
        bounds.minY = Math.min(bounds.minY, currentY);
        bounds.maxX = Math.max(bounds.maxX, currentX);
        bounds.maxY = Math.max(bounds.maxY, currentY);
        bounds.pixelCount += 1;

        const neighbors = [
          current - 1,
          current + 1,
          current - width,
          current + width,
        ];

        for (const neighbor of neighbors) {
          if (neighbor < 0 || neighbor >= width * height) continue;
          const neighborX = neighbor % width;
          const neighborY = Math.floor(neighbor / width);
          if (Math.abs(neighborX - currentX) + Math.abs(neighborY - currentY) !== 1) continue;
          if (visited[neighbor]) continue;

          const neighborIndex = neighbor * 4;
          if (!isInkPixel(data, neighborIndex)) continue;

          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }

      if (bounds.pixelCount < 6) continue;

      const componentCenterX = (bounds.minX + bounds.maxX) / 2;
      const componentCenterY = (bounds.minY + bounds.maxY) / 2;
      const dx = componentCenterX - centerX;
      const dy = componentCenterY - centerY;
      const distancePenalty = Math.sqrt(dx * dx + dy * dy);
      const area = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
      const overlapWidth = Math.max(
        0,
        Math.min(bounds.maxX, targetRect.x + targetRect.width) - Math.max(bounds.minX, targetRect.x)
      );
      const overlapHeight = Math.max(
        0,
        Math.min(bounds.maxY, targetRect.y + targetRect.height) - Math.max(bounds.minY, targetRect.y)
      );
      const overlapArea = overlapWidth * overlapHeight;
      const score = bounds.pixelCount * 1.4 + overlapArea * 2 - distancePenalty * 0.9 - area * 0.05;

      if (score > bestScore) {
        bestScore = score;
        best = bounds;
      }
    }
  }

  return best;
}

function componentToAnnotation(bounds: ComponentBounds, searchRect: PixelRect, imageWidth: number, imageHeight: number): AnnotationBox {
  const pad = 6;
  const minX = clamp(searchRect.x + bounds.minX - pad, 0, imageWidth - 1);
  const minY = clamp(searchRect.y + bounds.minY - pad, 0, imageHeight - 1);
  const maxX = clamp(searchRect.x + bounds.maxX + pad, minX + 1, imageWidth);
  const maxY = clamp(searchRect.y + bounds.maxY + pad, minY + 1, imageHeight);

  return {
    x_pct: (minX / imageWidth) * 100,
    y_pct: (minY / imageHeight) * 100,
    width_pct: ((maxX - minX) / imageWidth) * 100,
    height_pct: ((maxY - minY) / imageHeight) * 100,
  };
}

function remapToCanvas(annotation: AnnotationBox, captureArea: CanvasCaptureArea): AnnotationBox {
  return {
    x_pct: captureArea.left_pct + (annotation.x_pct * captureArea.width_pct) / 100,
    y_pct: captureArea.top_pct + (annotation.y_pct * captureArea.height_pct) / 100,
    width_pct: (annotation.width_pct * captureArea.width_pct) / 100,
    height_pct: (annotation.height_pct * captureArea.height_pct) / 100,
  };
}

function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load annotation image"));
    image.src = `data:image/png;base64,${base64}`;
  });
}

export async function refineAnnotationForCanvas(
  annotation: AnnotationBox,
  exportResult: CanvasExportResult | null
): Promise<AnnotationBox> {
  if (!exportResult?.captureArea) return annotation;

  try {
    const image = await loadImage(exportResult.base64);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return remapToCanvas(annotation, exportResult.captureArea);

    context.drawImage(image, 0, 0);

    const initialRect = toPixelRect(annotation, image.width, image.height);
    const searchRect = expandRect(initialRect, image.width, image.height);
    const imageData = context.getImageData(searchRect.x, searchRect.y, searchRect.width, searchRect.height);
    const component = getBestComponent(
      imageData,
      {
        x: initialRect.x - searchRect.x,
        y: initialRect.y - searchRect.y,
        width: initialRect.width,
        height: initialRect.height,
      }
    );

    const refined = component
      ? componentToAnnotation(component, searchRect, image.width, image.height)
      : annotation;

    return remapToCanvas(refined, exportResult.captureArea);
  } catch {
    return remapToCanvas(annotation, exportResult.captureArea);
  }
}
