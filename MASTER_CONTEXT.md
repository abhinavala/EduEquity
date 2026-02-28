# AI TUTOR — MASTER PROJECT CONTEXT
### This document is the source of truth. Every phase session must read this first.

---

## What We Are Building

An AI-powered STEM tutoring web app for the **Hack for Humanity Hackathon**. Think **Notability or GoodNotes, but with an AI tutor watching your work** — students use a digital note-taking canvas (tldraw) to write math problems, draw diagrams, and work through equations directly on screen using a mouse, trackpad, or stylus. This is **not** a camera pointed at a physical whiteboard or a projected screen. The entire experience is on-device: write on screen, speak a question, get tutored.

The flow:
1. Student uploads their professor's formula sheet or lecture notes (photo → OCR)
2. Student works through a STEM problem on the digital canvas
3. Student speaks a question aloud ("Is this right?")
4. AI locks the canvas so nothing moves
5. Takes a screenshot of the student's digital work
6. Sends it to **Gemini 2.0 Flash** to identify the mistake and its exact location
7. Returns percentage coordinates of the error + a Socratic question (never the answer)
8. Speaks the response aloud using **ElevenLabs** (sponsor — critical)
9. Renders a red highlight box over the exact mistake on screen
10. Unlocks the canvas when audio finishes

This is **not** a generic chatbot. It is a spatial AI that monitors your digital note-taking in real time.

---

## Sponsor Requirements (Non-Negotiable)

### ElevenLabs (Sponsor Prize: 6 months Scale Tier)
- **ALL voice output must use ElevenLabs** — no browser TTS as the primary method
- Model: `eleven_turbo_v2_5` (lowest latency, best for real-time)
- Endpoint: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream`
- The voice IS the emotional heart of the demo — a warm, patient tutor voice
- Browser `SpeechSynthesis` is only an emergency fallback if the API call fails
- In your demo pitch: explicitly call out ElevenLabs by name

### AMD (Sponsor Prize: $1,000)
- The app must be **deployed on AMD-powered infrastructure**
- AWS: use `c5a`, `m5a`, or `t3a` instances (all AMD EPYC processors)
- GCP: use `N2D` instances (AMD EPYC)
- The Next.js API routes that call Groq and ElevenLabs run on this AMD server
- During the demo: show the AWS/GCP console with the instance type visible
- In your pitch: say "Our inference backend runs on AMD EPYC processors via [AWS/GCP]"

---

## Tech Stack (Locked — Do Not Change)

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 14, App Router | TypeScript + Tailwind CSS |
| Whiteboard | `tldraw` npm package | NOT HTML5 canvas from scratch |
| **AI Vision (canvas analysis)** | **Gemini 2.0 Flash** | `gemini-2.0-flash` via `@google/generative-ai` — better spatial reasoning and math OCR |
| **AI Text Only (no image)** | **Groq — Llama 3.3 70B** | `llama-3.3-70b-versatile` — faster for text-only responses |
| **AI OCR (curriculum upload)** | **Groq — Llama 4 Scout** | `meta-llama/llama-4-scout-17b-16e-instruct` — Phase 5 only |
| Voice Output | **ElevenLabs** `eleven_turbo_v2_5` | Sponsor — required |
| Voice Input | `window.SpeechRecognition` | Browser Web Speech API, Chrome only |
| Hosting | AMD-powered cloud instance | AWS c5a / m5a / t3a or GCP N2D |
| SDKs | `groq-sdk` + `@google/generative-ai` | Both free tier, no credit card |

---

## Why This Model Split

**Gemini 2.0 Flash** handles canvas image analysis (the `analyze` route when an image is present) because it has a 1M token context window, superior spatial reasoning for annotation coordinates, and stronger math formula OCR than Llama 4 Scout. Free tier: 1,500 requests/day, 10 RPM. Get a free key at aistudio.google.com — no credit card.

**Groq Llama 3.3 70B** handles text-only responses (no image) because it runs at 607 tokens/second on Groq's LPU hardware — faster for conversational replies that don't need vision.

**Groq Llama 4 Scout** is kept for Phase 5 curriculum OCR only (extract-material route) — it's fast and the task is simpler structured text extraction.

**Model selection rule — apply this in every API route:**
- Route receives a canvas **image** → Gemini 2.0 Flash (`gemini-2.0-flash`)
- Route is **text only** (no image) → Groq Llama 3.3 70B (`llama-3.3-70b-versatile`)
- Phase 5 **curriculum OCR** → Groq Llama 4 Scout (`meta-llama/llama-4-scout-17b-16e-instruct`)

---

## Environment Variables

All phases assume these exist in `.env.local` at project root:

```
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

