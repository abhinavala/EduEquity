import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { ClaudeResponse, ConversationTurn, VisualElement, VisualPlan } from "@/lib/types";
import { getTutorLanguage } from "@/lib/tutorLanguages";

// Groq for main conversation (smart, follows instructions)
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const GROQ_MODEL = "llama-3.3-70b-versatile";
// Only match EXPLICIT requests to draw/visualize something
// Excludes: "show me if this is right", "can you show me the answer"
const VISUAL_REQUEST_PATTERN =
  /\b(draw|graph|plot|visuali[sz]e|diagram|illustrate|sketch|map out)\s+(this|that|it|the|a|an|for me)/i;

// Local vLLM models on AMD MI300X
const LOCAL_MODEL_URL = process.env.LOCAL_MODEL_URL ?? "http://165.245.139.45:8000/v1";
const LOCAL_VISION_URL = process.env.LOCAL_VISION_URL ?? "http://165.245.139.45:8001/v1";
const LOCAL_TEXT_MODEL = "Qwen/Qwen2.5-7B-Instruct";
const LOCAL_VISION_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct";

function buildSystemPrompt(courseMaterial: string, turnCount: number, languageCode?: string): string {
  const selectedLanguage = getTutorLanguage(languageCode);

  return `You are a warm, patient Socratic STEM tutor named Alex.

PERSONALITY:
- Speak like a real person, not a textbook. "Let's look at this together" not "I will now analyze your work."
- Reference the student's exact words back to them when possible
- Vary your phrasing — never start two consecutive responses the same way
- Short sentences. Max 2 sentences of guidance, then a question. Never lecture.
- Keep speech_text under 60 words — it will be spoken aloud by ElevenLabs.

SOCRATIC RULES:
- NEVER give the answer directly. If the student asks "just tell me", say "I know it's frustrating — but you're closer than you think. What does the problem tell us about time?"
- Each question should be ONE step smaller than the full answer
- If the student seems stuck (short answers, "I don't know"), give a bigger hint but still end with a question

LANGUAGE MODE:
- Respond entirely in ${selectedLanguage.nativeLabel} (${selectedLanguage.label}) unless the student explicitly asks to switch languages.
- Treat ${selectedLanguage.nativeLabel} as the student's strongest language for both listening and speaking.
- If the student mixes languages, keep your response in ${selectedLanguage.nativeLabel} and briefly translate key STEM terms when helpful.
- Preserve equations, variables, numbers, and multiple-choice letters exactly as written on the page.
- Make your analogies feel natural for a student who uses ${selectedLanguage.nativeLabel}. ${selectedLanguage.culturalGuidance}
- Avoid stereotypes. The goal is familiarity and clarity, not cultural performance.

CONVERSATION AWARENESS:
- This is turn ${turnCount} of this session
- If turn > 1: reference what was discussed before. "Earlier you mentioned..." or "Building on what we found..."
- If the student got something right: celebrate specifically. "Yes — exactly, because no time is given!" not just "Good job!"
- Pay close attention to the most recent tutor question and the student's latest reply. If the student answers "yes", "no", "I got 12", or something similarly short, interpret it in the context of the previous turn instead of treating it like a brand-new topic.
- If the student is answering your prior question, acknowledge that answer directly before moving to the next step.

COURSE MATERIAL (only use these formulas and methods, do not introduce anything else):
<COURSE_MATERIAL>
${courseMaterial || "No material uploaded. Use general STEM knowledge."}
</COURSE_MATERIAL>

When uploaded material is written in a different language, explain it in ${selectedLanguage.nativeLabel} while keeping the original formula notation intact.

You MUST respond with a JSON object. Do not include any text outside the JSON.

Schema:
{
  "type": "annotation" | "practice_problem" | "socratic_response" | "visual_explanation",
  "speech_text": "What to say aloud. Warm, conversational, under 60 words.",
  "annotation": {
    "x_pct": number,
    "y_pct": number,
    "width_pct": number,
    "height_pct": number
  } | null,
  "annotation_label": "Very short label for the red box target, such as 'your A choice' or 'this exponent'." | null,
  "practice_problem": "Full problem text for whiteboard." | null,
  "visual_plan": {
    "kind": "parabola_tangent_demo" | "concept_steps" | "integration_by_parts_demo" | "structured_diagram",
    "expression": "f(x) = x²" | "Short visual title",
    "conceptLabel": "Short concept label" | null,
    "secondaryLabel": "Second short label" | null,
    "tangentLabel": "Short tangent label" | null,
    "insightLabel": "Short insight label" | null,
    "uPart": "Chosen u piece" | null,
    "dvPart": "Chosen dv piece" | null,
    "duPart": "Differentiated u" | null,
    "vPart": "Integrated dv" | null,
    "assembledFormula": "Final assembled uv - ∫v du string" | null,
    "promptSummary": "One short sentence describing the requested picture/diagram" | null,
    "elements": [
      {
        "kind": "text" | "box" | "ellipse" | "line" | "arrow" | "polyline" | "point",
        "x": 0-100,
        "y": 0-100,
        "x2": 0-100 | null,
        "y2": 0-100 | null,
        "w": 0-100 | null,
        "h": 0-100 | null,
        "text": "Text for text elements" | null,
        "label": "Optional label inside or next to shape" | null,
        "color": "blue/red/green/orange/purple/black/gray/etc." | null,
        "size": "s/m/l/xl or small/medium/large" | null,
        "dash": "draw/solid/dashed/dotted" | null,
        "fill": "solid or none" | null,
        "points": [{ "x": 0-100, "y": 0-100 }] | null
      }
    ] | null
  } | null
}

CHOOSING THE RIGHT TYPE (in order of priority):

1. "socratic_response" (DEFAULT - use this most of the time):
   - Student asks a question about a concept
   - Student asks for help understanding something
   - Student asks "is this right?" or "check my work" but you DON'T see a specific error
   - Student answers your previous question
   - General conversation and tutoring
   - When in doubt, use this type

2. "annotation": ONLY when ALL of these are true:
   - Student explicitly asks to check/verify their work ("check this", "is this right", "did I make a mistake")
   - You can see their work in the canvas image
   - You find a SPECIFIC error to highlight
   - Set annotation to the bounding box of that error (0–100 coordinates)
   - annotation_label names the exact target in 2-5 words
   - speech_text references the red box: "Look at the formula in the red box..."

3. "practice_problem": ONLY when student explicitly asks for a NEW problem:
   - "give me a problem", "another problem", "practice problem"
   - Put the FULL problem text in the practice_problem field
   - DO NOT use this when student refers to existing problems ("problem 1", "the problem")

4. "visual_explanation": ONLY when student explicitly asks to DRAW or GRAPH:
   - "draw a diagram", "graph this function", "sketch the curve", "visualize this"
   - Do NOT use for "show me if this is right" or "can you explain"
   - Do NOT use when checking work - that's annotation
  Supported visual right now:
  - derivative / tangent / slope intuition for a quadratic such as f(x) = x²
  - integration by parts with highlighted u and dv selections and a staged formula build
  - simple concept map / step flow for a process or relationship
  - arbitrary requested whiteboard diagrams using boxes, labels, arrows, points, and polylines
  When the student asks for any custom image/diagram/visual, base it on the student's exact request. Do NOT default to the parabola example unless the request is actually about derivatives / tangents / f(x)=x².
  If the request is custom, set visual_plan.kind to "structured_diagram".
  For "structured_diagram":
  - Build a whiteboard sketch, not a photorealistic image.
  - Use 4-18 ordered elements.
  - Coordinates are percentages from 0 to 100 inside the drawing area.
  - Use "polyline" for curves or graph traces.
  - Use "box" / "ellipse" + labels for nodes and callouts.
  - Use "arrow" for direction, cause/effect, movement, or flow.
  - Make the diagram directly answer what the student asked to see.
  For integration by parts, set visual_plan.kind to "integration_by_parts_demo" and provide expression, uPart, dvPart, duPart, vPart, and assembledFormula.
  For integration by parts, speech_text should sound like: "Watch the board. Then tell me which part you'd choose for u."
  For a generic concept map, set visual_plan.kind to "concept_steps" and use conceptLabel / secondaryLabel / insightLabel as short whiteboard labels.
  annotation and practice_problem must both be null.
- "socratic_response": General question, no image, or no clear error visible. annotation and practice_problem are both null.`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function looksLikeVisualRequest(transcript: string, conversationHistory: ConversationTurn[]) {
  const currentTranscript = transcript.toLowerCase();

  // EXCLUDE: Checking work requests - these should NOT trigger visuals
  if (/\b(check|correct|right|wrong|mistake|error|review|verify|is this|am i|did i)\b/i.test(currentTranscript)) {
    return false;
  }

  // EXCLUDE: Explanation requests without visual keywords
  if (/\b(explain|help me understand|what is|how do|why)\b/i.test(currentTranscript) &&
      !/\b(draw|graph|plot|diagram|visualize|sketch)\b/i.test(currentTranscript)) {
    return false;
  }

  // Only match explicit visual requests
  return VISUAL_REQUEST_PATTERN.test(currentTranscript);
}

function normalizeConversationHistory(
  conversationHistory: ConversationTurn[],
  transcript: string
): ConversationTurn[] {
  const trimmedHistory: ConversationTurn[] = conversationHistory
    .filter((turn) => turn.content?.trim())
    .slice(-10)
    .map<ConversationTurn>((turn) => ({
      role: turn.role,
      content: turn.content.trim(),
      timestamp: turn.timestamp,
    }));

  const lastTurn = trimmedHistory[trimmedHistory.length - 1];
  if (lastTurn?.role === "user" && lastTurn.content === transcript.trim()) {
    return trimmedHistory;
  }

  const nextTurn: ConversationTurn = {
    role: "user",
    content: transcript.trim(),
    timestamp: Date.now(),
  };

  const nextHistory = [...trimmedHistory, nextTurn];

  return nextHistory.slice(-10);
}

function buildVisionMessages(systemPrompt: string, conversationHistory: ConversationTurn[], canvasImageBase64: string) {
  const latestUserTurn = conversationHistory[conversationHistory.length - 1];
  // Only include last 2 prior turns to save context space for the image
  const priorTurns = (latestUserTurn?.role === "user" ? conversationHistory.slice(0, -1) : conversationHistory).slice(-2);
  const finalPrompt =
    latestUserTurn?.role === "user"
      ? latestUserTurn.content
      : "The student just spoke, but their latest message was missing. Ask a short clarifying question.";

  // Use a shorter system prompt for vision to save tokens
  const shortSystemPrompt = `You are a Socratic STEM tutor. Respond with JSON only:
{
  "type": "annotation" | "practice_problem" | "socratic_response",
  "speech_text": "Short response under 60 words",
  "annotation": { "x_pct": 0-100, "y_pct": 0-100, "width_pct": 0-100, "height_pct": 0-100 } | null,
  "annotation_label": "Short label" | null,
  "practice_problem": "Problem text" | null
}
Use "annotation" if checking work and there's an error to highlight. Use "practice_problem" if asked to create a problem. Otherwise use "socratic_response".`;

  return [
    { role: "system", content: shortSystemPrompt },
    ...priorTurns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    {
      role: "user" as const,
      content: [
        {
          type: "text",
          text: `Student's latest message: "${finalPrompt}"\n\nUse the conversation so far to interpret this reply correctly. If the student is answering your previous question, continue from that exact point.`,
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${canvasImageBase64}`,
          },
        },
      ],
    },
  ];
}

function detectParabolaDerivativePlan(
  transcript: string,
  courseMaterial: string,
  conversationHistory: ConversationTurn[]
): VisualPlan | null {
  const latestContext = [
    transcript,
    ...conversationHistory.slice(-6).map((turn) => turn.content),
    courseMaterial.slice(0, 2000),
  ].join("\n");

  const visualRequest = VISUAL_REQUEST_PATTERN.test(latestContext);
  const derivativeContext = /\b(derivative|tangent|slope|steep|steeper)\b/i.test(latestContext);
  const quadraticContext = /f\s*\(\s*x\s*\)\s*=\s*x\s*(\^|\u005e)?\s*2|x²|x\^2|\bparabola\b/i.test(
    latestContext
  );

  if (!visualRequest || !derivativeContext || !quadraticContext) {
    return null;
  }

  const expressionMatch =
    latestContext.match(/f\s*\(\s*x\s*\)\s*=\s*x\s*(?:\^|\u005e)?\s*2/i)?.[0] ??
    latestContext.match(/x²|x\^2/i)?.[0] ??
    "f(x) = x²";

  return {
    kind: "parabola_tangent_demo",
    expression: expressionMatch.replace(/\s+/g, " "),
    conceptLabel: "derivative = slope at a point",
    tangentLabel: "slope = 2x",
    insightLabel: "As x gets bigger, the tangent gets steeper.",
  };
}

function detectIntegrationByPartsPlan(
  transcript: string,
  courseMaterial: string,
  conversationHistory: ConversationTurn[]
): VisualPlan | null {
  const latestContext = [
    transcript,
    ...conversationHistory.slice(-6).map((turn) => turn.content),
    courseMaterial.slice(0, 2000),
  ].join("\n");

  const visualRequest = VISUAL_REQUEST_PATTERN.test(latestContext);
  const integrationContext = /\b(integration by parts|ibp|u and dv|uv\s*[-−]\s*∫|integrate by parts)\b/i.test(
    latestContext
  );

  if (!visualRequest || !integrationContext) {
    return null;
  }

  const expressionMatch =
    latestContext.match(/∫[^.\n]+?dx/i)?.[0]?.trim() ??
    latestContext.match(/integral[^.\n]+/i)?.[0]?.trim() ??
    "∫ x e^x dx";

  const uPart =
    latestContext.match(/\bu\s*=\s*([^,\n;.]+)/i)?.[1]?.trim() ??
    "x";
  const dvPart =
    latestContext.match(/\bdv\s*=\s*([^,\n;.]+)/i)?.[1]?.trim() ??
    "e^x dx";
  const duPart =
    latestContext.match(/\bdu\s*=\s*([^,\n;.]+)/i)?.[1]?.trim() ??
    "dx";
  const vPart =
    latestContext.match(/\bv\s*=\s*([^,\n;.]+)/i)?.[1]?.trim() ??
    "e^x";

  return {
    kind: "integration_by_parts_demo",
    expression: expressionMatch,
    conceptLabel: "Identify u and dv",
    secondaryLabel: "Differentiate u, integrate dv",
    insightLabel: "Now you try it: which part should be u?",
    uPart,
    dvPart,
    duPart,
    vPart,
    assembledFormula: `${uPart}(${vPart}) − ∫ ${vPart}(${duPart})`,
  };
}

function normalizeVisualElements(value: unknown): VisualElement[] | null {
  if (!Array.isArray(value)) return null;

  const normalized = value
    .map<VisualElement | null>((element) => {
      if (!element || typeof element !== "object") return null;

      const raw = element as Record<string, unknown>;
      const kind =
        raw.kind === "text" ||
        raw.kind === "box" ||
        raw.kind === "ellipse" ||
        raw.kind === "line" ||
        raw.kind === "arrow" ||
        raw.kind === "polyline" ||
        raw.kind === "point"
          ? raw.kind
          : null;

      if (!kind || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) return null;

      const points =
        Array.isArray(raw.points)
          ? raw.points
              .map((point) => {
                if (!point || typeof point !== "object") return null;
                const candidate = point as Record<string, unknown>;
                if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) return null;
                return { x: candidate.x, y: candidate.y };
              })
              .filter((point): point is { x: number; y: number } => point !== null)
          : null;

      return {
        kind,
        x: raw.x,
        y: raw.y,
        x2: isFiniteNumber(raw.x2) ? raw.x2 : null,
        y2: isFiniteNumber(raw.y2) ? raw.y2 : null,
        w: isFiniteNumber(raw.w) ? raw.w : null,
        h: isFiniteNumber(raw.h) ? raw.h : null,
        text: typeof raw.text === "string" ? raw.text.trim() : null,
        label: typeof raw.label === "string" ? raw.label.trim() : null,
        color: typeof raw.color === "string" ? raw.color.trim() : null,
        size: typeof raw.size === "string" ? raw.size.trim() : null,
        dash: typeof raw.dash === "string" ? raw.dash.trim() : null,
        fill: typeof raw.fill === "string" ? raw.fill.trim() : null,
        points: points && points.length >= 2 ? points : null,
      };
    })
    .filter((element): element is VisualElement => element !== null);

  return normalized.length > 0 ? normalized.slice(0, 18) : null;
}

function normalizeVisualPlan(value: unknown): VisualPlan | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const kind =
    raw.kind === "parabola_tangent_demo" ||
    raw.kind === "concept_steps" ||
    raw.kind === "integration_by_parts_demo" ||
    raw.kind === "structured_diagram"
      ? raw.kind
      : null;

  if (!kind) return null;

  return {
    kind,
    expression: typeof raw.expression === "string" && raw.expression.trim() ? raw.expression.trim() : "Visual explanation",
    conceptLabel: typeof raw.conceptLabel === "string" ? raw.conceptLabel.trim() : null,
    secondaryLabel: typeof raw.secondaryLabel === "string" ? raw.secondaryLabel.trim() : null,
    tangentLabel: typeof raw.tangentLabel === "string" ? raw.tangentLabel.trim() : null,
    insightLabel: typeof raw.insightLabel === "string" ? raw.insightLabel.trim() : null,
    uPart: typeof raw.uPart === "string" ? raw.uPart.trim() : null,
    dvPart: typeof raw.dvPart === "string" ? raw.dvPart.trim() : null,
    duPart: typeof raw.duPart === "string" ? raw.duPart.trim() : null,
    vPart: typeof raw.vPart === "string" ? raw.vPart.trim() : null,
    assembledFormula: typeof raw.assembledFormula === "string" ? raw.assembledFormula.trim() : null,
    promptSummary: typeof raw.promptSummary === "string" ? raw.promptSummary.trim() : null,
    elements: normalizeVisualElements(raw.elements),
  };
}

function buildStructuredDiagramPrompt(
  transcript: string,
  courseMaterial: string,
  conversationHistory: ConversationTurn[],
  languageCode?: string
) {
  const selectedLanguage = getTutorLanguage(languageCode);

  return `You create whiteboard diagram plans for a tutoring app.

Return only JSON with this schema:
{
  "kind": "structured_diagram",
  "expression": "Short title for the drawing",
  "promptSummary": "One short sentence describing what the student wanted to see",
  "insightLabel": "One short takeaway or next question" | null,
  "elements": [
    {
      "kind": "text" | "box" | "ellipse" | "line" | "arrow" | "polyline" | "point",
      "x": 0-100,
      "y": 0-100,
      "x2": 0-100 | null,
      "y2": 0-100 | null,
      "w": 0-100 | null,
      "h": 0-100 | null,
      "text": "For text elements" | null,
      "label": "Optional short label for a shape or point" | null,
      "color": "blue/red/green/orange/purple/black/gray" | null,
      "size": "s/m/l/xl or small/medium/large" | null,
      "dash": "draw/solid/dashed/dotted" | null,
      "fill": "solid or none" | null,
      "points": [{ "x": 0-100, "y": 0-100 }] | null
    }
  ]
}

Rules:
- Build the picture directly from the student's request, not a canned example.
- This is a hand-drawn whiteboard sketch, not photorealistic image generation.
- Use 4-18 elements.
- Use text sparingly. Prefer arrows, boxes, labels, and simple shapes.
- Use polyline for curves, graph traces, or outlines.
- Use the student's requested topic, objects, relationships, or process.
- All visible labels should be in ${selectedLanguage.nativeLabel} when natural, while preserving equations and symbols exactly.
- End with an insightLabel that helps the tutor continue the conversation.

Student request:
${transcript}

Recent conversation:
${conversationHistory.slice(-6).map((turn) => `${turn.role}: ${turn.content}`).join("\n") || "No prior turns"}

Relevant course material:
${courseMaterial.slice(0, 3000) || "No uploaded material"}`;
}

async function generateStructuredDiagramFallback(
  transcript: string,
  courseMaterial: string,
  conversationHistory: ConversationTurn[],
  languageCode?: string
): Promise<VisualPlan | null> {
  try {
    const diagramPrompt = buildStructuredDiagramPrompt(transcript, courseMaterial, conversationHistory, languageCode);

    let content: string;

    if (groq) {
      // Use Groq for better diagram generation
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: diagramPrompt },
          { role: "user", content: "Generate the whiteboard diagram plan now." },
        ],
      });
      content = completion.choices[0]?.message?.content ?? "{}";
    } else {
      // Fallback to local model
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(`${LOCAL_MODEL_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LOCAL_TEXT_MODEL,
          max_tokens: 1200,
          messages: [
            { role: "system", content: diagramPrompt },
            { role: "user", content: "Generate the whiteboard diagram plan now." },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!res.ok) return null;

      const body = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      content = body.choices?.[0]?.message?.content ?? "{}";
    }

    const parsed = extractJSON(content);
    const plan = normalizeVisualPlan(parsed);
    return plan?.kind === "structured_diagram" ? plan : null;
  } catch (error) {
    console.warn("Structured diagram fallback failed:", error);
    return null;
  }
}

function extractJSON(raw: string): Record<string, unknown> {
  // First, try to strip markdown code fences
  let cleaned = raw.replace(/```json\n?|```/g, "").trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to extraction methods
  }

  // Try to find JSON object in the response (model might add conversational text before/after)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      // Fix common escape issues: unescaped quotes in strings
      let jsonStr = jsonMatch[0];
      // Replace problematic escape sequences that aren't valid in JSON
      jsonStr = jsonStr.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
      return JSON.parse(jsonStr);
    } catch {
      // Try more aggressive cleaning
      try {
        let jsonStr = jsonMatch[0];
        // Remove control characters except newlines and tabs
        jsonStr = jsonStr.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
        // Fix unescaped newlines in strings (common LLM mistake)
        jsonStr = jsonStr.replace(/:\s*"([^"]*)\n([^"]*)"/g, ': "$1\\n$2"');
        return JSON.parse(jsonStr);
      } catch {
        // Continue to fallback
      }
    }
  }

  // Final fallback: return empty object to trigger default response
  console.warn("Could not extract JSON from LLM response:", raw.slice(0, 200));
  return {};
}

// Detect if user asked for a NEW practice problem (not referencing existing problems)
function looksLikePracticeProblemRequest(transcript: string, conversationHistory: ConversationTurn[]): boolean {
  const currentTranscript = transcript.toLowerCase();

  // EXCLUDE: If user is asking about an existing problem (problem 1, the problem, this problem)
  // These are references, not requests for new problems
  if (/\b(problem\s*\d+|the\s+problem|this\s+problem|that\s+problem|from\s+problem|in\s+problem)/i.test(currentTranscript)) {
    return false;
  }

  // EXCLUDE: Visual/graph requests - these should be visual explanations, not practice problems
  if (/\b(graph|draw|plot|sketch|show|visualize|diagram)/i.test(currentTranscript)) {
    return false;
  }

  // EXCLUDE: Explanation requests
  if (/\b(explain|help|understand|how do|what is|walk me through)/i.test(currentTranscript)) {
    return false;
  }

  // Check current transcript for "put it on" requests (for a problem just mentioned)
  if (/\bput (it|that) (on|onto) (the )?(board|screen|page|whiteboard|canvas)/i.test(currentTranscript)) {
    return true;
  }

  // "give me a problem", "give me another problem", "new problem"
  if (/\b(give me|can you give me|i want|i need|create|generate|make)\b.{0,15}\b(a |an |another |new |some )?(derivative|integral|math|calculus|algebra|similar\s+)?problem/i.test(currentTranscript)) {
    return true;
  }

  // "another problem", "next problem", "new problem"
  if (/\b(another|next|new|different)\s+(problem|exercise|question)/i.test(currentTranscript)) {
    return true;
  }

  // "practice problem please", "a problem to solve"
  if (/\b(practice\s+problem|problem\s+to\s+solve|problem\s+for\s+me)/i.test(currentTranscript)) {
    return true;
  }

  return false;
}

// Extract a math problem from text (looks for equations, "find the derivative of", etc.)
function extractProblemFromText(text: string): string | null {
  // Look for LaTeX-style math: \( ... \) or $ ... $
  const latexMatch = text.match(/\\\(\s*(.+?)\s*\\\)/) || text.match(/\$\s*(.+?)\s*\$/);

  if (latexMatch) {
    // Clean up LaTeX and format as a problem
    let expr = latexMatch[1].trim();
    // Remove f(x) = prefix if present, we'll add our own
    expr = expr.replace(/^f\s*\(\s*x\s*\)\s*=\s*/i, "").trim();

    if (/derivative/i.test(text)) {
      return `Find the derivative of f(x) = ${expr}`;
    }
    if (/integral|integrate/i.test(text)) {
      return `Evaluate the integral: ∫ ${expr} dx`;
    }
    return `Solve: f(x) = ${expr}`;
  }

  // Look for plain text "f(x) = ..." patterns
  const funcMatch = text.match(/f\s*\(\s*x\s*\)\s*=\s*([x0-9\^\+\-\*\/\(\)\s]+)/i);
  if (funcMatch) {
    const expr = funcMatch[1].trim();
    if (/derivative/i.test(text)) {
      return `Find the derivative of f(x) = ${expr}`;
    }
    return `Solve: f(x) = ${expr}`;
  }

  // Look for "derivative of x^n" style
  const simpleDerivMatch = text.match(/derivative of\s+([x0-9\^\+\-\*\/\(\)\s]+)/i);
  if (simpleDerivMatch) {
    return `Find the derivative of f(x) = ${simpleDerivMatch[1].trim()}`;
  }

  // Look for any expression with x and powers like "x^3", "4x^2", "x² + 3x"
  const exprMatch = text.match(/(\d*x\s*[\^²³]?\s*\d*(?:\s*[+\-]\s*\d*x?\s*[\^²³]?\s*\d*)*)/i);
  if (exprMatch && exprMatch[1].length > 1) {
    const expr = exprMatch[1].trim();
    if (/derivative/i.test(text)) {
      return `Find the derivative of f(x) = ${expr}`;
    }
    if (/integral|integrate/i.test(text)) {
      return `Evaluate the integral: ∫ ${expr} dx`;
    }
    return `Solve: f(x) = ${expr}`;
  }

  return null;
}

// Check if the raw LLM response mentions a problem even if not in JSON format
function extractProblemFromRawResponse(rawText: string, transcript: string): { problem: string; speech: string } | null {
  // If the model just said the problem conversationally, extract it
  const problemPatterns = [
    /(?:find|calculate|compute|evaluate|what is|determine)\s+(?:the\s+)?derivative\s+of\s+(.+?)(?:\?|$)/i,
    /derivative\s+of\s+(.+?)(?:\?|\.|$)/i,
    /(?:solve|simplify|evaluate)\s*:?\s*(.+?)(?:\?|\.|$)/i,
    /(?:what do you think|what is)\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of problemPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      const extracted = extractProblemFromText(match[0]);
      if (extracted) {
        return {
          problem: extracted,
          speech: "Here's a problem for you. Give it a try!"
        };
      }
    }
  }

  // If the model mentioned an expression, try to extract it
  const extracted = extractProblemFromText(rawText);
  if (extracted) {
    return {
      problem: extracted,
      speech: "Here's a problem for you. Give it a try!"
    };
  }

  return null;
}

