import "server-only";

import { createHash } from "node:crypto";

import { parseAssignmentAnalysis } from "@/lib/assignment-analysis";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);
const DOCUMENT_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

type FirebaseAccount = { displayName?: string; localId?: string };

const errorResponse = (message: string, status: number) =>
  Response.json({ error: message }, { status });

const requireAssignmentPlanner = async (
  idToken: string,
  targetStudentUid: string,
) => {
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!firebaseApiKey || !firebaseProjectId) {
    throw new Error("Firebase server configuration is missing");
  }

  const accountResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
    {
      body: JSON.stringify({ idToken }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const accountData = (await accountResponse.json()) as { users?: FirebaseAccount[] };
  const account = accountData.users?.[0];
  const username = account?.displayName?.trim().toLowerCase();

  if (!accountResponse.ok || !account?.localId || !username) {
    throw new Error("Your session is invalid or has expired. Sign in again.");
  }

  let profileResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
      `/databases/(default)/documents/profiles/${encodeURIComponent(account.localId)}`,
    { cache: "no-store", headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (!profileResponse.ok) {
    profileResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
        `/databases/(default)/documents/users/${encodeURIComponent(username)}`,
      { cache: "no-store", headers: { Authorization: `Bearer ${idToken}` } },
    );
  }
  const profile = (await profileResponse.json()) as {
    fields?: Record<string, { stringValue?: string }>;
  };
  const role = profile.fields?.role?.stringValue;

  if (!profileResponse.ok || profile.fields?.uid?.stringValue !== account.localId) {
    throw new Error("Your SnapSchool profile could not be verified");
  }
  if (role === "administrator") return account.localId;
  if (role === "student") {
    if (targetStudentUid && targetStudentUid !== account.localId) {
      throw new Error("Students can only plan assignments for themselves");
    }
    return account.localId;
  }
  if (role !== "parent" || !targetStudentUid) {
    throw new Error("This account cannot analyze personal assignments");
  }

  const connectionId = `${account.localId}_${targetStudentUid}`;
  const connectionResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
      `/databases/(default)/documents/familyConnections/${encodeURIComponent(connectionId)}`,
    { cache: "no-store", headers: { Authorization: `Bearer ${idToken}` } },
  );
  const connection = (await connectionResponse.json()) as {
    fields?: Record<string, { stringValue?: string }>;
  };
  if (
    !connectionResponse.ok ||
    connection.fields?.parentUid?.stringValue !== account.localId ||
    connection.fields?.studentUid?.stringValue !== targetStudentUid ||
    connection.fields?.status?.stringValue !== "approved"
  ) {
    throw new Error("The student must approve parent access before you can plan assignments");
  }

  let studentResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
      `/databases/(default)/documents/profiles/${encodeURIComponent(targetStudentUid)}`,
    { cache: "no-store", headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (!studentResponse.ok && connection.fields?.studentUsername?.stringValue) {
    studentResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
        `/databases/(default)/documents/users/${encodeURIComponent(connection.fields.studentUsername.stringValue)}`,
      { cache: "no-store", headers: { Authorization: `Bearer ${idToken}` } },
    );
  }
  const studentProfile = (await studentResponse.json()) as {
    fields?: Record<string, { stringValue?: string }>;
  };
  if (
    !studentResponse.ok ||
    studentProfile.fields?.uid?.stringValue !== targetStudentUid ||
    studentProfile.fields?.role?.stringValue !== "student"
  ) {
    throw new Error("The approved student profile could not be verified");
  }

  return account.localId;
};

