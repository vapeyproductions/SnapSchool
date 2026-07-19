export type AssignmentTask = {
  dayNumber: number;
  description: string;
  estimatedMinutes: number;
  title: string;
};

type TaskSegment = {
  description: string;
  minutes: number;
  sourceIndex: number;
  title: string;
};

/**
 * Rebuilds uneven AI tasks into sequential, nearly equal work sessions. This
 * keeps one mission per active day and preserves the full estimated workload
 * instead of truncating tasks when fewer pre-deadline days remain.
 */
export const balanceAssignmentTasks = (
  tasks: AssignmentTask[],
  maximumDays: number,
  targetMinutesPerDay = 30,
): AssignmentTask[] => {
  if (tasks.length === 0) return [];
  const safeMaximumDays = Math.max(1, Math.min(60, Math.floor(maximumDays)));
  const totalMinutes = tasks.reduce(
    (total, task) => total + Math.max(1, Math.round(task.estimatedMinutes)),
    0,
  );
  const desiredDays = Math.min(
    safeMaximumDays,
    Math.max(
      1,
      Math.min(tasks.length, safeMaximumDays),
      Math.ceil(totalMinutes / Math.max(20, targetMinutesPerDay)),
    ),
  );
  const taskMinutes = tasks.map((task) => Math.max(1, Math.round(task.estimatedMinutes)));
  const largestTask = Math.max(...taskMinutes);
  const smallestTask = Math.min(...taskMinutes);
  const idealMinutes = Math.ceil(totalMinutes / desiredDays);
  const alreadyBalanced =
    desiredDays === tasks.length &&
    largestTask <= Math.max(60, idealMinutes + 15) &&
    largestTask - smallestTask <= 30;

  if (alreadyBalanced) {
    return tasks.map((task, index) => ({ ...task, dayNumber: index + 1 }));
  }

  const targets = Array.from({ length: desiredDays }, (_, index) =>
    Math.floor(totalMinutes / desiredDays) +
    (index < totalMinutes % desiredDays ? 1 : 0),
  );
  const sourceRemaining = [...taskMinutes];
  const sourcePartNumbers = Array.from({ length: tasks.length }, () => 0);
  let sourceIndex = 0;

  return targets.map((targetMinutes, dayIndex) => {
    const segments: TaskSegment[] = [];
    let minutesNeeded = targetMinutes;

    while (minutesNeeded > 0 && sourceIndex < tasks.length) {
      const minutes = Math.min(minutesNeeded, sourceRemaining[sourceIndex]);
      sourcePartNumbers[sourceIndex] += 1;
      segments.push({
        description: tasks[sourceIndex].description,
        minutes,
        sourceIndex,
        title: tasks[sourceIndex].title,
      });
      sourceRemaining[sourceIndex] -= minutes;
      minutesNeeded -= minutes;
      if (sourceRemaining[sourceIndex] === 0) sourceIndex += 1;
    }

    const firstSegment = segments[0];
    const uniqueTitles = [...new Set(segments.map((segment) => segment.title))];
    const splitSingleTask =
      segments.length === 1 &&
      taskMinutes[firstSegment.sourceIndex] !== firstSegment.minutes;
    const title = uniqueTitles.length === 1
      ? splitSingleTask
        ? `${uniqueTitles[0]} · Part ${sourcePartNumbers[firstSegment.sourceIndex]}`
        : uniqueTitles[0]
      : `${uniqueTitles[0]} + ${uniqueTitles[uniqueTitles.length - 1]}`;
    const description = segments
      .map((segment) =>
        segment.minutes === taskMinutes[segment.sourceIndex]
          ? segment.description
          : `${segment.minutes} min: ${segment.description}`,
      )
      .join(" Then, ")
      .slice(0, 160);

    return {
      dayNumber: dayIndex + 1,
      description,
      estimatedMinutes: targetMinutes,
      title: title.slice(0, 70),
    };
  });
};

