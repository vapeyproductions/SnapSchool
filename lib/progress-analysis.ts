import type { AssignmentTask } from "./assignment-analysis";

export type ProgressConfidence = "high" | "medium" | "low";
export type DueDateRisk = "complete" | "on_track" | "at_risk" | "overdue";

export type ProgressAnalysis = {
  completedWork: string[];
  confidence: ProgressConfidence;
  dueDateRisk: DueDateRisk;
  estimatedRemainingMinutes: number;
  feedback: string;
  progressSufficient: boolean;
  progressSummary: string;
  recommendedRemainingWorkDays: number;
  remainingWorkSummary: string;
  revisedDailyTasks: AssignmentTask[];
  warnings: string[];
};

const isIntegerBetween = (value: unknown, minimum: number, maximum: number) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= maximum;

export const parseProgressAnalysis = (value: unknown): ProgressAnalysis => {
  if (!value || typeof value !== "object") {
    throw new Error("The AI returned an invalid progress review");
  }

  const candidate = value as Partial<ProgressAnalysis>;
  const confidenceValues = ["high", "medium", "low"];
  const riskValues = ["complete", "on_track", "at_risk", "overdue"];

  if (
    typeof candidate.progressSufficient !== "boolean" ||
    !confidenceValues.includes(candidate.confidence ?? "") ||
    !riskValues.includes(candidate.dueDateRisk ?? "") ||
    typeof candidate.progressSummary !== "string" ||
    typeof candidate.remainingWorkSummary !== "string" ||
    typeof candidate.feedback !== "string" ||
    !isIntegerBetween(candidate.estimatedRemainingMinutes, 0, 100000) ||
    !isIntegerBetween(candidate.recommendedRemainingWorkDays, 0, 60) ||
    !Array.isArray(candidate.completedWork) ||
    !Array.isArray(candidate.revisedDailyTasks) ||
    !Array.isArray(candidate.warnings) ||
    !candidate.completedWork.every((item) => typeof item === "string") ||
    !candidate.warnings.every((item) => typeof item === "string")
  ) {
    throw new Error("The AI returned an incomplete progress review");
  }

  const revisedDailyTasks = candidate.revisedDailyTasks.map((task) => {
    if (
      !task ||
      typeof task !== "object" ||
      !isIntegerBetween(task.dayNumber, 1, 60) ||
      typeof task.title !== "string" ||
      typeof task.description !== "string" ||
      !isIntegerBetween(task.estimatedMinutes, 1, 1440)
    ) {
      throw new Error("The AI returned an invalid revised task");
    }

    return task;
  });

  if (revisedDailyTasks.length !== candidate.recommendedRemainingWorkDays) {
    throw new Error("The revised plan does not match its remaining work days");
  }

  return {
    completedWork: candidate.completedWork,
    confidence: candidate.confidence as ProgressConfidence,
    dueDateRisk: candidate.dueDateRisk as DueDateRisk,
    estimatedRemainingMinutes: candidate.estimatedRemainingMinutes as number,
    feedback: candidate.feedback.trim(),
    progressSufficient: candidate.progressSufficient,
    progressSummary: candidate.progressSummary.trim(),
    recommendedRemainingWorkDays:
      candidate.recommendedRemainingWorkDays as number,
    remainingWorkSummary: candidate.remainingWorkSummary.trim(),
    revisedDailyTasks,
    warnings: candidate.warnings,
  };
};
