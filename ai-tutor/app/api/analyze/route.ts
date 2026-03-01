import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { ClaudeResponse, ConversationTurn, VisualPlan } from "@/lib/types";
import { getTutorLanguage } from "@/lib/tutorLanguages";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.0-flash-001";

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
    "kind": "parabola_tangent_demo" | "concept_steps",
    "expression": "f(x) = x²" | "Short visual title",
    "conceptLabel": "Short concept label" | null,
    "secondaryLabel": "Second short label" | null,
    "tangentLabel": "Short tangent label" | null,
    "insightLabel": "Short insight label" | null
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
  - simple concept map / step flow for a process or relationship
  When you use this type, set visual_plan.kind to "parabola_tangent_demo" and fill the labels briefly.
  For a generic concept map, set visual_plan.kind to "concept_steps" and use conceptLabel / secondaryLabel / insightLabel as short whiteboard labels.
  annotation and practice_problem must both be null.
- "socratic_response": General question, no image, or no clear error visible. annotation and practice_problem are both null.`;
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

  const visualRequest = /\b(show|draw|graph|plot|visualize|visualise|diagram|illustrate|demonstrate)\b/i.test(
    latestContext
  );
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

function normalizeResponse(
  parsed: Record<string, unknown>,
  transcript: string,
  courseMaterial: string,
  conversationHistory: ConversationTurn[]
): ClaudeResponse {
  const fallbackVisualPlan = detectParabolaDerivativePlan(transcript, courseMaterial, conversationHistory);
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
    visual_plan:
      parsed.visual_plan &&
      typeof parsed.visual_plan === "object" &&
      ((((parsed.visual_plan as VisualPlan).kind === "parabola_tangent_demo") ||
        (parsed.visual_plan as VisualPlan).kind === "concept_steps"))
        ? (parsed.visual_plan as VisualPlan)
        : null,
  };

  if (fallbackVisualPlan) {
    response.type = "visual_explanation";
    response.annotation = null;
    response.annotation_label = null;
    response.practice_problem = null;
    response.visual_plan = {
      ...fallbackVisualPlan,
      ...(response.visual_plan?.kind === "parabola_tangent_demo" ? response.visual_plan : {}),
    };
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
        model: "llama-3.3-70b-versatile",
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
