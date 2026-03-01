import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { ClaudeResponse, ConversationTurn, VisualElement, VisualPlan } from "@/lib/types";
import { getTutorLanguage } from "@/lib/tutorLanguages";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.0-flash-001";
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
const VISUAL_REQUEST_PATTERN =
  /\b(show|draw|graph|plot|visuali[sz]e|diagram|illustrate|demonstrate|generate (?:an )?image|create (?:an )?(?:image|diagram|visual)|sketch|map out|watch the board|let me see)\b/i;

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

TYPE RULES:
- "annotation": A canvas image was provided AND student asked to check their work.
  Find the specific error. Set annotation to the TIGHT bounding box of that error in the image (0–100, where 0,0 is top-left corner of the image).
  The box must sit on the student's actual handwritten ink, symbol, number, or chosen answer, not on empty space around it.
  If the student wrote a single answer such as "A", box only that letter.
  Ignore toolbars, UI chrome, and empty margins.
  x_pct = % from left edge to left side of the erroneous symbol/expression.
  y_pct = % from top edge to top of the erroneous symbol/expression.
  Add ~2% padding around the actual text for visual clarity.
  annotation_label must name the exact target in 2-5 words.
  speech_text must reference what's in the red box: "Look at the formula in the red box..."
- "practice_problem": Student asked for a practice problem. Set practice_problem to full problem text. annotation must be null.
- "visual_explanation": Student explicitly asks you to show, draw, graph, visualize, or demonstrate something on the whiteboard.
  Use this only when a visual aid would be clearly helpful.
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
  const latestContext = [
    transcript,
    ...conversationHistory.slice(-4).map((turn) => turn.content),
  ].join("\n");

  return VISUAL_REQUEST_PATTERN.test(latestContext);
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
  const priorTurns = latestUserTurn?.role === "user" ? conversationHistory.slice(0, -1) : conversationHistory;
  const finalPrompt =
    latestUserTurn?.role === "user"
      ? latestUserTurn.content
      : "The student just spoke, but their latest message was missing. Ask a short clarifying question.";

  return [
    { role: "system", content: systemPrompt },
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
  if (!process.env.GROQ_API_KEY) return null;

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      response_format: { type: "json_object" },
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content: buildStructuredDiagramPrompt(transcript, courseMaterial, conversationHistory, languageCode),
        },
        {
          role: "user",
          content: "Generate the whiteboard diagram plan now.",
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const plan = normalizeVisualPlan(parsed);
    return plan?.kind === "structured_diagram" ? plan : null;
  } catch (error) {
    console.warn("Structured diagram fallback failed:", error);
    return null;
  }
}

function normalizeResponse(
  parsed: Record<string, unknown>,
  transcript: string,
  courseMaterial: string,
  conversationHistory: ConversationTurn[]
): ClaudeResponse {
  const fallbackVisualPlan =
    detectIntegrationByPartsPlan(transcript, courseMaterial, conversationHistory) ??
    detectParabolaDerivativePlan(transcript, courseMaterial, conversationHistory);
  const speech_text =
    typeof parsed.speech_text === "string" && parsed.speech_text.trim()
      ? parsed.speech_text.trim()
      : "Let’s look at that together.";
  const type =
    parsed.type === "annotation" ||
    parsed.type === "practice_problem" ||
    parsed.type === "socratic_response" ||
    parsed.type === "visual_explanation"
      ? parsed.type
      : "socratic_response";

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
    practice_problem:
      typeof parsed.practice_problem === "string" && parsed.practice_problem.trim()
        ? parsed.practice_problem.trim()
        : null,
    visual_plan: normalizeVisualPlan(parsed.visual_plan),
  };

  if (fallbackVisualPlan) {
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

    let parsed: Record<string, unknown>;

    if (canvasImageBase64) {
      if (!process.env.OPENROUTER_API_KEY) {
        return NextResponse.json(
          { error: "OPENROUTER_API_KEY not configured for vision analysis" },
          { status: 500 }
        );
      }

      const openRouterRes = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-OpenRouter-Title": "EduEquity AI Tutor",
        },
        body: JSON.stringify({
          model: OPENROUTER_VISION_MODEL,
          response_format: { type: "json_object" },
          max_tokens: 1024,
          messages: buildVisionMessages(systemPrompt, normalizedConversation, canvasImageBase64),
        }),
      });

      if (!openRouterRes.ok) {
        const errorText = await openRouterRes.text();
        throw new Error(`OpenRouter vision request failed (${openRouterRes.status}): ${errorText}`);
      }

      const openRouterBody = await openRouterRes.json() as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

      const raw = openRouterBody.choices?.[0]?.message?.content?.trim() ?? "";
      if (!raw) {
        throw new Error("OpenRouter returned empty response");
      }
      const clean = raw.replace(/```json\n?|```/g, "").trim();
      parsed = JSON.parse(clean);
    } else {
      if (!process.env.GROQ_API_KEY) {
        return NextResponse.json(
          { error: "GROQ_API_KEY not configured" },
          { status: 500 }
        );
      }
      const historyMessages = normalizedConversation
        .map((t: ConversationTurn) => ({
          role: t.role as "user" | "assistant",
          content: t.content,
        }));

      const completion = await groq.chat.completions.create({
        model: GROQ_CHAT_MODEL,
        response_format: { type: "json_object" },
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          ...historyMessages,
        ],
      });

      const content = completion.choices[0]?.message?.content ?? "{}";
      parsed = JSON.parse(content);
    }

    const normalized = normalizeResponse(parsed, transcript, courseMaterial, normalizedConversation);
    const visualRequest = looksLikeVisualRequest(transcript, normalizedConversation);
    const usesBuiltInDemo =
      normalized.visual_plan?.kind === "parabola_tangent_demo" ||
      normalized.visual_plan?.kind === "integration_by_parts_demo";

    if (
      (normalized.type === "visual_explanation" || visualRequest) &&
      (!normalized.visual_plan || (!usesBuiltInDemo && normalized.visual_plan.kind !== "structured_diagram"))
    ) {
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