function normalizeResponse(
  parsed: Record<string, unknown>,
  transcript: string,
  courseMaterial: string,
  conversationHistory: ConversationTurn[],
  rawLlmResponse?: string
): ClaudeResponse {
  const fallbackVisualPlan =
    detectIntegrationByPartsPlan(transcript, courseMaterial, conversationHistory) ??
    detectParabolaDerivativePlan(transcript, courseMaterial, conversationHistory);

  // Get speech text from parsed response or raw LLM text
  let speech_text =
    typeof parsed.speech_text === "string" && parsed.speech_text.trim()
      ? parsed.speech_text.trim()
      : rawLlmResponse?.trim() || "Let's look at that together.";

  let type =
    parsed.type === "annotation" ||
    parsed.type === "practice_problem" ||
    parsed.type === "socratic_response" ||
    parsed.type === "visual_explanation"
      ? parsed.type
      : "socratic_response";

  // Override: If user is checking work, don't use visual_explanation
  const isCheckingWork = /\b(check|correct|right|wrong|mistake|error|review|verify|is this|am i|did i|look at)\b/i.test(transcript);
  if (type === "visual_explanation" && isCheckingWork) {
    console.log("Overriding visual_explanation to socratic_response (user is checking work)");
    type = "socratic_response";
  }

  let practice_problem =
    typeof parsed.practice_problem === "string" && parsed.practice_problem.trim()
      ? parsed.practice_problem.trim()
      : null;

  // Detect if user asked for a practice problem but model didn't set the type correctly
  const wantsProblem = looksLikePracticeProblemRequest(transcript, conversationHistory);
  console.log("Practice problem detection:", { wantsProblem, type, hasPracticeProblem: !!practice_problem, transcript: transcript.slice(0, 100) });

  // FIX: Model often sets type="practice_problem" but puts problem in speech_text instead of practice_problem field
  // Only do this if user actually asked for a problem
  if (type === "practice_problem" && !practice_problem && speech_text && wantsProblem) {
    // Extract the problem from speech_text - it's usually after "Here's a problem:" or similar
    const problemMatch = speech_text.match(/(?:problem|exercise|question)[:\s]+(.+)/i) ||
                         speech_text.match(/(?:Find|Solve|Calculate|Evaluate|Determine|Compute)[\s:]+(.+)/i);
    if (problemMatch) {
      practice_problem = problemMatch[1].trim();
    } else {
      // Just use the whole speech_text as the problem
      practice_problem = speech_text.replace(/^(?:Sure!?|Here'?s?\s+(?:a\s+)?(?:similar\s+)?problem[:\s]*)/i, "").trim();
    }
    speech_text = "Here's a problem for you. Give it a try!";
    console.log("Fixed practice_problem from speech_text:", { practice_problem });
  }

  // If model says practice_problem but user didn't ask for one, treat as socratic response
  if (type === "practice_problem" && !wantsProblem) {
    type = "socratic_response";
    practice_problem = null;
    console.log("Overriding practice_problem to socratic_response - user didn't ask for a problem");
  }

  if (wantsProblem && type === "socratic_response" && !practice_problem) {
    // Try to extract the problem from the speech_text first
    let extractedProblem = extractProblemFromText(speech_text);
    console.log("Attempting to extract problem from speech_text:", { extractedProblem, speech_text: speech_text.slice(0, 200) });

    // If that didn't work, try the raw LLM response
    if (!extractedProblem && rawLlmResponse) {
      const fromRaw = extractProblemFromRawResponse(rawLlmResponse, transcript);
      if (fromRaw) {
        extractedProblem = fromRaw.problem;
        speech_text = fromRaw.speech;
        console.log("Extracted from raw response:", fromRaw);
      }
    }

    if (extractedProblem) {
      type = "practice_problem";
      practice_problem = extractedProblem;
      // Clean up speech_text to be conversational
      if (speech_text.includes("\\(") || speech_text.length > 100) {
        speech_text = "Here's a problem for you. Give it a try!";
      }
      console.log("Converted to practice_problem:", { practice_problem, speech_text });
    }
  }

  const response: ClaudeResponse = {
    type,
    speech_text,
    annotation:
      parsed.annotation && typeof parsed.annotation === "object"
        ? (parsed.annotation as ClaudeResponse["annotation"])
        : null,
    annotation_label:
      typeof parsed.annotation_label === "string" && parsed.annotation_label.trim()
        ? parsed.annotation_label.trim()
        : null,
    practice_problem,
    visual_plan: normalizeVisualPlan(parsed.visual_plan),
  };

  // Only use fallback visual plan if user explicitly asked for visual AND not checking work
  const explicitVisualRequest = /\b(draw|graph|plot|visualize|sketch|diagram)\b/i.test(transcript);
  if (fallbackVisualPlan && explicitVisualRequest && !isCheckingWork) {
    response.type = "visual_explanation";
    response.annotation = null;
    response.annotation_label = null;
    response.practice_problem = null;
    response.visual_plan = {
      ...fallbackVisualPlan,
      ...(response.visual_plan?.kind === fallbackVisualPlan.kind ? response.visual_plan : {}),
    };

    if (fallbackVisualPlan.kind === "integration_by_parts_demo") {
      response.speech_text = "Watch the board. Then tell me which part you'd choose for u.";
    }
  }

  if (response.type === "annotation") {
    response.practice_problem = null;
    response.visual_plan = null;
  }

  if (response.type === "practice_problem") {
    response.annotation = null;
    response.annotation_label = null;
    response.visual_plan = null;
  }

  if (response.type === "visual_explanation") {
    response.annotation = null;
    response.annotation_label = null;
    response.practice_problem = null;
  }

  return response;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const transcript = body.transcript as string | undefined;
    const courseMaterial = (body.courseMaterial as string) ?? "";
    const canvasImageBase64 = body.canvasImageBase64 as string | undefined;
    const conversationHistory = (body.conversationHistory ?? []) as ConversationTurn[];
    const languageCode = body.languageCode as string | undefined;

    if (!transcript) {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }

    const normalizedConversation = normalizeConversationHistory(conversationHistory, transcript);
    const turnCount = normalizedConversation.length;
    const systemPrompt = buildSystemPrompt(courseMaterial, turnCount, languageCode);

    let parsed: Record<string, unknown> | undefined;
    let rawLlmResponse: string = "";

    // Try vision model if we have an image, but fall back to text-only if it fails
    let useVision = !!canvasImageBase64;

    if (useVision) {
      // Use local Qwen2.5-VL vision model for canvas analysis
      const visionController = new AbortController();
      const visionTimeout = setTimeout(() => visionController.abort(), 30000);

      let visionRes: Response;
      try {
        visionRes = await fetch(`${LOCAL_VISION_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: LOCAL_VISION_MODEL,
            max_tokens: 512,
            messages: buildVisionMessages(systemPrompt, normalizedConversation, canvasImageBase64),
          }),
          signal: visionController.signal,
        });
      } catch (fetchError) {
        clearTimeout(visionTimeout);
        console.warn("Vision model fetch failed, falling back to text-only:", fetchError);
        useVision = false;
        visionRes = null as unknown as Response;
      }

      if (visionRes) {
        clearTimeout(visionTimeout);

        if (!visionRes.ok) {
          const errorText = await visionRes.text();
          // If it's a token limit error, fall back to text-only mode
          if (visionRes.status === 400 && errorText.includes("max_tokens")) {
            console.warn("Vision model token limit exceeded, falling back to text-only mode");
            useVision = false;
          } else {
            throw new Error(`Local vision model request failed (${visionRes.status}): ${errorText}`);
          }
        }
      }

      if (useVision && visionRes?.ok) {
        const visionBody = await visionRes.json() as {
          choices?: Array<{
            message?: {
              content?: string;
            };
          }>;
        };

        const rawLlmContent = visionBody.choices?.[0]?.message?.content?.trim() ?? "";
        if (!rawLlmContent) {
          throw new Error("Local vision model returned empty response");
        }
        console.log("Raw vision LLM response:", rawLlmContent.slice(0, 500));
        parsed = extractJSON(rawLlmContent);
        console.log("Parsed vision JSON:", JSON.stringify(parsed, null, 2).slice(0, 500));
        rawLlmResponse = rawLlmContent;
      }
    }

    // Use Groq (70B) for text understanding - much better at context and instructions
    if (!useVision || !parsed) {
      const historyMessages = normalizedConversation
        .map((t: ConversationTurn) => ({
          role: t.role as "user" | "assistant",
          content: t.content,
        }));

      if (groq) {
        // Use Groq's Llama 70B - much smarter, follows instructions well
        console.log("Using Groq for text analysis...");
        const completion = await groq.chat.completions.create({
          model: GROQ_MODEL,
          max_tokens: 1024,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            ...historyMessages,
          ],
        });

        const content = completion.choices[0]?.message?.content ?? "{}";
        console.log("Raw Groq response:", content.slice(0, 500));
        parsed = extractJSON(content);
        console.log("Parsed Groq JSON:", JSON.stringify(parsed, null, 2).slice(0, 500));
        rawLlmResponse = content;
      } else {
        // Fallback to local model if no Groq API key
        console.log("No GROQ_API_KEY, falling back to local model...");
        const textController = new AbortController();
        const textTimeout = setTimeout(() => textController.abort(), 30000);

        let textRes: Response;
        try {
          textRes = await fetch(`${LOCAL_MODEL_URL}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: LOCAL_TEXT_MODEL,
              max_tokens: 1024,
              messages: [
                { role: "system", content: systemPrompt },
                ...historyMessages,
              ],
            }),
            signal: textController.signal,
          });
        } catch (fetchError) {
          clearTimeout(textTimeout);
          console.error("Text model fetch failed:", fetchError);
          throw new Error(`Cannot reach text model at ${LOCAL_MODEL_URL}: ${fetchError instanceof Error ? fetchError.message : "Network error"}`);
        }
        clearTimeout(textTimeout);

        if (!textRes.ok) {
          const errorText = await textRes.text();
          throw new Error(`Local text model request failed (${textRes.status}): ${errorText}`);
        }

        const textBody = await textRes.json() as {
          choices?: Array<{
            message?: {
              content?: string;
            };
          }>;
        };

        const content = textBody.choices?.[0]?.message?.content ?? "{}";
        console.log("Raw local LLM response:", content.slice(0, 500));
        parsed = extractJSON(content);
        console.log("Parsed local JSON:", JSON.stringify(parsed, null, 2).slice(0, 500));
        rawLlmResponse = content;
      }
    }

    const normalized = normalizeResponse(parsed ?? {}, transcript, courseMaterial, normalizedConversation, rawLlmResponse);
    console.log("Normalized response:", JSON.stringify(normalized, null, 2));

    // Only generate structured diagram if:
    // 1. User EXPLICITLY asked for a visual (not just "show me if this is right")
    // 2. Model said visual_explanation but didn't provide a plan
    const visualRequest = looksLikeVisualRequest(transcript, normalizedConversation);
    const usesBuiltInDemo =
      normalized.visual_plan?.kind === "parabola_tangent_demo" ||
      normalized.visual_plan?.kind === "integration_by_parts_demo";
    const needsDiagramFallback =
      visualRequest &&  // User explicitly asked for visual
      normalized.type === "visual_explanation" &&  // Model agrees it's visual
      !normalized.visual_plan &&  // But no plan provided
      !usesBuiltInDemo;

    console.log("Visual request check:", { visualRequest, type: normalized.type, needsDiagramFallback });

    if (needsDiagramFallback) {
      const structuredDiagram = await generateStructuredDiagramFallback(
        transcript,
        courseMaterial,
        normalizedConversation,
        languageCode
      );

      if (structuredDiagram) {
        normalized.type = "visual_explanation";
        normalized.annotation = null;
        normalized.annotation_label = null;
        normalized.practice_problem = null;
        normalized.visual_plan = structuredDiagram;
      }
    }

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Analyze API error:", error);
    return NextResponse.json(
      {
        type: "socratic_response",
        speech_text: "I had trouble processing that. Could you try again?",
        annotation: null,
        practice_problem: null,
        visual_plan: null,
        annotation_label: null,
      },
      { status: 200 }
    );
  }
}
