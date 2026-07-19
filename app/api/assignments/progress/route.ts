import "server-only";

import { createHash } from "node:crypto";
import { StreamChat } from "stream-chat";

import {
  ASSIGNMENT_SCHEDULE_VERSION,
  balanceAssignmentTasks,
  type AssignmentTask,
} from "@/lib/assignment-analysis";
import { parseProgressAnalysis } from "@/lib/progress-analysis";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_TOTAL_FILE_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);
const DOCUMENT_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

type FirebaseProfile = {
  role: "student" | "administrator" | "parent";
  uid: string;
  username: string;
};

type FirestoreValue = {
  integerValue?: string;
  stringValue?: string;
};

type GroupContribution = {
  lastProgressAt: string;
  progressSummary: string;
  submissionCount: number;
  username: string;
};

const errorResponse = (message: string, status: number) =>
  Response.json({ error: message }, { status });

const authenticateStudent = async (idToken: string): Promise<FirebaseProfile> => {
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!firebaseApiKey || !firebaseProjectId) throw new Error("Firebase server configuration is missing");

  const accountResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
    {
      body: JSON.stringify({ idToken }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const accountData = (await accountResponse.json()) as {
    users?: Array<{ displayName?: string; localId?: string }>;
  };
  const account = accountData.users?.[0];
  const username = account?.displayName?.trim().toLowerCase();
  if (!accountResponse.ok || !account?.localId || !username) {
    throw new Error("Your session is invalid or has expired. Sign in again.");
  }

  const profileResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
      `/databases/(default)/documents/users/${encodeURIComponent(username)}`,
    { cache: "no-store", headers: { Authorization: `Bearer ${idToken}` } },
  );
  const profileData = (await profileResponse.json()) as {
    fields?: Record<string, { stringValue?: string }>;
  };
  const role = profileData.fields?.role?.stringValue;
  const uid = profileData.fields?.uid?.stringValue;
  if (!profileResponse.ok || uid !== account.localId || (role !== "student" && role !== "administrator" && role !== "parent")) {
    throw new Error("Your SchoolSnap profile could not be verified");
  }
  if (role !== "student") throw new Error("Only students can submit progress evidence");

  return { role, uid, username };
};

