"use client";

// Phase 1: goes directly to session with empty course material.
// Phase 5 replaces this with SetupScreen → SessionWrapper.

import SessionWrapper from "./session/SessionWrapper";

export default function Home() {
  return <SessionWrapper courseMaterial="" />;
}
