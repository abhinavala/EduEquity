import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { pathToFileURL } from "url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// Local vLLM vision model on AMD MI300X for OCR
const LOCAL_VISION_URL = process.env.LOCAL_VISION_URL ?? "http://165.245.139.45:8001/v1";
const LOCAL_VISION_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct";
const PDF_TEXT_PAGE_LIMIT = 10;
const EXTRACTION_PROMPT =
  "Extract all text, formulas, equations, and bullet points from this material. " +
  "Return only the extracted content as plain text, preserving line breaks and structure. Do not add commentary.";
const pdfjsBasePath = path.join(process.cwd(), "node_modules", "pdfjs-dist");
const pdfjsWorkerUrl = pathToFileURL(path.join(pdfjsBasePath, "legacy", "build", "pdf.worker.mjs")).href;
const standardFontDataUrl = `${pathToFileURL(path.join(pdfjsBasePath, "standard_fonts")).href}/`;

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface ExtractMaterialRequest {
  file?: string;
  mimeType?: string;
}

function toBase64Payload(dataUrlOrBase64: string) {
  const match = dataUrlOrBase64.match(/^data:([^;]+);base64,(.+)$/);

  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }

  return { mimeType: null, base64: dataUrlOrBase64 };
}

async function extractTextFromImage(imageDataUrl: string) {
  const response = await fetch(`${LOCAL_VISION_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LOCAL_VISION_MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Local vision model OCR request failed (${response.status}): ${errorText}`);
  }

  const body = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return body.choices?.[0]?.message?.content?.trim() ?? "";
}

async function extractEmbeddedTextFromPdf(base64: string) {
  const loadingTask = getDocument({
    data: Uint8Array.from(Buffer.from(base64, "base64")),
    standardFontDataUrl,
  });

  try {
    const pdf = await loadingTask.promise;
    const pageCount = Math.min(pdf.numPages, PDF_TEXT_PAGE_LIMIT);
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (pageText.length > 0) {
        pages.push(pageText);
      }

      page.cleanup();
    }

    await pdf.destroy();

    return pages.join("\n\n").trim();
  } finally {
    await loadingTask.destroy();
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { file: rawFile, mimeType: providedMimeType } = body as ExtractMaterialRequest;

    if (!rawFile || typeof rawFile !== "string") {
      return NextResponse.json(
        { error: "No file provided. Send { file: '<base64 or data URL>', mimeType }." },
        { status: 400 }
      );
    }

    const { base64, mimeType: detectedMimeType } = toBase64Payload(rawFile);
    const mimeType = providedMimeType || detectedMimeType;

    if (!base64.length) {
      return NextResponse.json({ error: "Invalid file data." }, { status: 400 });
    }

    let text = "";

    if (mimeType === "application/pdf") {
      text = await extractEmbeddedTextFromPdf(base64);

      if (!text) {
        return NextResponse.json(
          { error: "No readable text found in the PDF. If this is a scanned PDF, upload an image export instead." },
          { status: 422 }
        );
      }
    } else if (mimeType?.startsWith("image/")) {
      const imageDataUrl = rawFile.startsWith("data:")
        ? rawFile
        : `data:${mimeType ?? "image/png"};base64,${base64}`;
      text = await extractTextFromImage(imageDataUrl);
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Upload an image or PDF." },
        { status: 400 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "No readable text found in the uploaded file." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Extract-material route error:", error);
    return NextResponse.json(
      { error: "Failed to extract material from image" },
      { status: 500 }
    );
  }
}
