import "server-only";

import { createHash } from "node:crypto";

import {
  balanceAssignmentTasks,
  parseAssignmentAnalysis,
} from "@/lib/assignment-analysis";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 10;
const MAX_TOTAL_FILE_BYTES = 30 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);
const DOCUMENT_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

type FirebaseAccount = { displayName?: string; localId?: string };
type FirestoreDocument = {
  fields?: Record<string, { stringValue?: string }>;
};

const errorResponse = (message: string, status: number) =>
  Response.json({ error: message }, { status });

const getApprovedConnection = async (
  idToken: string,
  projectId: string,
  parentUid: string,
  studentUid: string,
) => {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
      "/databases/(default)/documents:runQuery",
    {
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "familyConnections" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "parentUid" },
              op: "EQUAL",
              value: { stringValue: parentUid },
            },
          },
        },
      }),
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("Unable to verify the approved parent connection");
  const rows = (await response.json()) as Array<{ document?: FirestoreDocument }>;
  return rows
    .map((row) => row.document)
    .find(
      (document) =>
        document?.fields?.parentUid?.stringValue === parentUid &&
        document.fields?.studentUid?.stringValue === studentUid &&
        document.fields?.status?.stringValue === "approved",
    );
};

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

  const connection = await getApprovedConnection(
    idToken,
    firebaseProjectId,
    account.localId,
    targetStudentUid,
  );
  if (!connection) {
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
    assignmentSummary: { maxLength: 600, type: "string" },
    dailyTasks: {
      items: {
        additionalProperties: false,
        properties: {
          dayNumber: { type: "integer" },
          description: { maxLength: 160, type: "string" },
          estimatedMinutes: { type: "integer" },
          title: { maxLength: 70, type: "string" },
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
    suggestedTitle: { maxLength: 100, type: "string" },
    warnings: { items: { maxLength: 400, type: "string" }, type: "array" },
    workloadRationale: { maxLength: 600, type: "string" },
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
    const clarification = String(formData.get("clarification") ?? "").trim();
    const teacherDueDate = String(formData.get("dueDateOverride") ?? "").trim();
    const groupWorkerCountRaw = String(formData.get("groupWorkerCount") ?? "").trim();
    const groupCountRaw = String(formData.get("groupCount") ?? "").trim();
    const groupWorkerCount = groupWorkerCountRaw
      ? Number.parseInt(groupWorkerCountRaw, 10)
      : 1;
    const groupCount = groupCountRaw ? Number.parseInt(groupCountRaw, 10) : 1;
    const files = [
      ...formData.getAll("files"),
      ...formData.getAll("file"),
    ].filter(
      (value): value is File => value instanceof File && value.size > 0,
    );

    if (!description && files.length === 0) return errorResponse("Add a description or upload assignment files", 400);
    if (description.length > 12000) return errorResponse("The description must be 12,000 characters or less", 400);
    if (clarification.length > 4000) return errorResponse("The clarification must be 4,000 characters or less", 400);
    if (teacherDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(teacherDueDate)) return errorResponse("Enter a valid due date", 400);
    if (!Number.isInteger(groupWorkerCount) || groupWorkerCount < 1 || groupWorkerCount > 100) return errorResponse("Enter a valid group size", 400);
    if (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > 30) return errorResponse("Enter a valid number of groups", 400);
    if (files.length > MAX_FILE_COUNT) return errorResponse(`Upload no more than ${MAX_FILE_COUNT} files at once`, 400);
    if (files.some((file) => file.size > MAX_FILE_BYTES)) return errorResponse("Each uploaded file must be 10 MB or smaller", 400);
    if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_FILE_BYTES) {
      return errorResponse("The combined uploads must be 30 MB or smaller", 400);
    }
    if (files.some((file) => !IMAGE_TYPES.has(file.type) && !DOCUMENT_TYPES.has(file.type))) {
      return errorResponse("Upload a PNG, JPEG, WebP, GIF, PDF, Word, or text file", 400);
    }

    const content: Array<Record<string, unknown>> = [{
      text:
        `Analyze this school assignment for the person organizing it. Today is ${new Date().toISOString().slice(0, 10)}.\n` +
        `Teacher-entered due-date override: ${teacherDueDate || "none"}. Only this explicitly entered override supersedes dates found in the source.\n` +
        `This plan will be shared once across ${groupCount} group${groupCount === 1 ? "" : "s"}. The smallest group has ${groupWorkerCount} student workers, so make every step achievable by that group size.\n` +
        `Teacher description: ${description || "none"}.\n\n` +
        `Uploaded source files: ${files.length}. Treat all uploaded files as parts of the same assignment, read them in the supplied order, and reconcile instructions or dates across the complete set.\n\n` +
        `Teacher clarification after reviewing an earlier analysis: ${clarification || "none"}. Treat this clarification as authoritative when it resolves ambiguity in the source.\n\n` +
        "Extract a concise title and the actual deliverables. Estimate realistic student work time. " +
        "Classify the work as essay, exam, homework, other, project, quiz, reading, or test. " +
        "Recommend 1-60 active workdays and produce exactly one manageable task for each recommended day. " +
        "Disperse work across as many reasonable pre-deadline days as possible and minimize the highest daily workload. Aim for roughly 20-40 minutes per active day when time permits, with daily estimates as even as possible. Never leave a light earlier day followed by a multi-hour final workday when that work could be divided. Keep missions from this assignment on separate days. Do not exceed 60 minutes in one task unless total remaining work divided by available days makes that mathematically unavoidable. " +
        "Keep the plan concise enough for a classroom dashboard: task titles must be at most 70 characters, task descriptions at most 160 characters, the summary at most 600 characters, and the workload rationale at most 600 characters. " +
        (groupWorkerCount > 1
          ? "This is a collaborative assignment. Account for the number of workers, identify tasks that can happen in parallel, include coordination and integration checkpoints, and make each daily step a concrete shared team outcome rather than multiplying the workload by the group size. "
          : "") +
        "Treat the due date as the submission or in-class hand-in date, never as a normal work day. When a due date is known, schedule the final task no later than the calendar day BEFORE it is due and count available workdays from today through that prior day. Never schedule ordinary work on or after the due date. If there is no full pre-deadline workday available, flag that clearly instead of inventing future work. Do not invent a due date. " +
        "When the source is a schedule containing several dated milestones, preserve those milestones in the summary and plan and use the final relevant deadline as detectedDueDate. If dates omit a year, resolve them to the nearest future occurrence that preserves the source's chronological order. Never substitute today's date for an undated or yearless deadline. " +
        "For a dated reading schedule, prefer one concrete task per reading or assessment milestone, with limited preparation tasks where useful; do not create a separate task for every calendar day. " +
        "SPECIAL RULE FOR TESTS, QUIZZES, AND EXAMS: Create a study plan rather than a completion checklist. " +
        "Divide the tested topics across days, name the specific material to review, and include active recall, practice questions, and spaced review. " +
        "Use early sessions for focused topic review, middle sessions for retrieval and targeted practice, and the final session for cumulative mixed practice and a readiness check rather than substantial new material. " +
        "Never use a vague task such as 'study for the test.' If the tested topics are not provided, do not invent them; create clearly labeled review categories from the available source and add a warning asking the teacher to confirm coverage. " +
        "If the source is unreadable, unrelated, or lacks enough assignment information, set inputValid false and explain why in warnings. " +
        "This is a planning recommendation that the person adding the assignment will review, not a final educational judgment.",
      type: "input_text",
    }];

    for (const file of files) {
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
        max_output_tokens: 10000,
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
      incomplete_details?: { reason?: string };
      output?: Array<{ content?: Array<{ refusal?: string; text?: string; type?: string }>; type?: string }>;
      status?: string;
    };

    if (!openAIResponse.ok) throw new Error(result.error?.message ?? "OpenAI could not analyze the assignment");
    if (result.status === "incomplete") {
      throw new Error(
        result.incomplete_details?.reason === "max_output_tokens"
          ? "The assignment plan was longer than the AI response limit. Please analyze it again."
          : "The AI could not finish the assignment plan. Please analyze it again.",
      );
    }
    const outputContent = result.output?.find((item) => item.type === "message")
      ?.content?.find((item) => item.type === "output_text");
    if (outputContent?.refusal) return errorResponse("The assignment could not be analyzed safely", 422);
    if (!outputContent?.text) throw new Error("OpenAI returned no assignment analysis");

    try {
      const analysis = parseAssignmentAnalysis(JSON.parse(outputContent.text));
      const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      const planningDueDate = teacherDueDate || analysis.detectedDueDate;
      const taskMinutes = analysis.dailyTasks.reduce(
        (total, task) => total + task.estimatedMinutes,
        0,
      );
      const maximumDays = planningDueDate
        ? Math.max(
            1,
            Math.floor(
              (new Date(`${planningDueDate}T00:00:00Z`).getTime() - today.getTime()) /
                86_400_000,
            ),
          )
        : Math.min(
            60,
            Math.max(analysis.recommendedWorkDays, Math.ceil(taskMinutes / 30)),
          );
      const dailyTasks = balanceAssignmentTasks(
        analysis.dailyTasks,
        maximumDays,
      );
      return Response.json({
        analysis: {
          ...analysis,
          dailyTasks,
          estimatedTotalMinutes: taskMinutes,
          recommendedWorkDays: dailyTasks.length,
        },
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("The AI response ended before the assignment plan was complete. Please analyze it again.");
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to analyze assignment";
    const status = /session|signed in/i.test(message) ? 401 : /cannot|only|approve|school-connected/i.test(message) ? 403 : 500;
    return errorResponse(message, status);
  }
}