export type AssignmentKind =
  | "essay"
  | "exam"
  | "homework"
  | "other"
  | "project"
  | "quiz"
  | "reading"
  | "test";

export type AssignmentAnalysis = {
  assignmentKind: AssignmentKind;
  assignmentSummary: string;
  dailyTasks: AssignmentTask[];
  detectedDueDate: string | null;
  dueDateConfidence: "high" | "medium" | "low" | "not_found";
  estimatedTotalMinutes: number;
  inputValid: boolean;
  recommendedWorkDays: number;
  suggestedTitle: string;
  warnings: string[];
  workloadRationale: string;
};

export type AssignmentPlan = Pick<
  AssignmentAnalysis,
  | "assignmentSummary"
  | "assignmentKind"
  | "dailyTasks"
  | "estimatedTotalMinutes"
  | "recommendedWorkDays"
> & {
  dueDate: string;
};

const isIntegerBetween = (value: unknown, minimum: number, maximum: number) =>
  Number.isInteger(value) &&
  typeof value === "number" &&
  value >= minimum &&
  value <= maximum;

export const isISODate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

export const parseAssignmentAnalysis = (
  value: unknown,
): AssignmentAnalysis => {
  if (!value || typeof value !== "object") {
    throw new Error("The AI returned an invalid assignment plan");
  }

  const candidate = value as Partial<AssignmentAnalysis>;
  const confidenceValues = ["high", "medium", "low", "not_found"];
  const assignmentKindValues = [
    "essay",
    "exam",
    "homework",
    "other",
    "project",
    "quiz",
    "reading",
    "test",
  ];

  if (
    typeof candidate.inputValid !== "boolean" ||
    !assignmentKindValues.includes(candidate.assignmentKind ?? "") ||
    typeof candidate.suggestedTitle !== "string" ||
    typeof candidate.assignmentSummary !== "string" ||
    (candidate.detectedDueDate !== null &&
      !isISODate(candidate.detectedDueDate)) ||
    !confidenceValues.includes(candidate.dueDateConfidence ?? "") ||
    !isIntegerBetween(candidate.estimatedTotalMinutes, 1, 100000) ||
    !isIntegerBetween(candidate.recommendedWorkDays, 1, 60) ||
    typeof candidate.workloadRationale !== "string" ||
    !Array.isArray(candidate.dailyTasks) ||
    !Array.isArray(candidate.warnings)
  ) {
    throw new Error("The AI returned an incomplete assignment plan");
  }

  const dailyTasks = candidate.dailyTasks.map((task) => {
    if (
      !task ||
      typeof task !== "object" ||
      !isIntegerBetween(task.dayNumber, 1, 60) ||
      typeof task.title !== "string" ||
      typeof task.description !== "string" ||
      !isIntegerBetween(task.estimatedMinutes, 1, 1440)
    ) {
      throw new Error("The AI returned an invalid daily task");
    }

    return task;
  });

  if (dailyTasks.length !== candidate.recommendedWorkDays) {
    throw new Error("The AI plan does not match its recommended work days");
  }

  if (!candidate.warnings.every((warning) => typeof warning === "string")) {
    throw new Error("The AI returned invalid assignment warnings");
  }

  return {
    assignmentKind: candidate.assignmentKind as AssignmentKind,
    assignmentSummary: candidate.assignmentSummary.trim(),
    dailyTasks,
    detectedDueDate: candidate.detectedDueDate,
    dueDateConfidence: candidate.dueDateConfidence as AssignmentAnalysis["dueDateConfidence"],
    estimatedTotalMinutes: candidate.estimatedTotalMinutes as number,
    inputValid: candidate.inputValid,
    recommendedWorkDays: candidate.recommendedWorkDays as number,
    suggestedTitle: candidate.suggestedTitle.trim(),
    warnings: candidate.warnings,
    workloadRationale: candidate.workloadRationale.trim(),
  };
};