const progressSchema = {
  additionalProperties: false,
  properties: {
    completedWork: { items: { type: "string" }, type: "array" },
    confidence: { enum: ["high", "medium", "low"], type: "string" },
    dueDateRisk: { enum: ["complete", "on_track", "at_risk", "overdue"], type: "string" },
    estimatedCompletionPercent: { maximum: 100, minimum: 0, type: "integer" },
    estimatedRemainingMinutes: { type: "integer" },
    feedback: { type: "string" },
    progressSufficient: { type: "boolean" },
    progressSummary: { type: "string" },
    recommendedRemainingWorkDays: { type: "integer" },
    remainingWorkSummary: { type: "string" },
    revisedDailyTasks: {
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
    warnings: { items: { type: "string" }, type: "array" },
  },
  required: [
    "completedWork", "confidence", "dueDateRisk", "estimatedCompletionPercent", "estimatedRemainingMinutes",
    "feedback", "progressSufficient", "progressSummary",
    "recommendedRemainingWorkDays", "remainingWorkSummary",
    "revisedDailyTasks", "warnings",
  ],
  type: "object",
} as const;

const readInteger = (fields: Record<string, FirestoreValue>, name: string) => {
  const value = Number(fields[name]?.integerValue);
  return Number.isInteger(value) && value >= 0 ? value : 0;
};

const parseTasks = (value: unknown): AssignmentTask[] => {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as AssignmentTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!idToken) return errorResponse("You must be signed in", 401);

    const student = await authenticateStudent(idToken);
    const openAIKey = process.env.OPENAI_API_KEY;
    const streamApiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
    const streamSecret = process.env.STREAM_SECRET_KEY;
    const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!openAIKey) return errorResponse("AI progress review is not configured", 503);
    if (!streamApiKey || !streamSecret || !firebaseProjectId) throw new Error("The server is missing Stream or Firebase configuration");

    const formData = await request.formData();
    const channelCid = String(formData.get("channelCid") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const submittedFiles = formData.getAll("files");
    const legacyFile = formData.get("file");
    const files = (submittedFiles.length ? submittedFiles : [legacyFile]).filter(
      (value): value is File => value instanceof File && value.size > 0,
    );
    if (!files.length && !note) {
      return errorResponse("Describe what you completed or upload a screenshot, photo, or document", 400);
    }
    if (files.length > MAX_FILES) return errorResponse(`Upload no more than ${MAX_FILES} photos`, 400);
    if (files.some((file) => file.size > MAX_FILE_BYTES)) return errorResponse("Each progress file must be 10 MB or smaller", 400);
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_FILE_BYTES) {
      return errorResponse("The progress files must be 12 MB or smaller in total", 400);
    }
    if (files.length > 1 && files.some((file) => !IMAGE_TYPES.has(file.type))) {
      return errorResponse(`Upload either one document or up to ${MAX_FILES} worksheet photos`, 400);
    }
    if (files.some((file) => !IMAGE_TYPES.has(file.type) && !DOCUMENT_TYPES.has(file.type))) {
      return errorResponse("Upload PNG, JPEG, WebP, GIF, PDF, Word, or text files", 400);
    }
    if (note.length > 2000) return errorResponse("The progress note must be 2,000 characters or less", 400);

    const separatorIndex = channelCid.indexOf(":");
    const channelType = channelCid.slice(0, separatorIndex);
    const channelId = channelCid.slice(separatorIndex + 1);
    if (separatorIndex < 1 || !/^[a-z0-9_-]+$/.test(channelType) || !/^[a-zA-Z0-9_-]+$/.test(channelId)) {
      return errorResponse("Select a valid assignment conversation", 400);
    }

    const streamClient = StreamChat.getInstance(streamApiKey, streamSecret);
    const channel = streamClient.channel(channelType, channelId);
    await channel.query({ presence: false, state: true, watch: false });
    if (!channel.state.members[student.uid]) return errorResponse("You are not a member of this assignment", 403);
    if (!channel.data?.assignment_title || !channel.data?.due_date || !channel.data?.daily_plan) {
      return errorResponse("This conversation does not have an AI assignment plan", 400);
    }
    const isGroupAssignment = channel.data.assignment_type === "group";
    let groupMemberCount = 0;
    if (isGroupAssignment && typeof channel.data.group_student_ids === "string") {
      try {
        const studentIds = JSON.parse(channel.data.group_student_ids) as string[];
        groupMemberCount = Array.isArray(studentIds) ? studentIds.length : 0;
      } catch {
        groupMemberCount = 0;
      }
    }
    if (isGroupAssignment && groupMemberCount === 0) {
      const administratorIds = new Set<string>();
      if (typeof channel.data.group_administrator_ids === "string") {
        try {
          const parsed = JSON.parse(channel.data.group_administrator_ids) as string[];
          if (Array.isArray(parsed)) parsed.forEach((id) => administratorIds.add(id));
        } catch {
          // Fall back to counting all members except the assignment creator.
        }
      }
      if (channel.data.created_by_id) administratorIds.add(channel.data.created_by_id);
      groupMemberCount = Object.keys(channel.state.members).filter(
        (memberId) => !administratorIds.has(memberId),
      ).length;
    }
    let groupContributions: Record<string, GroupContribution> = {};
    if (isGroupAssignment && typeof channel.data.group_contributions === "string") {
      try {
        groupContributions = JSON.parse(channel.data.group_contributions) as Record<string, GroupContribution>;
      } catch {
        groupContributions = {};
      }
    }
    const recentGroupActivity = isGroupAssignment
      ? channel.state.messages
          .slice(-20)
          .filter((message) => !message.text?.startsWith("🤖 AI progress review:"))
          .map((message) => ({
            attachments: message.attachments?.length ?? 0,
            member: message.user?.name || message.user?.id || "group member",
            text: message.text?.slice(0, 250) || "attachment shared",
          }))
      : [];

    const today = new Date().toISOString().slice(0, 10);
    const dueDate = channel.data.due_date;
    const dueTime = new Date(`${dueDate}T00:00:00Z`).getTime();
    const todayTime = new Date(`${today}T00:00:00Z`).getTime();
    const daysUntilDue = Math.floor((dueTime - todayTime) / 86400000);
    // The hand-in date is not a normal workday. Future plans can use today
    // through the day before it is due. Overdue work receives a separate
    // accelerated recovery window.
    const availableDays = Math.max(0, daysUntilDue);
    const planningWindowDays = availableDays > 0
      ? availableDays
      : daysUntilDue < 0
        ? 7
        : 1;
    const currentTasks = parseTasks(channel.data.daily_plan);

    const streakUrl =
      `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
      `/databases/(default)/documents/channels/${encodeURIComponent(channelCid)}`;
    const streakResponse = await fetch(streakUrl, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const streakDocument = streakResponse.ok
      ? ((await streakResponse.json()) as { fields?: Record<string, FirestoreValue> })
      : { fields: {} };
    const streakFields = streakDocument.fields ?? {};
    const currentStreak = readInteger(streakFields, "currentStreak");
    const completedWorkDays = readInteger(streakFields, "completedWorkDays") || currentStreak;
    const lastProgressDate = streakFields.lastProgressDate?.stringValue ?? null;
    const remainingTasks = currentTasks.slice(Math.min(completedWorkDays, currentTasks.length));

    const evidenceFiles = await Promise.all(files.map(async (file) => ({
      dataUrl: `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`,
      file,
    })));
    const content: Array<Record<string, unknown>> = [{
      text:
        `Review a student's progress update for the assignment "${channel.data.assignment_title}".\n` +
        `Assignment kind: ${channel.data.assignment_kind ?? "other"}. For a test, quiz, or exam, evidence may include notes, flashcards, practice questions, corrections, or other visible study work; evaluate preparation progress rather than a finished deliverable.\n` +
        (isGroupAssignment
          ? `This is a shared group assignment with ${groupMemberCount} channel members. Review progress toward the team's shared outcome, not only the submitting student's individual effort. Previously reviewed member contributions: ${JSON.stringify(groupContributions)}. Recent visible group activity: ${JSON.stringify(recentGroupActivity)}. Use this activity to recognize work members have reported or shared, identify visible gaps, and propose coordinated next steps. Do not assume unreported work is complete.\n`
          : "") +
        `Today: ${today}. Due date: ${dueDate}. Available normal workdays, counting today through the calendar day BEFORE the due date: ${availableDays}. The due date itself is for submission or in-class use and is not a normal workday.\n` +
        `Planning window: ${planningWindowDays} days. ${daysUntilDue < 0 ? "The deadline has passed, so create an accelerated recovery plan and strongly encourage immediate communication with the teacher." : daysUntilDue === 0 ? "The assignment is due today and no normal pre-deadline workday remains. If unfinished, create one immediate emergency completion-and-submission step rather than scheduling work on future dates." : "Keep every revised task within the original deadline and finish no later than the day before it is due."}\n` +
        `Assignment summary: ${channel.data.assignment_summary ?? "Not provided"}.\n` +
        `Previously completed work days: ${completedWorkDays}.\n` +
        `Remaining plan: ${JSON.stringify(remainingTasks)}.\n` +
        `Student progress statement: ${note || "none"}.\n\n` +
        (files.length > 0
          ? `The student uploaded ${files.length} evidence ${files.length === 1 ? "file" : "files"}. Treat multiple photos as pages or views of the same progress submission and avoid double-counting repeated content. Read the printed and handwritten text that is visible in every uploaded image. For worksheets, compare visibly answered, attempted, or completed questions and sections with the total questions and sections visible across the images, and estimate an overall completion percentage. Judge only work visibly supported by the uploaded evidence; do not infer hidden work and do not grade correctness. If part of the worksheet is outside the photo, state that limitation in warnings and lower confidence instead of assuming it is complete. `
          : "The student submitted a written progress statement without a file. For reading and other tasks that do not naturally create visible evidence, accept a specific self-report when it clearly matches today's mission. For example, 'I read Chapter 1' is sufficient when Chapter 1 is today's assigned reading. Label the work as self-reported, use medium confidence unless the statement includes useful specifics, and do not demand photographic proof for inherently non-visual work. Reject only statements that are too vague, unrelated, or do not claim meaningful progress toward today's task. ") +
        "Set progressSufficient true only when the submitted update shows meaningful progress toward today's planned assignment work. " +
        "Then describe what is complete, what remains, and rebuild the remaining plan so it fits within the planning window. For work that is not already overdue, the final planned task must be completed no later than the day before the due date. " +
        "Disperse remaining work across separate future days and minimize the highest daily workload. Aim for roughly 20-40 minutes per active day when possible, keep estimates even, and never create a light day followed by a multi-hour final day if that work can be divided. Use only one mission from this assignment per day. Exceed 60 minutes only when total remaining work divided by the available days makes that unavoidable. " +
        (isGroupAssignment
          ? "For the revised group plan, use concrete team outcomes, parallel work where appropriate, and coordination or integration checkpoints. "
          : "") +
        "Return zero remaining days and no tasks only when the assignment appears complete. " +
        "If evidence is unclear, use low confidence, do not complete the day, and explain how to resubmit. " +
        "The revisedDailyTasks array must contain exactly recommendedRemainingWorkDays tasks and must not exceed the planning window.",
      type: "input_text",
    }];
    evidenceFiles.forEach(({ dataUrl, file }) => {
      content.push(IMAGE_TYPES.has(file.type)
        ? { detail: "high", image_url: dataUrl, type: "input_image" }
        : { file_data: dataUrl, filename: file.name || "progress", type: "input_file" });
    });

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        input: [{ content, role: "user" }],
        max_output_tokens: 4000,
        model: "gpt-5.6",
        reasoning: { effort: "medium" },
        safety_identifier: createHash("sha256").update(student.uid).digest("hex"),
        store: false,
        text: { format: { name: "student_progress_review", schema: progressSchema, strict: true, type: "json_schema" } },
      }),
      headers: { Authorization: `Bearer ${openAIKey}`, "Content-Type": "application/json" },
      method: "POST",
    });
    const openAIResult = (await openAIResponse.json()) as {
      error?: { message?: string };
      output?: Array<{ content?: Array<{ refusal?: string; text?: string; type?: string }>; type?: string }>;
    };
    if (!openAIResponse.ok) throw new Error(openAIResult.error?.message ?? "OpenAI could not review this progress");
    const output = openAIResult.output?.find((item) => item.type === "message")
      ?.content?.find((item) => item.type === "output_text");
    if (output?.refusal) return errorResponse("The progress evidence could not be reviewed safely", 422);
    if (!output?.text) throw new Error("OpenAI returned no progress review");

    const analysis = parseProgressAnalysis(JSON.parse(output.text));
    const approved = analysis.progressSufficient && analysis.confidence !== "low";

    if (!approved) {
      return Response.json({ approved: false, analysis });
    }

    const remainingPlanningDays = Math.max(
      1,
      planningWindowDays - 1,
    );
    const revisedRemainingTasks = balanceAssignmentTasks(
      analysis.revisedDailyTasks,
      remainingPlanningDays,
    ).map((task, index) => ({
      ...task,
      dayNumber:
        completedWorkDays +
        (lastProgressDate !== today ? 1 : 0) +
        index +
        1,
    }));

    const countsToday = lastProgressDate === today;
    const newCompletedWorkDays = completedWorkDays + (countsToday ? 0 : 1);
    let newStreak = currentStreak;
    if (!countsToday) {
      const previousDate = streakFields.lastStreakDate?.stringValue;
      if (!previousDate) newStreak = 1;
      else {
        const dayDifference = Math.floor((todayTime - new Date(`${previousDate}T00:00:00Z`).getTime()) / 86400000);
        newStreak = dayDifference === 1 ? currentStreak + 1 : dayDifference === 0 ? currentStreak : 1;
      }
    }

    const completedTasks = currentTasks.slice(0, Math.min(newCompletedWorkDays, currentTasks.length));
    const revisedPlan = [
      ...completedTasks.map((task, index) => ({ ...task, dayNumber: index + 1 })),
      ...revisedRemainingTasks.map((task, index) => ({ ...task, dayNumber: newCompletedWorkDays + index + 1 })),
    ];
    const newTargetDays = newCompletedWorkDays + revisedRemainingTasks.length;
    const remainingMinutes = revisedRemainingTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
    const updatedGroupContributions = isGroupAssignment
      ? {
          ...groupContributions,
          [student.uid]: {
            lastProgressAt: new Date().toISOString(),
            progressSummary: analysis.progressSummary,
            submissionCount:
              (groupContributions[student.uid]?.submissionCount ?? 0) + 1,
            username: student.username,
          },
        }
      : null;

    await channel.updatePartial({
      set: {
        completed_work_days: newCompletedWorkDays,
        daily_plan: JSON.stringify(revisedPlan),
        estimated_total_minutes: remainingMinutes,
        ...(updatedGroupContributions
          ? { group_contributions: JSON.stringify(updatedGroupContributions) }
          : {}),
        last_progress_at: new Date().toISOString(),
        last_progress_confidence: analysis.confidence,
        estimated_completion_percent: analysis.estimatedCompletionPercent,
        last_progress_summary: analysis.progressSummary,
        recommended_work_days: newTargetDays,
        remaining_work_summary: analysis.remainingWorkSummary,
        schedule_balance_version: ASSIGNMENT_SCHEDULE_VERSION,
      },
    });

    const updateUrl = new URL(streakUrl);
    for (const field of ["completedWorkDays", "currentStreak", "lastProgressDate", "lastStreakDate", "lastProgressSummary", "updatedAt"]) {
      updateUrl.searchParams.append("updateMask.fieldPaths", field);
    }
    const updateResponse = await fetch(updateUrl, {
      body: JSON.stringify({
        fields: {
          completedWorkDays: { integerValue: String(newCompletedWorkDays) },
          currentStreak: { integerValue: String(newStreak) },
          lastProgressDate: { stringValue: today },
          lastProgressSummary: { stringValue: analysis.progressSummary.slice(0, 1000) },
          lastStreakDate: { stringValue: today },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }),
      cache: "no-store",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      method: "PATCH",
    });
    if (!updateResponse.ok) throw new Error("The progress was reviewed, but the streak could not be updated");

    return Response.json({
      analysis: { ...analysis, recommendedRemainingWorkDays: revisedRemainingTasks.length, revisedDailyTasks: revisedRemainingTasks },
      approved: true,
      completedWorkDays: newCompletedWorkDays,
      currentStreak: newStreak,
      targetDays: newTargetDays,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to review progress";
    const status = /session|signed in/i.test(message) ? 401 : /Only students|not a member/i.test(message) ? 403 : 500;
    return errorResponse(message, status);
  }
}