**How to get GROQ_API_KEY (free, 2 minutes):**
1. Go to console.groq.com
2. Sign up — no credit card needed
3. API Keys → Create API Key
4. Starts with `gsk_`

**How to get GEMINI_API_KEY (free, 2 minutes):**
1. Go to aistudio.google.com
2. Sign in with any Google account — no credit card needed
3. Click "Get API key" → Create API key
4. Starts with `AIza`
5. Free tier: 1,500 requests/day, 10 RPM (plenty for hackathon)

**How to get ELEVENLABS_VOICE_ID:**
1. Sign in at elevenlabs.io
2. Voices → Voice Library → search "Rachel"
3. Copy the Voice ID from the voice card
4. Recommended: **Rachel** — calm, warm, professional

---

## Project File Structure

Every session must produce files at these exact paths.

```
ai-tutor/
├── .env.local
├── package.json
├── next.config.js
├── tailwind.config.ts
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                       ← Gate: SetupScreen OR SessionWrapper
│   ├── session/
│   │   └── SessionWrapper.tsx         ← Main session — ALL state lives here
│   └── api/
│       ├── analyze/route.ts           ← POST: transcript + canvas image → JSON response
│       ├── speak/route.ts             ← POST: text → ElevenLabs audio stream
│       └── extract-material/route.ts  ← POST: uploaded image → extracted text
├── components/
│   ├── SetupScreen.tsx
│   ├── WhiteboardCanvas.tsx
│   ├── AnnotationOverlay.tsx
│   └── VoiceController.tsx
└── lib/
    ├── types.ts                       ← Shared interfaces — import from here always
    ├── canvasExport.ts
    └── elevenlabs.ts
```

---

## Shared TypeScript Types (`lib/types.ts`)

**This file must exist before any other phase touches anything. All files import from here.**

```typescript
export interface AnnotationBox {
  x_pct: number;      // 0–100: left edge as % of canvas width
  y_pct: number;      // 0–100: top edge as % of canvas height
  width_pct: number;  // 0–100: box width as % of canvas width
  height_pct: number; // 0–100: box height as % of canvas height
}

export interface ClaudeResponse {
  // Named ClaudeResponse for interface consistency — powered by Gemini/Groq
  type: "annotation" | "practice_problem" | "socratic_response";
  speech_text: string;         // What ElevenLabs speaks aloud
  annotation?: AnnotationBox;  // Present only when type === "annotation"
  practice_problem?: string;   // Present only when type === "practice_problem"
}

export type SessionState = "idle" | "listening" | "processing" | "speaking";
// idle       → student draws and speaks freely
// listening  → mic open
// processing → AI API call in flight, canvas LOCKED
// speaking   → ElevenLabs audio playing, canvas LOCKED

// Conversation history — rolling window for natural multi-turn dialogue
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}
```

---

## Application State (Lives in SessionWrapper.tsx)

```typescript
const [sessionState, setSessionState] = useState<SessionState>("idle");
const [annotation, setAnnotation] = useState<AnnotationBox | null>(null);
const editorRef = useRef<Editor | null>(null);
const courseMaterialRef = useRef<string>("");          // filled by Phase 5
const canvasContainerRef = useRef<HTMLDivElement>(null);
const conversationRef = useRef<ConversationTurn[]>([]); // rolling 8-turn history

// Canvas locked when:
const isCanvasLocked = sessionState === "processing" || sessionState === "speaking";
```

