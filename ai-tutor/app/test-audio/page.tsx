"use client";

import { useState } from "react";
import { speakText, speakTextFallback } from "@/lib/elevenlabs";

export default function TestAudio() {
  const [status, setStatus] = useState("idle");

  const test = async () => {
    setStatus("speaking...");
    try {
      await speakText("Look at the red box on your screen. Which formula should we use when time isn't given?");
      setStatus("done — canvas would unlock now");
    } catch (err) {
      setStatus(`ElevenLabs failed: ${err} — trying fallback`);
      await speakTextFallback("This is the browser fallback voice.");
      setStatus("fallback done");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">ElevenLabs Test</h1>
      <button onClick={test} className="bg-blue-600 text-white px-6 py-3 rounded-lg">
        Test speakText()
      </button>
      <p className="mt-4 font-mono">{status}</p>
    </div>
  );
}
