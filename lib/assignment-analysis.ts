export type AssignmentTask = {
  dayNumber: number;
  description: string;
  estimatedMinutes: number;
  title: string;
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
