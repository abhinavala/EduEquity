"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildBoardPagesForFile } from "@/lib/boardMaterialAssets";
import { DEFAULT_TUTOR_LANGUAGE, TUTOR_LANGUAGES, TutorLanguageCode } from "@/lib/tutorLanguages";
import { BoardPageAsset, ConversationTurn, ProgressLetter, SessionMetrics, UploadedMaterialEntry } from "@/lib/types";
import { getUiCopy } from "@/lib/uiTranslations";

interface CourseMaterialSidebarProps {
  onCourseMaterialChange: (courseMaterial: string) => void;
  onMaterialEntriesChange: (entries: UploadedMaterialEntry[]) => void;
  onFillBoardEntry: (entryId: string) => void;
  onCenterBoardEntry: (entryId: string) => void;
  selectedLanguageCode: TutorLanguageCode;
  onLanguageChange: (languageCode: TutorLanguageCode) => void;
  conversationHistory: ConversationTurn[];
  sessionMetrics: SessionMetrics;
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
    .filter((entry) => entry.text.trim().length > 0)
    .map((entry) => `=== ${entry.name} ===\n${entry.text}`)
    .join("\n\n");
}

async function extractTextFromRenderedPages(boardPages: BoardPageAsset[]) {
  const extractedSections: string[] = [];
  const pagesToRead = boardPages.slice(0, 10);

  for (const page of pagesToRead) {
    const response = await fetch("/api/extract-material", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: page.dataUrl, mimeType: page.mimeType }),
    });

    if (!response.ok) continue;

    const data = (await response.json()) as { text?: string };
    const text = data.text?.trim() ?? "";
    if (text) {
      extractedSections.push(text);
    }
  }

  return extractedSections.join("\n\n").trim();
}

function formatDuration(elapsedMs: number, formatMinutes: (count: number) => string) {
  const minutes = Math.max(1, Math.round(elapsedMs / 60000));
  return formatMinutes(minutes);
}

