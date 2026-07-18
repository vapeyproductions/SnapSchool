import type { AssignmentTask } from "./assignment-analysis";

export type SchedulableAssignment = {
  className: string;
  completedSteps: number;
  dailyPlan: AssignmentTask[];
  dueDate?: string;
  id: string;
  lastProgressAt?: string;
  lateAmendment?: boolean;
};

export type AssignmentSchedules = Record<string, Array<string | null>>;

const DAY_MS = 86_400_000;

export const localDateKey = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

const parseDate = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Builds one coordinated workload calendar for a student. Tasks remain in the
 * AI-recommended order, but their work dates are selected across every active
 * assignment so ordinary days stay near 20–60 minutes. Deadlines, overdue
 * work, and late amendments are allowed to override that comfort range.
 */
export const buildBalancedAssignmentSchedules = (
  assignments: SchedulableAssignment[],
  now = new Date(),
): AssignmentSchedules => {
  const today = startOfDay(now);
  const todayKey = localDateKey(today);
  const dailyMinutes = new Map<string, number>();
  const dailyClasses = new Map<string, Set<string>>();
  const schedules: AssignmentSchedules = {};
  const progressMadeToday = assignments.some((assignment) => {
    if (!assignment.lastProgressAt) return false;
    const progressDate = new Date(assignment.lastProgressAt);
    return !Number.isNaN(progressDate.getTime()) &&
      localDateKey(progressDate) === todayKey;
  });

  const activeAssignments = assignments
    .map((assignment) => {
      const completedSteps = Math.min(
        Math.max(0, assignment.completedSteps),
        assignment.dailyPlan.length,
      );
      const dueDate = parseDate(assignment.dueDate);
      // A future due date is the hand-in day, not an available homework day.
      // Due or overdue work still receives an immediate recovery slot so it
      // never disappears from the student's plan.
      const effectiveDueDate = dueDate && dueDate > today
        ? addDays(dueDate, -1)
        : dueDate
          ? today
          : addDays(today, Math.max(7, assignment.dailyPlan.length));
      const baseAvailableDays = Math.max(
        1,
        Math.round((effectiveDueDate.getTime() - today.getTime()) / DAY_MS) + 1,
      );
      const remainingTasks = assignment.dailyPlan.slice(completedSteps);
      const remainingMinutes = remainingTasks.reduce(
        (total, task) => total + task.estimatedMinutes,
        0,
      );
      const lastProgressTime = assignment.lastProgressAt
        ? new Date(assignment.lastProgressAt).getTime()
        : Number.NaN;
      const daysSinceProgress = Number.isNaN(lastProgressTime)
        ? null
        : Math.floor(
            (today.getTime() - startOfDay(new Date(lastProgressTime)).getTime()) /
              DAY_MS,
          );
      const initiallyUrgent =
        Boolean(assignment.lateAmendment) ||
        Boolean(dueDate && dueDate < today) ||
        remainingTasks.length > baseAvailableDays ||
        remainingMinutes / baseAvailableDays > 60 ||
        (daysSinceProgress !== null &&
          daysSinceProgress > 1 &&
          remainingTasks.length >= Math.max(1, baseAvailableDays - 1));
      const protectRestOfToday =
        progressMadeToday &&
        !initiallyUrgent &&
        baseAvailableDays > 1;
      const scheduleStartOffset = protectRestOfToday
        ? 1
        : 0;
      const availableDays = Math.max(
        1,
        baseAvailableDays - scheduleStartOffset,
      );

      return {
        ...assignment,
        availableDays,
        completedSteps,
        daysSinceProgress,
        dueDate,
        effectiveDueDate,
        remainingMinutes,
        remainingTasks,
        protectRestOfToday,
        scheduleStartOffset,
        urgent: initiallyUrgent,
      };
    })
    .filter((assignment) => assignment.remainingTasks.length > 0)
    .sort((first, second) => {
      if (first.urgent !== second.urgent) return first.urgent ? -1 : 1;
      const dueDifference =
        first.effectiveDueDate.getTime() - second.effectiveDueDate.getTime();
      if (dueDifference !== 0) return dueDifference;
      return second.remainingMinutes - first.remainingMinutes;
    });

  assignments.forEach((assignment) => {
    schedules[assignment.id] = Array.from(
      { length: assignment.dailyPlan.length },
      () => null,
    );
  });

  activeAssignments.forEach((assignment) => {
    const span = assignment.availableDays;
    const finalOffset = assignment.scheduleStartOffset + span - 1;
    const remainingCount = assignment.remainingTasks.length;
    const minimumGap = span >= remainingCount ? 1 : 0;
    let previousOffset = assignment.scheduleStartOffset - minimumGap;

    assignment.remainingTasks.forEach((task, remainingIndex) => {
      const tasksAfter = remainingCount - remainingIndex - 1;
      const earliestOffset = Math.max(
        assignment.scheduleStartOffset,
        previousOffset + minimumGap,
      );
      const latestOffset = Math.max(
        earliestOffset,
        finalOffset - tasksAfter * minimumGap,
      );
      const evenOffset = remainingCount === 1
        ? assignment.scheduleStartOffset + Math.floor((span - 1) / 2)
        : assignment.scheduleStartOffset +
          Math.round((remainingIndex * (span - 1)) / (remainingCount - 1));
      const idealOffset = assignment.urgent ? earliestOffset : evenOffset;
      let chosenOffset = earliestOffset;
      let chosenScore = Number.POSITIVE_INFINITY;

      for (let offset = earliestOffset; offset <= latestOffset; offset += 1) {
        const date = localDateKey(addDays(today, offset));
        const existingMinutes = dailyMinutes.get(date) ?? 0;
        const projectedMinutes = existingMinutes + task.estimatedMinutes;
        const sameClass = dailyClasses.get(date)?.has(
          assignment.className.trim().toLowerCase(),
        ) ?? false;
        const aboveComfortRange = Math.max(0, projectedMinutes - 60);
        const belowComfortRange = Math.max(0, 20 - projectedMinutes);
        const score =
          aboveComfortRange * 10_000 +
          belowComfortRange * 18 +
          projectedMinutes +
          Math.abs(offset - idealOffset) * (assignment.urgent ? 80 : 12) +
          (sameClass ? (assignment.urgent ? 40 : 1_200) : 0) +
          (assignment.urgent ? offset * 120 : 0);

        if (score < chosenScore) {
          chosenOffset = offset;
          chosenScore = score;
        }
      }

      const chosenDate = localDateKey(addDays(today, chosenOffset));
      const taskIndex = assignment.completedSteps + remainingIndex;
      schedules[assignment.id][taskIndex] = chosenDate;
      dailyMinutes.set(
        chosenDate,
        (dailyMinutes.get(chosenDate) ?? 0) + task.estimatedMinutes,
      );
      const classes = dailyClasses.get(chosenDate) ?? new Set<string>();
      classes.add(assignment.className.trim().toLowerCase());
      dailyClasses.set(chosenDate, classes);
      previousOffset = chosenOffset;
    });
  });

  // Completing one mission should normally leave the student with a real
  // stopping point for the day. Only pull one next mission from another
  // assignment into today when doing so removes at least 15 minutes of work
  // above the 60-minute comfort ceiling on a future day. Deadline-critical
  // work already bypasses this protection through the urgency rules above.
  if (progressMadeToday) {
    const todayScheduledMinutes = dailyMinutes.get(todayKey) ?? 0;
    const candidates = activeAssignments
      .filter(
        (assignment) =>
          assignment.protectRestOfToday &&
          assignment.daysSinceProgress !== 0 &&
          assignment.remainingTasks.length > 0,
      )
      .map((assignment) => {
        const taskIndex = assignment.completedSteps;
        const scheduledDate = schedules[assignment.id]?.[taskIndex] ?? null;
        const task = assignment.remainingTasks[0];
        const futureMinutes = scheduledDate
          ? dailyMinutes.get(scheduledDate) ?? 0
          : 0;
        const overloadReduction = Math.min(
          task.estimatedMinutes,
          Math.max(0, futureMinutes - 60),
        );
        return {
          assignment,
          futureMinutes,
          overloadReduction,
          scheduledDate,
          task,
          taskIndex,
        };
      })
      .filter(
        (candidate) =>
          Boolean(candidate.scheduledDate) &&
          candidate.scheduledDate !== todayKey &&
          candidate.futureMinutes >= 75 &&
          candidate.overloadReduction >= 15 &&
          todayScheduledMinutes + candidate.task.estimatedMinutes <= 60,
      )
      .sort(
        (first, second) =>
          second.overloadReduction - first.overloadReduction ||
          second.futureMinutes - first.futureMinutes,
      );

    const candidate = candidates[0];
    if (candidate?.scheduledDate) {
      schedules[candidate.assignment.id][candidate.taskIndex] = todayKey;
      dailyMinutes.set(
        candidate.scheduledDate,
        Math.max(
          0,
          (dailyMinutes.get(candidate.scheduledDate) ?? 0) -
            candidate.task.estimatedMinutes,
        ),
      );
      dailyMinutes.set(
        todayKey,
        todayScheduledMinutes + candidate.task.estimatedMinutes,
      );
    }
  }

  // Anything that could not be dated safely is due today, which is preferable
  // to silently hiding work from the student's daily total.
  activeAssignments.forEach((assignment) => {
    assignment.remainingTasks.forEach((_, remainingIndex) => {
      const taskIndex = assignment.completedSteps + remainingIndex;
      schedules[assignment.id][taskIndex] ??= todayKey;
    });
  });

  return schedules;
};