---

## The Canvas Lock Mechanism

```tsx
// WhiteboardCanvas.tsx
<div className="relative w-full h-screen">
  <Tldraw onMount={onEditorReady} />
  {isLocked && (
    <div className="absolute inset-0 z-50 cursor-wait bg-transparent" />
  )}
</div>
```

- Invisible div at `z-50` absorbs ALL pointer events
- `bg-transparent` = invisible, `cursor-wait` = feedback
- Never touch tldraw internals
- Screenshot taken AFTER lock renders → coordinates are stable

---

## The Annotation Coordinate System

Both `WhiteboardCanvas` and `AnnotationOverlay` are `position: absolute, inset: 0` — they cover the exact same pixel area. Groq returns percentages (0–100) of the screenshot. Those same percentages applied as CSS `left/top/width/height %` on the overlay land the box on the same pixel. This works **only** because the canvas was locked before the screenshot.

---

## Gemini API Pattern (Canvas Vision Calls) — `app/api/analyze/route.ts`

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Vision call — canvas image present:
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const imagePart = {
  inlineData: {
    data: canvasImageBase64,      // raw base64, no data: prefix
    mimeType: "image/png" as const,
  },
};

const result = await model.generateContent([
  { text: systemPrompt },
  imagePart,
  { text: `Student says: "${transcript}"` },
]);

const raw = result.response.text();
// Strip any ```json fences Gemini may add
const clean = raw.replace(/```json\n?|```/g, "").trim();
const parsed = JSON.parse(clean) as ClaudeResponse;
```

**Package:** `npm install @google/generative-ai`

---

## Groq API Pattern (Text-Only Calls) — `app/api/analyze/route.ts`

```typescript
import Groq from "groq-sdk";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Text-only call — no canvas image:
const completion = await groq.chat.completions.create({
  model: "llama-3.3-70b-versatile",
  response_format: { type: "json_object" },   // enforces JSON natively
  max_tokens: 1024,
  messages: [
    { role: "system", content: systemPrompt },
    ...conversationHistory,                    // ← rolling 8-turn history
    { role: "user", content: `Student says: "${transcript}"` },
  ],
});