export default function CourseMaterialSidebar({
  onCourseMaterialChange,
  onMaterialEntriesChange,
  onFillBoardEntry,
  onCenterBoardEntry,
  selectedLanguageCode,
  onLanguageChange,
  conversationHistory,
  sessionMetrics,
}: CourseMaterialSidebarProps) {
  const [entries, setEntries] = useState<UploadedMaterialEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [studentName, setStudentName] = useState("");
  const [isRefreshingLetter, setIsRefreshingLetter] = useState(false);
  const [generatedLetter, setGeneratedLetter] = useState<ProgressLetter | null>(null);
  const [letterError, setLetterError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const courseMaterial = useMemo(() => buildCourseMaterial(entries), [entries]);

  useEffect(() => {
    onCourseMaterialChange(courseMaterial);
  }, [courseMaterial, onCourseMaterialChange]);

  useEffect(() => {
    onMaterialEntriesChange(entries);
  }, [entries, onMaterialEntriesChange]);

  const activeLanguage =
    TUTOR_LANGUAGES.find((language) => language.code === selectedLanguageCode) ?? DEFAULT_TUTOR_LANGUAGE;
  const ui = getUiCopy(selectedLanguageCode);

  const effectiveMetrics = useMemo<SessionMetrics>(
    () => ({
      ...sessionMetrics,
      activeCourseFiles: entries.map((entry) => entry.name),
      tutorLanguageCode: selectedLanguageCode,
    }),
    [entries, selectedLanguageCode, sessionMetrics]
  );

  const previewTrigger = useMemo(
    () =>
      JSON.stringify({
        studentName: studentName.trim(),
        language: selectedLanguageCode,
        files: entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          length: entry.text.length,
        })),
        turns: conversationHistory.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
        metrics: {
          annotationCount: effectiveMetrics.annotationCount,
          practiceProblemCount: effectiveMetrics.practiceProblemCount,
          visualAidCount: effectiveMetrics.visualAidCount,
          userTurnCount: effectiveMetrics.userTurnCount,
          assistantTurnCount: effectiveMetrics.assistantTurnCount,
          activeCourseFiles: effectiveMetrics.activeCourseFiles,
          elapsedMinutes: Math.max(1, Math.round(effectiveMetrics.elapsedMs / 60000)),
        },
      }),
    [
      conversationHistory,
      effectiveMetrics.activeCourseFiles,
      effectiveMetrics.annotationCount,
      effectiveMetrics.assistantTurnCount,
      effectiveMetrics.elapsedMs,
      effectiveMetrics.practiceProblemCount,
      effectiveMetrics.userTurnCount,
      effectiveMetrics.visualAidCount,
      entries,
      selectedLanguageCode,
      studentName,
    ]
  );
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const hasInvalidFile = files.some(
      (file) => !file.type.startsWith("image/") && file.type !== "application/pdf"
    );

    if (files.length === 0 || hasInvalidFile) {
      setError(ui.invalidFileSelection);
      event.target.value = "";
      return;
    }

    setLoading(true);
    setError(null);

    const nextEntries: UploadedMaterialEntry[] = [];
    const failures: string[] = [];

    try {
      for (const [index, file] of files.entries()) {
        setProgressLabel(ui.extractingFile(index + 1, files.length, file.name));

        try {
          const fileData = await fileToBase64(file);
          const boardPages = await buildBoardPagesForFile(file, file.type.startsWith("image/") ? fileData : undefined);
          let text = "";
          const response = await fetch("/api/extract-material", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: fileData, mimeType: file.type }),
          });

          if (response.ok) {
            const data = (await response.json()) as { text?: string };
            text = data.text?.trim() ?? "";
          }

          if (!text && boardPages.length > 0) {
            setProgressLabel(`Reading visible pages for ${file.name}`);
            text = await extractTextFromRenderedPages(boardPages);
          }

          if (!text && boardPages.length === 0) {
            throw new Error(ui.noReadableTextFound);
          }

          nextEntries.push({
            id: `${file.name}-${file.lastModified}-${index}`,
            name: file.name,
            mimeType: file.type,
            text,
            boardPages,
            displayOnBoard: boardPages.length > 0,
          });
        } catch (uploadError) {
          const detail = uploadError instanceof Error ? uploadError.message : "Extraction failed";
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

  const handleToggleBoardDisplay = (id: string) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id && entry.boardPages.length > 0
          ? { ...entry, displayOnBoard: !entry.displayOnBoard }
          : entry
      )
    );
  };

  useEffect(() => {
    if (conversationHistory.length === 0 && entries.length === 0) {
      setGeneratedLetter(null);
      setLetterError(null);
      setIsRefreshingLetter(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsRefreshingLetter(true);
      setLetterError(null);
      const requestMetrics: SessionMetrics = { ...effectiveMetrics };

      try {
        const response = await fetch("/api/progress-letter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName,
            conversationHistory,
            sessionMetrics: requestMetrics,
            courseMaterial,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || `Failed to build letter (${response.status})`);
        }

        const letter = (await response.json()) as ProgressLetter;
        if (!cancelled) {
          setGeneratedLetter(letter);
        }
      } catch (generateError) {
        if (!cancelled) {
          setLetterError(
            generateError instanceof Error ? generateError.message : ui.progressLetterFailed
          );
        }
      } finally {
        if (!cancelled) {
          setIsRefreshingLetter(false);
        }
      }
    }, 650);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    courseMaterial,
    conversationHistory,
    effectiveMetrics,
    entries.length,
    previewTrigger,
    studentName,
    ui.progressLetterFailed,
  ]);

  return (
    <aside
      dir={activeLanguage.direction}
      className="absolute right-4 top-4 z-[120] w-[360px] max-w-[calc(100vw-2rem)]"
    >
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 text-left shadow-2xl backdrop-blur transition hover:border-slate-300"
        aria-expanded={isOpen}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{ui.sessionPanelEyebrow}</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">
            {ui.sessionPanelTitle}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {ui.filesBadge(entries.length)}
          </span>
          <span className="text-lg text-slate-500">{isOpen ? "▾" : "▸"}</span>
        </div>
      </button>

      {isOpen && (
        <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur">
          <div className="max-h-[calc(100vh-8rem)] space-y-5 overflow-y-auto px-4 py-4">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {ui.tutorLanguageEyebrow}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {ui.tutorLanguageDescription(activeLanguage.nativeLabel)}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  {formatDuration(effectiveMetrics.elapsedMs, ui.minutesShort)}
                </span>
              </div>
              <select
                id="tutor-language"
                value={selectedLanguageCode}
                onChange={(event) => onLanguageChange(event.target.value as TutorLanguageCode)}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400"
              >
                {TUTOR_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.nativeLabel} · {language.label}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{ui.courseFilesEyebrow}</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">
                    {ui.courseFilesTitle}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={loading}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? ui.adding : ui.addFiles}
                </button>
              </div>

              <p className="mt-2 text-sm leading-5 text-slate-600">
                {ui.courseFilesDescription}
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

              {(loading || error) && (
                <div className="mt-3 space-y-2">
                  {loading && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                      {progressLabel || "Extracting..."}
                    </div>
                  )}
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                      {error}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                {entries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    {ui.noFilesAdded}
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
                        <div className="flex items-center gap-2">
                          {entry.boardPages.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleToggleBoardDisplay(entry.id)}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                                entry.displayOnBoard
                                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                  : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                              }`}
                              aria-pressed={entry.displayOnBoard}
                              aria-label={`${entry.displayOnBoard ? ui.showingOnBoard : ui.contextOnly} — ${entry.name}`}
                            >
                              {entry.displayOnBoard ? ui.showingOnBoard : ui.contextOnly}
                            </button>
                          )}
                          {entry.boardPages.length > 0 && entry.displayOnBoard && (
                            <button
                              type="button"
                              onClick={() => onCenterBoardEntry(entry.id)}
                              className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-300"
                              aria-label={`${ui.centerPage} — ${entry.name}`}
                              title={ui.centerPageTitle}
                            >
                              {ui.centerPage}
                            </button>
                          )}
                          {entry.boardPages.length > 0 && entry.displayOnBoard && (
                            <button
                              type="button"
                              onClick={() => onFillBoardEntry(entry.id)}
                              className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-700"
                              aria-label={`${ui.fillPage} — ${entry.name}`}
                              title={ui.fillPageTitle}
                            >
                              {ui.fillPage}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveEntry(entry.id)}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                            aria-label={`Remove ${entry.name}`}
                          >
                            {ui.remove}
                          </button>
                        </div>
                      </div>

                      <p className="mt-2 text-[11px] font-medium text-slate-500">
                        {entry.displayOnBoard ? ui.courseFileModeDisplayed : ui.courseFileModeContextOnly}
                      </p>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">
                        {entry.text || ui.noReadableTextFound}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {ui.conversationEyebrow}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">
                    {ui.conversationTitle}
                  </h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {ui.turnsBadge(conversationHistory.length)}
                </span>
              </div>

              <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                {conversationHistory.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    {ui.conversationEmpty}
                  </div>
                ) : (
                  conversationHistory.map((turn, index) => (
                    <div
                      key={`${turn.timestamp}-${index}`}
                      className={`rounded-2xl px-3 py-3 text-sm shadow-sm ${
                        turn.role === "user"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.16em]">
                        <span className={turn.role === "user" ? "text-slate-300" : "text-slate-500"}>
                          {turn.role === "user" ? ui.student : ui.tutor}
                        </span>
                        <span className={turn.role === "user" ? "text-slate-400" : "text-slate-400"}>
                          {new Date(turn.timestamp).toLocaleTimeString(activeLanguage.recognitionLocale, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p
                        dir={activeLanguage.direction}
                        className={`mt-2 whitespace-pre-wrap leading-6 ${
                          turn.role === "user" ? "text-white" : "text-slate-700"
                        }`}
                      >
                        {turn.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {ui.progressLetterEyebrow}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">
                    {ui.progressLetterTitle}
                  </h3>
                </div>
                {isRefreshingLetter && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    {ui.thinking}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-600">
                {ui.progressLetterDescription}
              </p>

              <div className="mt-3 grid gap-3">
                <input
                  type="text"
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  placeholder={ui.studentNamePlaceholder}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="font-semibold text-slate-900">{effectiveMetrics.annotationCount}</div>
                    <div>{ui.highlightedChecks}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="font-semibold text-slate-900">{effectiveMetrics.practiceProblemCount}</div>
                    <div>{ui.practiceProblems}</div>
                  </div>
                </div>
              </div>

              {letterError && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                  {letterError}
                </div>
              )}

              {generatedLetter ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {ui.latestLetterPreview}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{generatedLetter.headline}</p>
                  <p dir={activeLanguage.direction} className="mt-2 text-sm leading-6 text-slate-700">
                    {generatedLetter.summaryParagraph}
                  </p>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
                  {ui.conversationEmpty}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </aside>
  );
}
