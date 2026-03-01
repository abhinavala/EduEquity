import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ConversationTurn } from "@/lib/types";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

function buildSystemPrompt(courseMaterial: string, turnCount: number): string {
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

CONVERSATION AWARENESS:
- This is turn ${turnCount} of this session
- If turn > 1: reference what was discussed before. "Earlier you mentioned..." or "Building on what we found..."
- If the student got something right: celebrate specifically. "Yes — exactly, because no time is given!" not just "Good job!"

COURSE MATERIAL (only use these formulas and methods, do not introduce anything else):
<COURSE_MATERIAL>
${courseMaterial || "No material uploaded. Use general STEM knowledge."}
</COURSE_MATERIAL>

You MUST respond with a JSON object. Do not include any text outside the JSON.

Schema:
{
  "type": "annotation" | "practice_problem" | "socratic_response",
  "speech_text": "What to say aloud. Warm, conversational, under 60 words.",
  "annotation": {
    "x_pct": number,
    "y_pct": number,
    "width_pct": number,
    "height_pct": number
  } | null,
  "practice_problem": "Full problem text for whiteboard." | null
}

TYPE RULES:
- "annotation": A canvas image was provided AND student asked to check their work.
  Find the specific error. Set annotation to the TIGHT bounding box of that error in the image (0–100, where 0,0 is top-left corner of the image).
  x_pct = % from left edge to left side of the erroneous symbol/expression.
  y_pct = % from top edge to top of the erroneous symbol/expression.
  Add ~2% padding around the actual text for visual clarity.
  speech_text must reference what's in the red box: "Look at the formula in the red box..."
- "practice_problem": Student asked for a practice problem. Set practice_problem to full problem text. annotation must be null.
- "socratic_response": General question, no image, or no clear error visible. annotation and practice_problem are both null.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const transcript = body.transcript as string | undefined;
    const courseMaterial = (body.courseMaterial as string) ?? "";
    const canvasImageBase64 = body.canvasImageBase64 as string | undefined;
    const conversationHistory = (body.conversationHistory ?? []) as ConversationTurn[];

    if (!transcript) {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }

    const turnCount = conversationHistory.length;
    const systemPrompt = buildSystemPrompt(courseMaterial, turnCount);

    let parsed: Record<string, unknown>;

    if (canvasImageBase64) {
      if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json(
          { error: "GEMINI_API_KEY not configured for vision analysis" },
          { status: 500 }
        );
      }
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const historyContext =
        conversationHistory.length > 0
          ? "\n\nPrevious conversation:\n" +
            conversationHistory
              .slice(-8)
              .map((t: ConversationTurn) => `${t.role === "user" ? "Student" : "Tutor"}: ${t.content}`)
              .join("\n")
          : "";

      const imagePart = {
        inlineData: {
          data: canvasImageBase64,
          mimeType: "image/png" as const,
        },
      };

      const result = await model.generateContent([
        { text: systemPrompt + historyContext },
        imagePart,
        { text: `Student says: "${transcript}"` },
      ]);

      const response = result.response;
      const raw = response.text?.() ?? "";
      if (!raw) {
        throw new Error("Gemini returned empty response");
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
      const historyMessages = conversationHistory
        .slice(-8)
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
          { role: "user", content: `Student says: "${transcript}"` },
        ],
      });

      const content = completion.choices[0]?.message?.content ?? "{}";
      parsed = JSON.parse(content);
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Analyze API error:", error);
    return NextResponse.json(
      {
        type: "socratic_response",
        speech_text: "I had trouble processing that. Could you try again?",
        annotation: null,
        practice_problem: null,
      },
      { status: 200 }
    );
  }
}
