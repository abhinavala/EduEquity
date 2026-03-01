"use client";

import { useState, useRef } from "react";

interface SetupScreenProps {
  onStartSession: (courseMaterial: string) => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Failed to read file as data URL"));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function SetupScreen({ onStartSession }: SetupScreenProps) {
  const [extractedText, setExtractedText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const [progressLabel, setProgressLabel] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const hasInvalidFile = files.some((file) => {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";

      return !isImage && !isPdf;
    });

    if (files.length === 0 || hasInvalidFile) {
      setError("Please select one or more images or PDFs of your notes or formula sheet.");
      return;
    }

    setError(null);
    setExtractedText("");
    setSelectedFileNames(files.map((file) => file.name));
    setLoading(true);
    try {
      const extractedSections: string[] = [];

      for (const [index, file] of files.entries()) {
        setProgressLabel(`Extracting ${index + 1} of ${files.length}: ${file.name}`);

        const fileData = await fileToBase64(file);
        const res = await fetch("/api/extract-material", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: fileData, mimeType: file.type }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || `Upload failed (${res.status})`);
        }

        const data = (await res.json()) as { text?: string };
        const text = data.text?.trim() ?? "";

        if (text.length > 0) {
          extractedSections.push(`=== ${file.name} ===\n${text}`);
        }
      }

      setExtractedText(extractedSections.join("\n\n"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract text from the uploaded file.");
    } finally {
      setProgressLabel("");
      setLoading(false);
    }
    e.target.value = "";
  };

  const handleStartSession = () => {
    onStartSession(extractedText);
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-bold mb-2">AI Tutor</h1>
      <p className="text-slate-400 mb-6 text-center max-w-md">
        Upload a photo or PDF of your formula sheet or lecture notes. We&apos;ll extract the content so the tutor can use it in your session.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload images or PDFs"
      />

      {!extractedText && !loading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-6 py-4 rounded-xl border-2 border-dashed border-slate-500 hover:border-slate-400 text-slate-300 hover:text-white transition-colors"
        >
          Choose one or more photos or PDFs
        </button>
      )}

      {loading && (
        <p className="text-slate-400 animate-pulse">
          {progressLabel || "Extracting text from your files…"}
        </p>
      )}

      {error && (
        <p className="mt-4 text-red-400 text-sm text-center max-w-md">{error}</p>
      )}

      {extractedText && !loading && (
        <div className="w-full max-w-lg mt-6 space-y-4">
          <div className="bg-slate-800/60 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
              Uploaded Files
            </p>
            <p className="text-sm text-slate-200">
              {selectedFileNames.join(", ")}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 max-h-48 overflow-y-auto">
            <p className="text-slate-300 text-sm whitespace-pre-wrap line-clamp-6">
              {extractedText.slice(0, 500)}
              {extractedText.length > 500 ? "…" : ""}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
            >
              Upload different file
            </button>
            <button
              type="button"
              onClick={handleStartSession}
              className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-500 font-medium text-sm"
            >
              Start Session
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