const assignmentSchema = {
  additionalProperties: false,
  properties: {
    assignmentKind: {
      enum: ["essay", "exam", "homework", "other", "project", "quiz", "reading", "test"],
      type: "string",
    },
    assignmentSummary: { type: "string" },
    dailyTasks: {
      items: {
        additionalProperties: false,
        properties: {
          dayNumber: { type: "integer" },
          description: { type: "string" },
          estimatedMinutes: { type: "integer" },
          title: { type: "string" },
        },
        required: ["dayNumber", "description", "estimatedMinutes", "title"],
        type: "object",
      },
      type: "array",
    },
    detectedDueDate: { type: ["string", "null"] },
    dueDateConfidence: {
      enum: ["high", "medium", "low", "not_found"],
      type: "string",
    },
    estimatedTotalMinutes: { type: "integer" },
    inputValid: { type: "boolean" },
    recommendedWorkDays: { type: "integer" },
    suggestedTitle: { type: "string" },
    warnings: { items: { type: "string" }, type: "array" },
    workloadRationale: { type: "string" },
  },
  required: [
    "assignmentKind", "assignmentSummary", "dailyTasks", "detectedDueDate", "dueDateConfidence",
    "estimatedTotalMinutes", "inputValid", "recommendedWorkDays",
    "suggestedTitle", "warnings", "workloadRationale",
  ],
  type: "object",
} as const;

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!idToken) return errorResponse("You must be signed in", 401);

    const formData = await request.formData();
    const targetStudentUid = String(formData.get("targetStudentUid") ?? "").trim();
    const plannerId = await requireAssignmentPlanner(idToken, targetStudentUid);
    const openAIKey = process.env.OPENAI_API_KEY;
    if (!openAIKey) {
      return errorResponse(
        "AI analysis is not configured yet. Add OPENAI_API_KEY to .env.local and restart the app.",
        503,
      );
    }

    const description = String(formData.get("description") ?? "").trim();
    const teacherDueDate = String(formData.get("dueDate") ?? "").trim();
    const groupWorkerCountRaw = String(formData.get("groupWorkerCount") ?? "").trim();
    const groupCountRaw = String(formData.get("groupCount") ?? "").trim();
    const groupWorkerCount = groupWorkerCountRaw
      ? Number.parseInt(groupWorkerCountRaw, 10)
      : 1;
    const groupCount = groupCountRaw ? Number.parseInt(groupCountRaw, 10) : 1;
    const fileValue = formData.get("file");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

    if (!description && !file) return errorResponse("Add a description or upload an assignment file", 400);
    if (description.length > 12000) return errorResponse("The description must be 12,000 characters or less", 400);
    if (teacherDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(teacherDueDate)) return errorResponse("Enter a valid due date", 400);
    if (!Number.isInteger(groupWorkerCount) || groupWorkerCount < 1 || groupWorkerCount > 100) return errorResponse("Enter a valid group size", 400);
    if (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > 30) return errorResponse("Enter a valid number of groups", 400);
    if (file && file.size > MAX_FILE_BYTES) return errorResponse("The uploaded file must be 10 MB or smaller", 400);
    if (file && !IMAGE_TYPES.has(file.type) && !DOCUMENT_TYPES.has(file.type)) {
      return errorResponse("Upload a PNG, JPEG, WebP, GIF, PDF, Word, or text file", 400);
    }

    const content: Array<Record<string, unknown>> = [{
      text:
        `Analyze this school assignment for the person organizing it. Today is ${new Date().toISOString().slice(0, 10)}.\n` +
        `Provided due date: ${teacherDueDate || "none"}. A provided date overrides any date found in the source.\n` +
        `This plan will be shared once across ${groupCount} group${groupCount === 1 ? "" : "s"}. The smallest group has ${groupWorkerCount} student workers, so make every step achievable by that group size.\n` +
        `Teacher description: ${description || "none"}.\n\n` +
        "Extract a concise title and the actual deliverables. Estimate realistic student work time. " +
        "Classify the work as essay, exam, homework, other, project, quiz, reading, or test. " +
        "Recommend 1-60 active workdays and produce exactly one manageable task for each recommended day. " +
        (groupWorkerCount > 1
          ? "This is a collaborative assignment. Account for the number of workers, identify tasks that can happen in parallel, include coordination and integration checkpoints, and make each daily step a concrete shared team outcome rather than multiplying the workload by the group size. "
          : "") +
        "Use calendar time between today and the due date when one is known. Do not invent a due date. " +
        "SPECIAL RULE FOR TESTS, QUIZZES, AND EXAMS: Create a study plan rather than a completion checklist. " +
        "Divide the tested topics across days, name the specific material to review, and include active recall, practice questions, and spaced review. " +
        "Use early sessions for focused topic review, middle sessions for retrieval and targeted practice, and the final session for cumulative mixed practice and a readiness check rather than substantial new material. " +
        "Never use a vague task such as 'study for the test.' If the tested topics are not provided, do not invent them; create clearly labeled review categories from the available source and add a warning asking the teacher to confirm coverage. " +
        "If the source is unreadable, unrelated, or lacks enough assignment information, set inputValid false and explain why in warnings. " +
        "This is a planning recommendation that the person adding the assignment will review, not a final educational judgment.",
      type: "input_text",
    }];

    if (file) {
      const dataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
      content.push(IMAGE_TYPES.has(file.type)
        ? { detail: "high", image_url: dataUrl, type: "input_image" }
        : { file_data: dataUrl, filename: file.name || "assignment", type: "input_file" });
    }

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        instructions:
          "You are an educational workload and study-plan designer. Produce concrete, age-appropriate daily actions grounded only in the provided assignment source. Distinguish preparation for an assessment from production work, and follow every assessment-specific planning rule in the user request.",
        input: [{ content, role: "user" }],
        max_output_tokens: 3000,
        model: "gpt-5.6",
        reasoning: { effort: "medium" },
        safety_identifier: createHash("sha256").update(plannerId).digest("hex"),
        store: false,
        text: { format: { name: "assignment_analysis", schema: assignmentSchema, strict: true, type: "json_schema" } },
      }),
      headers: { Authorization: `Bearer ${openAIKey}`, "Content-Type": "application/json" },
      method: "POST",
    });
    const result = (await openAIResponse.json()) as {
      error?: { message?: string };
      output?: Array<{ content?: Array<{ refusal?: string; text?: string; type?: string }>; type?: string }>;
    };

    if (!openAIResponse.ok) throw new Error(result.error?.message ?? "OpenAI could not analyze the assignment");
    const outputContent = result.output?.find((item) => item.type === "message")
      ?.content?.find((item) => item.type === "output_text");
    if (outputContent?.refusal) return errorResponse("The assignment could not be analyzed safely", 422);
    if (!outputContent?.text) throw new Error("OpenAI returned no assignment analysis");

    return Response.json({ analysis: parseAssignmentAnalysis(JSON.parse(outputContent.text)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to analyze assignment";
    const status = /session|signed in/i.test(message) ? 401 : /cannot|only|approve|school-connected/i.test(message) ? 403 : 500;
    return errorResponse(message, status);
  }
}