const result = JSON.parse(completion.choices[0].message.content ?? "{}");
```

**Package:** `npm install groq-sdk` (already installed from Phase 1)

**Critical differences — Gemini vs Groq:**
| Aspect | Gemini (`@google/generative-ai`) | Groq (`groq-sdk`) |
|--------|----------------------------------|-------------------|
| When to use | Canvas image present | Text only |
| Image format | `inlineData: { data: base64, mimeType }` | N/A |
| JSON enforcement | Prompt instruction (strip fences after) | `response_format: { type: "json_object" }` |
| Response extraction | `result.response.text()` | `choices[0].message.content` |
| Conversation history | Pass in prompt text | Native `messages` array |
| Env var | `GEMINI_API_KEY` | `GROQ_API_KEY` |

---

## ElevenLabs Integration Pattern

```typescript
// In SessionWrapper.tsx — canvas unlock is gated on audio completion:
setSessionState("speaking");
await speakText(claudeResponse.speech_text);  // blocks until audio ends
setSessionState("idle");                       // canvas unlocks HERE, not before
```

---

## The Golden Path Demo (3 minutes)

| Step | Action | What Happens |
|------|--------|-------------|
| 1 | Open app | Setup screen |
| 2 | Upload kinematic physics notes photo | Groq extracts formulas |
| 3 | Click "Start Session" | Whiteboard |
| 4 | Say "Give me a practice problem" | Lock → Groq → ElevenLabs speaks → problem on canvas |
| 5 | Write `v = v₀ + at` (wrong — needs time we don't have) | Normal drawing |
| 6 | Say "Is this right?" | Lock → screenshot → Groq vision → red box + ElevenLabs Socratic question |
| 7 | Audio ends | Canvas unlocks |

**Notes must contain:** `v² = v₀² + 2as` (correct) and `v = v₀ + at` (wrong for this problem)

---

## Prize Alignment

| Prize | Key talking point |
|-------|-----------------|
| **ElevenLabs** (6mo Scale) | "ElevenLabs turns a cold AI into a patient tutor. `eleven_turbo_v2_5` streams in real-time. The canvas stays locked until the audio ends." |
| **AMD** ($1,000) | "All API routes run on AMD EPYC. Show console." |
| **Grand Prize** | "$40/hr human tutor → $1.50/hr here. 26x cost reduction." |
| **Responsible AI** ($750) | "Socratic method + context injection = can't give answer, can't hallucinate." |
| **Future Unicorn** ($1,000) | "Community college STEM transfer prep. $100B TAM." |

---

## Build Phases

| Phase | Document | Builds |
|-------|----------|--------|
| 1 | `PHASE_1_SCAFFOLDING.md` | Next.js, tldraw, canvas lock, `lib/types.ts` |
| 2 | `PHASE_2_VOICE_AND_GROQ.md` | Web Speech API, Groq analyze route, voice→JSON |
| 3 | `PHASE_3_VISION_AND_ANNOTATION.md` | Canvas export, Groq vision, red box overlay |
| 4 | `PHASE_4_ELEVENLABS.md` | ElevenLabs route, `speakText()`, audio-gated unlock |
| 5 | `PHASE_5_CURRICULUM_UPLOAD.md` | SetupScreen, Groq OCR route, context injection |
| 6 | `PHASE_6_INTEGRATION_AND_DEMO.md` | Merge all, SessionWrapper final, AMD deploy |

---

## Rules for All Sessions

1. **Never `setTimeout` to unlock canvas.** Only unlock when ElevenLabs audio ends.
2. **Never hardcode API keys.** Always `process.env.GEMINI_API_KEY`, `process.env.GROQ_API_KEY`, etc.
3. **Always import types from `lib/types.ts`.** Never redefine locally.
4. **ElevenLabs is primary TTS.** Browser fallback only on API failure.
5. **Canvas lock = invisible overlay div.** Never touch tldraw internals.
6. **Vision calls use Gemini 2.0 Flash.** Text-only calls use Groq Llama 3.3 70B. Phase 5 OCR uses Groq Llama 4 Scout.
7. **Always pass `conversationHistory` (last 8 turns) to every analyze call.** After each response, push both the user turn and assistant turn to `conversationRef.current`.
8. **Annotation coordinates are percentages 0–100.** Never pixels.
9. **Screenshot happens AFTER canvas lock.** Order matters.
10. **Strip Gemini JSON fences** with `.replace(/```json\n?|```/g, "").trim()` before `JSON.parse`.

---

## Cost Reference (Hackathon Budget)

| Service | Free Tier | If You Pay | Demo Risk |
|---------|-----------|-----------|-----------|
| **Groq** | Free, rate-limited | $0.11/M input tokens (Scout), $0.59/M (70B) | Low — demo pace won't hit limits |
| **Gemini 2.0 Flash** | 1,500 req/day, 10 RPM | $0.10/M input tokens | Low — 10 RPM fine for tutoring pace |
| **ElevenLabs** | 20,000 credits/mo (~133 responses) | $5/mo Starter (30K credits) | **Medium** — heavy testing burns free credits |
| **AWS t3a.medium** | $0 if using free tier t3.micro | ~$1.80 for 48hr (t3a = AMD EPYC) | N/A |

**Recommended spend: $5–7 total** — $5 ElevenLabs Starter + $2 AMD instance. Everything else free.

**ElevenLabs tip:** During development, use `speakTextFallback()` (browser TTS). Only call real ElevenLabs API when validating the final experience. Track your credits at elevenlabs.io/dashboard.
