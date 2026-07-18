import { StreamChat } from "stream-chat";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const maxDuration = 60;

type EmailMode = "daily_summary" | "due_only" | "due_or_urgent";

type ParentPreference = {
  enabled?: boolean;
  lastSentDate?: string;
  mode?: EmailMode;
  parentUid?: string;
  timeZone?: string;
  urgentThresholdHours?: number;
};

type EmailAssignment = {
  className: string;
  completedSteps: number;
  dueDate: string;
  lastProgressAt: string;
  remainingMinutes: number;
  remainingWorkSummary: string;
  studentUsername: string;
  targetSteps: number;
  title: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const dateKey = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const addDays = (key: string, days: number) => {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
};

const progressPercent = (assignment: EmailAssignment) =>
  assignment.targetSteps > 0
    ? Math.min(
        100,
        Math.round(
          (assignment.completedSteps / assignment.targetSteps) * 100,
        ),
      )
    : 0;

const dueLabel = (dueDate: string, today: string) => {
  if (dueDate < today) return `Overdue since ${dueDate}`;
  if (dueDate === today) return "Due today";
  if (dueDate === addDays(today, 1)) return "Due tomorrow";
  return `Due ${dueDate}`;
};

const queryStudentChannels = async (
  client: StreamChat,
  studentUid: string,
  type: "livestream" | "messaging",
) => {
  const channels = [];
  const limit = 30;
  for (let offset = 0; offset < 300; offset += limit) {
    const page = await client.queryChannels(
      { members: { $in: [studentUid] }, type },
      { last_message_at: -1 },
      { limit, offset, state: false, watch: false },
    );
    channels.push(...page);
    if (page.length < limit) break;
  }
  return channels;
};

const getStudentAssignments = async (
  client: StreamChat,
  studentUid: string,
  studentUsername: string,
): Promise<EmailAssignment[]> => {
  const [individual, group] = await Promise.all([
    queryStudentChannels(client, studentUid, "messaging"),
    queryStudentChannels(client, studentUid, "livestream"),
  ]);

  return [...individual, ...group]
    .filter(
      (channel) =>
        Boolean(channel.data?.assignment_title && channel.data?.due_date),
    )
    .map((channel) => ({
      className: channel.data?.class_name ?? "Assignment",
      completedSteps: channel.data?.completed_work_days ?? 0,
      dueDate: channel.data?.due_date ?? "",
      lastProgressAt: channel.data?.last_progress_at ?? "",
      remainingMinutes: Math.max(
        0,
        channel.data?.estimated_total_minutes ?? 0,
      ),
      remainingWorkSummary: channel.data?.remaining_work_summary ?? "",
      studentUsername,
      targetSteps: channel.data?.recommended_work_days ?? 0,
      title: channel.data?.assignment_title ?? "Assignment",
    }));
};

const isCompleted = (assignment: EmailAssignment) =>
  assignment.targetSteps > 0 &&
  assignment.completedSteps >= assignment.targetSteps;

const selectAssignments = (
  assignments: EmailAssignment[],
  mode: EmailMode,
  thresholdHours: number,
  today: string,
) => {
  if (mode === "daily_summary") return assignments;
  const tomorrow = addDays(today, 1);
  return assignments.filter((assignment) => {
    if (isCompleted(assignment)) return false;
    if (assignment.dueDate <= today) return true;
    return mode === "due_or_urgent" &&
      assignment.dueDate === tomorrow &&
      assignment.remainingMinutes > thresholdHours * 60;
  });
};

const emailContent = (
  assignments: EmailAssignment[],
  allAssignments: EmailAssignment[],
  mode: EmailMode,
  today: string,
  timeZone: string,
  dashboardUrl: string,
) => {
  const grouped = new Map<string, EmailAssignment[]>();
  assignments.forEach((assignment) => {
    const current = grouped.get(assignment.studentUsername) ?? [];
    current.push(assignment);
    grouped.set(assignment.studentUsername, current);
  });

  const completedToday = allAssignments.filter(
    (assignment) =>
      assignment.lastProgressAt &&
      dateKey(new Date(assignment.lastProgressAt), timeZone) === today,
  ).length;
  const heading = mode === "daily_summary"
    ? "Your daily SnapSchool family summary"
    : "Assignments that need attention";
  const sections = [...grouped.entries()].map(([student, items]) => {
    const cards = items
      .sort((first, second) => first.dueDate.localeCompare(second.dueDate))
      .map((assignment) => {
        const percent = progressPercent(assignment);
        const remaining = formatMinutes(assignment.remainingMinutes);
        const updatedToday = Boolean(
          assignment.lastProgressAt &&
          dateKey(new Date(assignment.lastProgressAt), timeZone) === today,
        );
        return `<div style="border:1px solid #d4d4d8;border-radius:12px;padding:14px;margin:10px 0;background:#fff">
          <div style="font-size:12px;color:#52525b">${escapeHtml(assignment.className)} · ${escapeHtml(dueLabel(assignment.dueDate, today))}</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px">${escapeHtml(assignment.title)}</div>
          <div style="font-size:14px;margin-top:8px">${percent}% complete · ${escapeHtml(remaining)} estimated remaining</div>
          ${updatedToday ? `<div style="font-size:12px;color:#047857;margin-top:6px;font-weight:700">Progress recorded today</div>` : ""}
          ${assignment.remainingWorkSummary ? `<div style="font-size:13px;color:#52525b;margin-top:6px">Next: ${escapeHtml(assignment.remainingWorkSummary)}</div>` : ""}
        </div>`;
      })
      .join("");
    return `<h2 style="font-size:18px;margin:24px 0 8px;text-transform:capitalize">${escapeHtml(student)}</h2>${cards}`;
  }).join("");

  const empty = assignments.length === 0
    ? `<div style="border-radius:12px;background:#ecfdf5;padding:16px;color:#065f46">No active assignments need attention today.</div>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#18181b">
    <div style="background:#fffc00;border-radius:16px;padding:20px"><strong style="font-size:22px">SnapSchool</strong><div style="margin-top:4px">${escapeHtml(heading)}</div></div>
    <p style="font-size:14px;line-height:1.6">${mode === "daily_summary" ? `${completedToday} assignment update${completedToday === 1 ? " was" : "s were"} recorded today. Here is the current workload and deadline picture.` : "These assignments are due, overdue, or beyond your selected urgent-work threshold."}</p>
    ${sections}${empty}
    <p style="margin-top:24px"><a href="${escapeHtml(dashboardUrl)}" style="background:#18181b;color:#fff;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:700">Open family dashboard</a></p>
    <p style="font-size:11px;color:#71717a;margin-top:28px">Change or turn off these emails in SnapSchool Profile Settings.</p>
  </div>`;
  const textLines = assignments.map(
    (assignment) =>
      `${assignment.studentUsername}: ${assignment.title} — ${dueLabel(assignment.dueDate, today)}, ${progressPercent(assignment)}% complete, ${formatMinutes(assignment.remainingMinutes)} remaining`,
  );
  return {
    html,
    subject:
      mode === "daily_summary"
        ? "Your daily SnapSchool family summary"
        : `${assignments.length} SnapSchool assignment update${assignments.length === 1 ? "" : "s"}`,
    text: `${heading}\n\n${textLines.join("\n") || "No active assignments need attention today."}\n\nOpen SnapSchool: ${dashboardUrl}`,
  };
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.SNAPSCHOOL_EMAIL_FROM;
    const streamApiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
    const streamSecret = process.env.STREAM_SECRET_KEY;
    if (!resendApiKey || !emailFrom) {
      throw new Error("Resend email configuration is missing");
    }
    if (!streamApiKey || !streamSecret) {
      throw new Error("Stream server configuration is missing");
    }

    const db = getAdminDb();
    const auth = getAdminAuth();
    const streamClient = StreamChat.getInstance(streamApiKey, streamSecret);
    const preferencesSnapshot = await db
      .collection("parentEmailPreferences")
      .where("enabled", "==", true)
      .get();
    const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/chat`
        : "https://snap-school-kappa.vercel.app/chat");

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const preferenceDocument of preferencesSnapshot.docs) {
      const preference = preferenceDocument.data() as ParentPreference;
      const parentUid = preference.parentUid || preferenceDocument.id;
      const mode = preference.mode ?? "due_only";
      const timeZone = preference.timeZone || "America/New_York";
      const thresholdHours = Math.min(
        24,
        Math.max(0.5, preference.urgentThresholdHours ?? 1.5),
      );
      try {
        const today = dateKey(new Date(), timeZone);
        if (preference.lastSentDate === today) {
          skipped += 1;
          continue;
        }
        const parentAccount = await auth.getUser(parentUid);
        if (!parentAccount.email) throw new Error("Parent account has no email address");
        const connections = await db
          .collection("familyConnections")
          .where("parentUid", "==", parentUid)
          .get();
        const approved = connections.docs
          .map((document) => document.data())
          .filter((connection) => connection.status === "approved");
        const allAssignments = (await Promise.all(
          approved.map((connection) =>
            getStudentAssignments(
              streamClient,
              connection.studentUid,
              connection.studentUsername,
            ),
          ),
        )).flat();
        const summaryAssignments = allAssignments.filter(
          (assignment) =>
            !isCompleted(assignment) ||
            (assignment.lastProgressAt &&
              dateKey(new Date(assignment.lastProgressAt), timeZone) === today),
        );
        const selected = selectAssignments(
          summaryAssignments,
          mode,
          thresholdHours,
          today,
        );
        if (mode !== "daily_summary" && selected.length === 0) {
          skipped += 1;
          continue;
        }

        const content = emailContent(
          selected,
          allAssignments,
          mode,
          today,
          timeZone,
          dashboardUrl,
        );
        const emailResponse = await fetch("https://api.resend.com/emails", {
          body: JSON.stringify({
            from: emailFrom,
            html: content.html,
            subject: content.subject,
            text: content.text,
            to: [parentAccount.email],
          }),
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `parent-progress-${parentUid}-${today}-${mode}`,
            "User-Agent": "SnapSchool/1.0",
          },
          method: "POST",
        });
        if (!emailResponse.ok) {
          const body = await emailResponse.text();
          throw new Error(`Email provider rejected the message: ${body.slice(0, 240)}`);
        }
        await preferenceDocument.ref.update({
          lastSentAt: new Date().toISOString(),
          lastSentDate: today,
        });
        sent += 1;
      } catch (error) {
        errors.push(
          `${parentUid}: ${error instanceof Error ? error.message : "Unable to send"}`,
        );
      }
    }

    return Response.json({ errors: errors.slice(0, 10), sent, skipped });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to send parent progress emails",
      },
      { status: 500 },
    );
  }
}
