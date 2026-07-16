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
  daysUntilDue: number | null;
  dueLabel: string;
  minutesPerAvailableDay: number;
  remainingMinutes: number;
  score: number;
  streakStatus: "active" | "missed" | "not-started";
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
  const key = classId || className || "independent-assignment";
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

  let score = minutesPerAvailableDay;
  if (data.late_amendment && !completed) score += 2_000_000;
  if (daysUntilDue !== null) {
    if (daysUntilDue < 0) score += 1_000_000 + Math.abs(daysUntilDue) * 10_000;
    else if (daysUntilDue === 0) score += 500_000;
    else score += 10_000 / (daysUntilDue + 1);
  }
  if (completed) score = -1;

  let urgency: AssignmentPriority["urgency"] = "normal";
  if (completed) urgency = "complete";
  else if (data.late_amendment) urgency = "critical";
  else if (daysUntilDue !== null && daysUntilDue <= 0) urgency = "critical";
  else if (
    (daysUntilDue !== null && daysUntilDue <= 1) ||
    minutesPerAvailableDay >= 60
  ) urgency = "critical";
  else if (
    (daysUntilDue !== null && daysUntilDue <= 3) ||
    minutesPerAvailableDay >= 30
  ) urgency = "high";

  const lastProgressTime = data.last_progress_at
    ? new Date(data.last_progress_at).getTime()
    : Number.NaN;
  const daysSinceProgress = Number.isNaN(lastProgressTime)
    ? null
    : Math.floor((today - startOfUTCDay(new Date(lastProgressTime))) / 86400000);
  const streakStatus: AssignmentPriority["streakStatus"] = completedDays === 0
    ? "not-started"
    : daysSinceProgress !== null && daysSinceProgress > 1
      ? "missed"
      : "active";

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
    daysUntilDue,
    dueLabel,
    minutesPerAvailableDay,
    remainingMinutes,
    score,
    streakStatus,
    urgency,
  };
};
