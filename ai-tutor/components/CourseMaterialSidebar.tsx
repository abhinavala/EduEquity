"use client";

import { useEffect, useRef, useState } from "react";

interface UploadedMaterialEntry {
  id: string;
  name: string;
  mimeType: string;
  text: string;
}

interface CourseMaterialSidebarProps {
  onCourseMaterialChange: (courseMaterial: string) => void;
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

function buildCourseMaterial(entries: UploadedMaterialEntry[]) {
  return entries
    .map((entry) => `=== ${entry.name} ===\n${entry.text}`)
    .join("\n\n");
}

export default function CourseMaterialSidebar({ onCourseMaterialChange }: CourseMaterialSidebarProps) {
  const [entries, setEntries] = useState<UploadedMaterialEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onCourseMaterialChange(buildCourseMaterial(entries));
  }, [entries, onCourseMaterialChange]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const hasInvalidFile = files.some((file) => !file.type.startsWith("image/") && file.type !== "application/pdf");

    if (files.length === 0 || hasInvalidFile) {
      setError("Please select images or PDFs only.");
      event.target.value = "";
      return;
    }

    setLoading(true);
    setError(null);

    const nextEntries: UploadedMaterialEntry[] = [];
    const failures: string[] = [];

    try {
      for (const [index, file] of files.entries()) {
        setProgressLabel(`Extracting ${index + 1} of ${files.length}: ${file.name}`);

        try {
          const fileData = await fileToBase64(file);
          const response = await fetch("/api/extract-material", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: fileData, mimeType: file.type }),
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            const message = (data as { error?: string }).error || `Upload failed (${response.status})`;
            throw new Error(message);
          }

          const data = (await response.json()) as { text?: string };
          const text = data.text?.trim() ?? "";

          if (!text) {
            throw new Error("No readable text found.");
          }

          nextEntries.push({
            id: `${file.name}-${file.lastModified}-${index}`,
            name: file.name,
            mimeType: file.type,
            text,
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Extraction failed";
          failures.push(`${file.name}: ${detail}`);
        }
      }

      if (nextEntries.length > 0) {
        setEntries((current) => [...current, ...nextEntries]);
      }

      if (failures.length > 0) {
        setError(failures.join(" "));
      }
    } finally {
      setLoading(false);
      setProgressLabel("");
      event.target.value = "";
    }
  };

  const handleRemoveEntry = (id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  };

  return (
    <aside className="absolute right-4 top-4 z-[120] w-[320px] rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Course Files</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">What the tutor should use</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          {entries.length} active
        </span>
      </div>

      <p className="mt-2 text-sm leading-5 text-slate-600">
        Add or remove PDFs and images at any time. Only the active files here are used as tutoring context.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        onChange={handleFileChange}
        className="hidden"
        aria-label="Add course files"
      />

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Adding..." : "Add Files"}
        </button>
        {loading && (
          <span className="text-xs font-medium text-slate-500">
            {progressLabel || "Extracting..."}
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 max-h-[340px] space-y-2 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
            No files added yet.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{entry.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">
                    {entry.mimeType === "application/pdf" ? "PDF" : "Image"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveEntry(entry.id)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                  aria-label={`Remove ${entry.name}`}
                >
                  Remove
                </button>
              </div>

              <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">
                {entry.text}
              </p>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
