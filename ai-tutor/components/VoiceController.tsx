"use client";

// Hold the mic button (or Space key) to speak.
// Calls onTranscriptReady() with the final transcript when released.
// Disabled while AI is processing or speaking.

import { useState, useEffect, useRef, useCallback } from "react";
import { TutorLanguageOption } from "@/lib/tutorLanguages";
import { getUiCopy } from "@/lib/uiTranslations";

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface VoiceControllerProps {
  onTranscriptReady: (transcript: string) => void;
  isAiActive: boolean;
  language: TutorLanguageOption;
}

export default function VoiceController({
  onTranscriptReady,
  isAiActive,
  language,
}: VoiceControllerProps) {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const recognitionRef = useRef<InstanceType<typeof SpeechRecognition> | null>(null);
  const ui = getUiCopy(language.code);

  useEffect(() => {
    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!API) {
      console.warn("Web Speech API not supported — use Chrome or Edge");
      return;
    }

    const recognition = new API();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language.recognitionLocale;

    recognition.onstart = () => {
      setIsListening(true);
      setLiveTranscript("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setLiveTranscript(interim || final);
      if (final.trim()) {
        onTranscriptReady(final.trim());
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setLiveTranscript("");
    };
    recognition.onend = () => {
      setIsListening(false);
      setLiveTranscript("");
    };

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.abort();
      } catch {
        // ignore cleanup race
      }
      recognitionRef.current = null;
    };
  }, [language.recognitionLocale, onTranscriptReady]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening && !isAiActive) {
      try {
        recognitionRef.current.start();
      } catch {
        // ignore if already started
      }
    }
  }, [isListening, isAiActive]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isAiActive) {
        e.preventDefault();
        startListening();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        stopListening();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startListening, stopListening, isAiActive]);

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-3">
      <button
        type="button"
        onMouseDown={startListening}
        onMouseUp={stopListening}
        onTouchStart={(e) => {
          e.preventDefault();
          startListening();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          stopListening();
        }}
        disabled={isAiActive}
        title={ui.holdToSpeakTitle}
        className={`
          w-16 h-16 rounded-full flex items-center justify-center text-2xl
          shadow-xl transition-all duration-150 select-none
          ${isAiActive
            ? "bg-gray-400 cursor-not-allowed opacity-60"
            : isListening
              ? "bg-red-500 scale-110 ring-4 ring-red-300"
              : "bg-blue-600 hover:bg-blue-700 active:scale-95 cursor-pointer"
          }
        `}
      >
        {isAiActive ? "⏳" : isListening ? "🔴" : "🎤"}
      </button>

      {!isAiActive && !isListening && (
        <p dir={language.direction} className="text-xs text-gray-500 bg-white/80 px-3 py-1 rounded-full shadow">
          {ui.holdToSpeakIn(language.nativeLabel)}
        </p>
      )}

      {isListening && (
        <div
          dir={language.direction}
          className="bg-black/75 text-white text-sm px-4 py-2 rounded-full max-w-xs text-center"
        >
          {liveTranscript || ui.listening}
        </div>
      )}
    </div>
  );
}
