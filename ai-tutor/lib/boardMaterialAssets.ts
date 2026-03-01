"use client";

import { BoardPageAsset } from "@/lib/types";

const PDF_RENDER_SCALE = 1.35;
const PDF_RENDER_PAGE_LIMIT = 12;
const PDF_MAX_RENDER_WIDTH = 1600;

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }

      reject(new Error("Failed to read file as data URL."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function getBase64ByteSize(dataUrl: string) {
  const payload = dataUrl.split(",")[1] ?? "";
  const normalizedLength = payload.endsWith("==")
    ? payload.length - 2
    : payload.endsWith("=")
      ? payload.length - 1
      : payload.length;

  return Math.max(1, Math.floor((normalizedLength * 3) / 4));
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load the uploaded image."));
    image.src = dataUrl;
  });
}

async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
      }

      return pdfjs;
    });
  }

  return pdfjsPromise;
}

async function buildImageBoardPage(file: File, existingDataUrl?: string): Promise<BoardPageAsset[]> {
  const dataUrl = existingDataUrl ?? (await fileToDataUrl(file));
  const image = await loadImage(dataUrl);

  return [
    {
      id: `${file.name}-${file.lastModified}-page-1`,
      name: file.name,
      mimeType: file.type || "image/png",
      dataUrl,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      fileSize: file.size || getBase64ByteSize(dataUrl),
      pageNumber: 1,
    },
  ];
}

async function buildPdfBoardPages(file: File): Promise<BoardPageAsset[]> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });

  try {
    const pdf = await loadingTask.promise;
    const pageCount = Math.min(pdf.numPages, PDF_RENDER_PAGE_LIMIT);
    const pages: BoardPageAsset[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(PDF_RENDER_SCALE, PDF_MAX_RENDER_WIDTH / Math.max(baseViewport.width, 1));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        page.cleanup();
        throw new Error("Failed to render the uploaded PDF page.");
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;

      const dataUrl = canvas.toDataURL("image/png");
      pages.push({
        id: `${file.name}-${file.lastModified}-page-${pageNumber}`,
        name: `${file.name} · Page ${pageNumber}`,
        mimeType: "image/png",
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        fileSize: getBase64ByteSize(dataUrl),
        pageNumber,
      });

      page.cleanup();
    }

    await pdf.destroy();
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

export async function buildBoardPagesForFile(file: File, existingDataUrl?: string): Promise<BoardPageAsset[]> {
  if (file.type === "application/pdf") {
    return buildPdfBoardPages(file);
  }

  if (file.type.startsWith("image/")) {
    return buildImageBoardPage(file, existingDataUrl);
  }

  return [];
}
