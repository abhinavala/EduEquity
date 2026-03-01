"use client";

// Phase 5: Gate — SetupScreen (upload notes) → SessionWrapper (whiteboard with course material).

import { useState } from "react";
import SetupScreen from "@/components/SetupScreen";
import SessionWrapper from "./session/SessionWrapper";

export default function Home() {
  const [courseMaterial, setCourseMaterial] = useState<string | null>(null);

  if (courseMaterial === null) {
    return <SetupScreen onStartSession={setCourseMaterial} />;
  }

  return <SessionWrapper courseMaterial={courseMaterial} />;
}
