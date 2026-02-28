"use client";

import { useState } from "react";
import { speakText, speakTextFallback } from "@/lib/elevenlabs";

type ElevenLabsUiError = {
  title: string;
  reason: string;
  action: string;
  code?: string;
  requestId?: string;
};

export default function TestAudio() {
  const [status, setStatus] = useState("idle");
  const [errorInfo, setErrorInfo] = useState<ElevenLabsUiError | null>(null);

  const test = async () => {
    setStatus("speaking...");
    setErrorInfo(null);
    try {
      await speakText("Look at the red box on your screen. Which formula should we use when time isn't given?");
      setStatus("done — canvas would unlock now");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const detail =
        err && typeof err === "object" && "detail" in err
          ? String((err as { detail?: string }).detail || "")
          : "";
      const code =
        err && typeof err === "object" && "provider" in err
          ? (err as { provider?: { code?: string; requestId?: string } }).provider?.code
          : undefined;
      const requestId =
        err && typeof err === "object" && "provider" in err
          ? (err as { provider?: { code?: string; requestId?: string } }).provider?.requestId
          : undefined;
      const isQuota = message.includes("quota") || message.includes("402");
      const reason = detail || message;

      setErrorInfo(
        isQuota
          ? {
              title: "ElevenLabs rejected this voice request",
              reason,
              action: "Use a voice allowed by your current ElevenLabs plan, or upgrade the plan tied to this API key.",
              code,
              requestId,
            }
          : {
              title: "ElevenLabs request failed",
              reason,
              action: "Check the API key, voice ID, and network access, then try again.",
              code,
              requestId,
            }
      );

      setStatus(
        isQuota
          ? "ElevenLabs rejected the configured voice. Using browser fallback."
          : "ElevenLabs failed. Using browser fallback."
      );
      await speakTextFallback("This is the browser fallback voice.");
      setStatus(isQuota ? "Fallback done. See the ElevenLabs error details below." : "fallback done");
    }
  };

  return (
    <div className="max-w-3xl p-8">
      <h1 className="mb-4 text-2xl font-bold">ElevenLabs Test</h1>
      <button onClick={test} className="rounded-lg bg-blue-600 px-6 py-3 text-white">
        Test speakText()
      </button>
      <p className="mt-4 font-mono">{status}</p>

      {errorInfo ? (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-slate-900">
          <h2 className="text-lg font-semibold">{errorInfo.title}</h2>
          <p className="mt-2">
            <span className="font-semibold">Reason:</span> {errorInfo.reason}
          </p>
          <p className="mt-2">
            <span className="font-semibold">Next step:</span> {errorInfo.action}
          </p>
          {errorInfo.code ? (
            <p className="mt-2 font-mono text-sm">provider code: {errorInfo.code}</p>
          ) : null}
          {errorInfo.requestId ? (
            <p className="mt-1 font-mono text-sm">request id: {errorInfo.requestId}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
