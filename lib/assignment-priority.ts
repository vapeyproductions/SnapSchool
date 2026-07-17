type AssignmentChannelData = {
  amended_due_date?: string;
  class_id?: string;
  class_name?: string;
  completed_work_days?: number;
  due_date?: string;
  estimated_total_minutes?: number;
  last_progress_at?: string;
  late_amendment?: boolean;
  original_due_date?: string;
  recommended_work_days?: number;
};

export type AssignmentPriority = {
  classLabel: string;
  color: {
    background: string;
    border: string;
    text: string;
  };
  completed: boolean;
  completedDays: number;
  completionPercent: number;
  daysUntilDue: number | null;
  dueLabel: string;
  minutesPerAvailableDay: number;
  paceStatus: "ahead" | "behind" | "complete" | "not-started" | "on-track";
  progressMadeToday: boolean;
  remainingMinutes: number;
  score: number;
  streakStatus: "active" | "missed" | "not-started";
  targetDays: number;
  urgency: "complete" | "critical" | "high" | "normal";
};

const startOfUTCDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

const parseDateOnly = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = new Date(`${value}T00:00:00Z`).getTime();
  return Number.isNaN(time) ? null : time;
};

const stableHue = (value: string) => {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash % 360;
};

export const getClassColor = (classId?: string, className?: string) => {
  // Class names are shared across school and personal assignments, while a
  // parent-created assignment may not have the school's internal class ID.
  const key = className?.trim().toLowerCase() || classId || "independent-assignment";
  const hue = stableHue(key);

  return {
    background: `hsl(${hue} 80% 97%)`,
    border: `hsl(${hue} 65% 48%)`,
    text: `hsl(${hue} 70% 28%)`,
  };
};

export const getAssignmentPriority = (
  data: AssignmentChannelData,
  now = new Date(),
): AssignmentPriority => {
  const today = startOfUTCDay(now);
  const dueTime = parseDateOnly(data.due_date);
  const daysUntilDue = dueTime === null
    ? null
    : Math.floor((dueTime - today) / 86400000);
  const remainingMinutes =
    typeof data.estimated_total_minutes === "number"
      ? Math.max(0, data.estimated_total_minutes)
      : 0;
  const completedDays = data.completed_work_days ?? 0;
  const targetDays = data.recommended_work_days ?? 0;
  const completed = targetDays > 0 && completedDays >= targetDays;
  const availableDays = daysUntilDue === null ? 14 : Math.max(1, daysUntilDue + 1);
  const minutesPerAvailableDay = remainingMinutes / availableDays;
  const remainingPlanDays = Math.max(0, targetDays - completedDays);
  const completionPercent = targetDays > 0
    ? Math.min(100, Math.round((completedDays / targetDays) * 100))
    : 0;

  const lastProgressTime = data.last_progress_at
    ? new Date(data.last_progress_at).getTime()
    : Number.NaN;
  const daysSinceProgress = Number.isNaN(lastProgressTime)
    ? null
    : Math.floor((today - startOfUTCDay(new Date(lastProgressTime))) / 86400000);
  const progressMadeToday = daysSinceProgress === 0;
  const streakStatus: AssignmentPriority["streakStatus"] = completedDays === 0
    ? "not-started"
    : daysSinceProgress !== null && daysSinceProgress > 1
      ? "missed"
      : "active";
  const onSchedule =
    daysUntilDue === null || remainingPlanDays <= availableDays;
  const paceStatus: AssignmentPriority["paceStatus"] = completed
    ? "complete"
    : completedDays === 0
      ? "not-started"
      : !onSchedule || streakStatus === "missed"
        ? "behind"
        : remainingPlanDays < availableDays
          ? "ahead"
          : "on-track";

  let score = minutesPerAvailableDay;
  if (data.late_amendment && !completed) score += 2_000_000;
  if (daysUntilDue !== null) {
    if (daysUntilDue < 0) score += 1_000_000 + Math.abs(daysUntilDue) * 10_000;
    else if (daysUntilDue === 0) score += 500_000;
    else score += 10_000 / (daysUntilDue + 1);
  }
  if (paceStatus === "behind") score += 100_000;
  const canDeprioritize =
    !data.late_amendment &&
    (daysUntilDue === null || daysUntilDue > 0);
  if (progressMadeToday && onSchedule && canDeprioritize) score *= 0.08;
  else if (streakStatus === "active" && onSchedule && canDeprioritize) {
    score *= 0.35;
  }
  if (completed) score = -1;

  let urgency: AssignmentPriority["urgency"] = "normal";
  if (completed) urgency = "complete";
  else if (data.late_amendment) urgency = "critical";
  else if (daysUntilDue !== null && daysUntilDue <= 0) urgency = "critical";
  else if (progressMadeToday && onSchedule) urgency = "normal";
  else if (streakStatus === "active" && onSchedule) urgency = "normal";
  else if (paceStatus === "behind" && (daysUntilDue ?? 14) <= 1) {
    urgency = "critical";
  } else if (paceStatus === "behind") urgency = "high";
  else if (
    (daysUntilDue !== null && daysUntilDue <= 1) ||
    minutesPerAvailableDay >= 60
  ) urgency = "critical";
  else if (
    (daysUntilDue !== null && daysUntilDue <= 3) ||
    minutesPerAvailableDay >= 30
  ) urgency = "high";

  const baseDueLabel = daysUntilDue === null
    ? "No due date"
    : daysUntilDue < 0
      ? `${Math.abs(daysUntilDue)}d overdue`
      : daysUntilDue === 0
        ? "Due today"
        : daysUntilDue === 1
          ? "Due tomorrow"
          : `Due in ${daysUntilDue}d`;
  const dueLabel = data.late_amendment
    ? `Late amendment · ${baseDueLabel}`
    : baseDueLabel;

  return {
    classLabel: data.class_name || "Individual",
    color: getClassColor(data.class_id, data.class_name),
    completed,
    completedDays,
    completionPercent,
    daysUntilDue,
    dueLabel,
    minutesPerAvailableDay,
    paceStatus,
    progressMadeToday,
    remainingMinutes,
    score,
    streakStatus,
    targetDays,
    urgency,
  };
};
