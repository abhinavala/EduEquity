import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import path from "path";
import { pathToFileURL } from "url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// Phase 5: Curriculum upload — extract text/formulas from photo using Groq Llama 4 Scout (MASTER_CONTEXT)
const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
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

async function extractTextFromImage(groq: Groq, imageDataUrl: string) {
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
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
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

async function extractEmbeddedTextFromPdf(base64: string) {
  const loadingTask = getDocument({
    data: Uint8Array.from(Buffer.from(base64, "base64")),
    disableWorker: true,
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
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        console.error("GROQ_API_KEY missing from .env.local");
        return NextResponse.json(
          { error: "Groq not configured" },
          { status: 500 }
        );
      }

      const imageDataUrl = rawFile.startsWith("data:")
        ? rawFile
        : `data:${mimeType ?? "image/png"};base64,${base64}`;
      text = await extractTextFromImage(new Groq({ apiKey }), imageDataUrl);
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
