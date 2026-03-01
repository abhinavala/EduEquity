import { NextRequest, NextResponse } from "next/server";
import { ConversationTurn, ProgressLetter, SessionMetrics } from "@/lib/types";
import { getTutorLanguage } from "@/lib/tutorLanguages";

// Local vLLM text model on AMD MI300X
const LOCAL_MODEL_URL = process.env.LOCAL_MODEL_URL ?? "http://165.245.139.45:8000/v1";
const LOCAL_TEXT_MODEL = "Qwen/Qwen2.5-7B-Instruct";

interface ProgressLetterRequestBody {
  studentName?: string;
  conversationHistory?: ConversationTurn[];
  sessionMetrics?: SessionMetrics;
  courseMaterial?: string;
}

function formatDuration(elapsedMs: number) {
  const minutes = Math.max(1, Math.round(elapsedMs / 60000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function cleanTopicLabel(raw: string) {
  return raw
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferFocusTopic(courseFiles: string[], courseMaterial: string, conversationHistory: ConversationTurn[]) {
  const fileTopic = courseFiles.map(cleanTopicLabel).find(Boolean);
  if (fileTopic) return fileTopic;

  const transcriptTopic = conversationHistory
    .find((turn) => turn.role === "user" && turn.content.trim().length > 0)
    ?.content.replace(/\s+/g, " ")
    .trim();

  if (transcriptTopic) {
    return transcriptTopic.length > 80 ? `${transcriptTopic.slice(0, 77)}...` : transcriptTopic;
  }

  const materialSnippet = courseMaterial.replace(/\s+/g, " ").trim();
  if (materialSnippet) {
    return materialSnippet.length > 80 ? `${materialSnippet.slice(0, 77)}...` : materialSnippet;
  }

  return "current STEM coursework";
}

function buildFallbackLetter(
  studentName: string,
  metrics: SessionMetrics,
  courseMaterial: string,
  conversationHistory: ConversationTurn[]
): ProgressLetter {
  const studentLabel = studentName.trim() || "the student";
  const language = getTutorLanguage(metrics.tutorLanguageCode);
  const focusTopic = inferFocusTopic(metrics.activeCourseFiles, courseMaterial, conversationHistory);
  const minutes = formatDuration(metrics.elapsedMs);
  const interactionCount = Math.max(metrics.userTurnCount, metrics.assistantTurnCount);

  const annotationSentence =
    metrics.annotationCount > 0
      ? `The session included ${metrics.annotationCount} highlighted ${
          metrics.annotationCount === 1 ? "area" : "areas"
        } on the whiteboard for targeted error review.`
      : "The student used the whiteboard to work through the material in real time.";

  const practiceSentence =
    metrics.practiceProblemCount > 0
      ? `The tutor generated ${metrics.practiceProblemCount} practice ${
          metrics.practiceProblemCount === 1 ? "problem" : "problems"
        } to reinforce the concept.`
      : "The tutor focused on guided questioning and step-by-step reasoning.";

  const visualSentence =
    metrics.visualAidCount > 0
      ? `The tutor also drew ${metrics.visualAidCount} whiteboard ${
          metrics.visualAidCount === 1 ? "visual aid" : "visual aids"
        } to make the concept visible.`
      : "The tutor relied on spoken questioning and the live whiteboard work for explanation.";

  return {
    headline: "EduEquity Progress Letter",
    summaryParagraph: `Today ${studentLabel} worked in EduEquity for ${minutes} on ${focusTopic}. The session was conducted in ${language.nativeLabel}, and the student stayed engaged through ${interactionCount} tutoring exchanges. ${annotationSentence} ${practiceSentence} ${visualSentence}`,
    accomplishments: [
      `Sustained academic focus for ${minutes}.`,
      `Used ${language.nativeLabel} as the working language for explanation and discussion.`,
      metrics.visualAidCount > 0
        ? `Learned through ${metrics.visualAidCount} whiteboard visual ${metrics.visualAidCount === 1 ? "model" : "models"} drawn during the session.`
        : metrics.annotationCount > 0
          ? `Reviewed ${metrics.annotationCount} highlighted ${metrics.annotationCount === 1 ? "error" : "errors"} on the whiteboard.`
          : "Participated in guided Socratic questioning on the whiteboard.",
    ],
    evidence: [
      `${metrics.userTurnCount} student responses and ${metrics.assistantTurnCount} tutor replies were captured in the session history.`,
      metrics.visualAidCount > 0
        ? `The tutor created ${metrics.visualAidCount} visual ${metrics.visualAidCount === 1 ? "support" : "supports"} directly on the whiteboard.`
        : "The whiteboard conversation remained text and drawing based without additional generated visuals.",
      metrics.activeCourseFiles.length > 0
        ? `The tutor grounded the session in ${metrics.activeCourseFiles.length} uploaded course ${
            metrics.activeCourseFiles.length === 1 ? "file" : "files"
          }.`
        : "The tutor used the live conversation and whiteboard work as the primary evidence base.",
    ],
    nextSteps: [
      "Review the highlighted work and ask the student to explain each correction aloud.",
      "Assign one short follow-up problem on the same concept to confirm retention.",
      "Continue encouraging the student to verbalize reasoning before writing the final answer.",
    ],
  };
}

function buildPrompt(
  studentName: string,
  metrics: SessionMetrics,
  courseMaterial: string,
  conversationHistory: ConversationTurn[]
) {
  const language = getTutorLanguage(metrics.tutorLanguageCode);

  return `You write concise, professional academic progress letters that a student can bring to a teacher, counselor, or parent.

Write the letter in ${language.nativeLabel} (${language.label}).
Ground every claim in the provided evidence.
Do not invent mastery, self-correction, or behavior that is not supported by the transcript or metrics.
If the evidence is partial, use careful language such as "began to", "worked on", "reviewed", or "practiced".
Mention that the session language was ${language.nativeLabel} when relevant.
Keep the tone specific, affirming, and school-appropriate.

Return JSON only using this schema:
{
  "headline": string,
  "summaryParagraph": string,
  "accomplishments": string[],
  "evidence": string[],
  "nextSteps": string[]
}

Requirements:
- summaryParagraph should be 2-4 sentences.
- accomplishments: 3 bullet points max.
- evidence: 3 bullet points max.
- nextSteps: 3 bullet points max.
- Use the student's name if provided. If not, say "the student".

Student name: ${studentName.trim() || "the student"}

Session metrics:
${JSON.stringify(metrics, null, 2)}

Course material excerpt:
${courseMaterial.slice(0, 6000) || "No uploaded course material"}

Conversation history:
${JSON.stringify(conversationHistory.slice(-12), null, 2)}`;
}

export async function POST(request: NextRequest) {
  const clonedRequest = request.clone();

  try {
    const body = (await request.json()) as ProgressLetterRequestBody;
    const sessionMetrics = body.sessionMetrics;
    const conversationHistory = body.conversationHistory ?? [];
    const courseMaterial = body.courseMaterial ?? "";
    const studentName = body.studentName ?? "";

    if (!sessionMetrics) {
      return NextResponse.json({ error: "Missing session metrics" }, { status: 400 });
    }

    // Use local Qwen2.5 text model for progress letter generation
    const textRes = await fetch(`${LOCAL_MODEL_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LOCAL_TEXT_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: buildPrompt(studentName, sessionMetrics, courseMaterial, conversationHistory),
          },
          {
            role: "user",
            content: "Generate the progress letter JSON now.",
          },
        ],
      }),
    });

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
    const clean = content.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(clean) as ProgressLetter;

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Progress-letter route error:", error);

    try {
      const body = (await clonedRequest.json()) as ProgressLetterRequestBody;
      if (body.sessionMetrics) {
        return NextResponse.json(
          buildFallbackLetter(
            body.studentName ?? "",
            body.sessionMetrics,
            body.courseMaterial ?? "",
            body.conversationHistory ?? []
          ),
          { status: 200 }
        );
      }
    } catch {
      // fall through
    }

    return NextResponse.json({ error: "Failed to generate progress letter" }, { status: 500 });
  }
}
