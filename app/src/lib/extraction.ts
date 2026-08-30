import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv, isClaudeExtractionConfigured } from "@/lib/env";

export interface ExtractedInquiryFields {
  parentName: string | null;
  studentName: string | null;
  gradeInterested: string | null;
  parentPhone: string | null;
  /** "claude" when a real model call grounded the fields, "heuristic" when the deterministic fallback ran. */
  method: "claude" | "heuristic";
}

export interface ExtractionInput {
  fromName: string | null;
  fromEmail: string;
  subject: string;
  textBody: string;
  gradeLevels: string[];
}

const RECORD_FIELDS_TOOL_NAME = "record_inquiry_fields";

/**
 * Pulls structured admissions fields out of a free-text parent email.
 *
 * Grounding: `grade_interested` is a Claude tool-use parameter whose JSON
 * schema `enum` is the school's *real* grade_levels list (plus null) — the
 * model is structurally incapable of returning a grade the school doesn't
 * teach, it can only pick from what's actually offered or say it doesn't know.
 *
 * Falls back to a deterministic heuristic parser when ANTHROPIC_API_KEY
 * isn't set, so no inquiry is ever dropped or blocked on missing config —
 * every email still gets a same-day, data-grounded reply either way.
 */
export async function extractInquiryFields(input: ExtractionInput): Promise<ExtractedInquiryFields> {
  if (isClaudeExtractionConfigured()) {
    try {
      return await extractWithClaude(input);
    } catch (error) {
      console.error("[extraction] Claude extraction failed, falling back to heuristic parser:", error);
      return { ...extractWithHeuristics(input), method: "heuristic" };
    }
  }

  return { ...extractWithHeuristics(input), method: "heuristic" };
}

async function extractWithClaude(input: ExtractionInput): Promise<ExtractedInquiryFields> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    system:
      "You extract admissions-inquiry fields from a parent's email to a school. " +
      "Only use information actually present in the email. Never guess a grade the " +
      "school does not offer — if the email doesn't clearly name one of the school's " +
      "own grades, leave grade_interested null. Never invent a name or phone number.",
    tools: [
      {
        name: RECORD_FIELDS_TOOL_NAME,
        description: "Record the admissions fields found in the parent's email.",
        input_schema: {
          type: "object",
          properties: {
            parent_name: {
              type: ["string", "null"],
              description: "The parent/guardian's name, if stated.",
            },
            student_name: {
              type: ["string", "null"],
              description: "The prospective student's first name (and last name if given).",
            },
            grade_interested: {
              type: ["string", "null"],
              enum: [...input.gradeLevels, null],
              description: "Must be exactly one of the school's real grade levels, or null if unclear.",
            },
            parent_phone: {
              type: ["string", "null"],
              description: "A phone number the parent gave, if any.",
            },
          },
          required: ["parent_name", "student_name", "grade_interested", "parent_phone"],
        },
      },
    ],
    tool_choice: { type: "tool", name: RECORD_FIELDS_TOOL_NAME },
    messages: [
      {
        role: "user",
        content:
          `From: ${input.fromName ?? "unknown"} <${input.fromEmail}>\n` +
          `Subject: ${input.subject}\n\n${input.textBody}`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === RECORD_FIELDS_TOOL_NAME,
  );

  if (!toolUse) {
    throw new Error("Claude did not return the expected tool_use block");
  }

  const fields = toolUse.input as {
    parent_name: string | null;
    student_name: string | null;
    grade_interested: string | null;
    parent_phone: string | null;
  };

  return {
    parentName: fields.parent_name,
    studentName: fields.student_name,
    gradeInterested: fields.grade_interested,
    parentPhone: fields.parent_phone,
    method: "claude",
  };
}

// ── Deterministic fallback ───────────────────────────────────────────────
// No external API required. Grounded the same way: grade_interested can
// only ever be a value drawn from `gradeLevels`.

const NAME_PATTERNS = [
  /my (?:son|daughter|child)(?:'s name is| named| is called|,)?\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/,
  /(?:for|regarding)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)(?:'s)?\s+(?:enroll|admission|application)/i,
];

const PARENT_NAME_PATTERNS = [/^([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)\s*$/m, /regards,?\s*\n?\s*([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/i];

const PHONE_PATTERN = /(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/;

function extractWithHeuristics(input: ExtractionInput): Omit<ExtractedInquiryFields, "method"> {
  const body = input.textBody;

  const gradeInterested = matchKnownGrade(body, input.gradeLevels) ?? matchKnownGrade(input.subject, input.gradeLevels);

  let studentName: string | null = null;
  for (const pattern of NAME_PATTERNS) {
    const match = body.match(pattern);
    if (match?.[1]) {
      studentName = match[1].trim();
      break;
    }
  }

  let parentName = input.fromName?.trim() || null;
  if (!parentName) {
    for (const pattern of PARENT_NAME_PATTERNS) {
      const match = body.match(pattern);
      if (match?.[1]) {
        parentName = match[1].trim();
        break;
      }
    }
  }

  const phoneMatch = body.match(PHONE_PATTERN);
  const parentPhone = phoneMatch?.[1]?.trim() ?? null;

  return { parentName, studentName, gradeInterested, parentPhone };
}

/** Finds a school's own grade token inside free text — never returns anything outside `gradeLevels`. */
function matchKnownGrade(text: string, gradeLevels: string[]): string | null {
  const normalized = text.toLowerCase();

  // Longest grade names first so "Kindergarten" isn't shadowed by a
  // shorter partial match, and word-boundary matching so "1st Grade"
  // doesn't match inside "21st Grade Ave.".
  const sorted = [...gradeLevels].sort((a, b) => b.length - a.length);

  for (const grade of sorted) {
    const escaped = grade.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
    if (pattern.test(normalized)) {
      return grade;
    }
  }

  return null;
}
