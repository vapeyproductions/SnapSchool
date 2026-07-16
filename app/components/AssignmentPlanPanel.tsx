"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListChecks,
  MessageCircleQuestion,
} from "lucide-react";
import { useContext, useMemo } from "react";
import { useChannelStateContext } from "stream-chat-react";

import type { AssignmentTask } from "@/lib/assignment-analysis";
import AuthContext from "./AuthContext";

export function AssignmentPlanPanel({
  completedDays,
  onOpenMessages,
}: {
  completedDays?: number;
  onOpenMessages?: () => void;
}) {
  const { role } = useContext(AuthContext);
  const { channel } = useChannelStateContext("AssignmentPlanPanel");
  const tasks = useMemo(() => {
    const plan = channel.data?.daily_plan;
    if (typeof plan !== "string") return [];

    try {
      const parsed = JSON.parse(plan) as AssignmentTask[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [channel.data?.daily_plan]);
  const summary = channel.data?.assignment_summary;
  const dueDate = channel.data?.due_date;
  const estimatedMinutes = channel.data?.estimated_total_minutes;
  const targetDays = channel.data?.recommended_work_days;
  const isAssessment = ["exam", "quiz", "test"].includes(
    channel.data?.assignment_kind ?? "",
  );
  const effectiveCompletedDays = completedDays ?? channel.data?.completed_work_days;
  const nextTask = effectiveCompletedDays === undefined
    ? undefined
    : tasks[Math.min(effectiveCompletedDays, Math.max(tasks.length - 1, 0))];
  const assignmentComplete =
    effectiveCompletedDays !== undefined &&
    typeof targetDays === "number" &&
    effectiveCompletedDays >= targetDays;
  const overdue =
    typeof dueDate === "string" &&
    dueDate < new Date().toISOString().slice(0, 10) &&
    !assignmentComplete;

  if (!summary && tasks.length === 0) return null;

  return (
    <section className="border-b border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-indigo-950">
        <strong className="flex items-center gap-1.5"><ListChecks className="size-4" /> {isAssessment ? "Study plan" : "Assignment plan"}</strong>
        {dueDate && <span className="flex items-center gap-1 text-slate-600"><CalendarDays className="size-3.5" /> {isAssessment ? "Test" : "Due"} {new Date(`${dueDate}T00:00:00`).toLocaleDateString()}</span>}
        {typeof estimatedMinutes === "number" && <span className="flex items-center gap-1 text-slate-600"><Clock3 className="size-3.5" /> About {estimatedMinutes} minutes {channel.data?.last_progress_at ? "remaining" : "total"}</span>}
        {typeof effectiveCompletedDays === "number" && typeof targetDays === "number" && <span className="text-slate-600">Progress {effectiveCompletedDays} / {targetDays} days</span>}
      </div>
      {summary && <p className="mt-2 leading-5 text-slate-700">{summary}</p>}
      {overdue && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-950">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-red-600" /> Deadline missed — recovery plan
          </p>
          {role === "student" ? (
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-5 text-red-900">
              <li>Message your teacher today, explain what is unfinished, and ask what to prioritize.</li>
              <li>Upload evidence of everything you have completed so the plan can be recalibrated.</li>
              <li>Complete the next remaining task as soon as possible and submit another progress update.</li>
            </ol>
          ) : (
            <p className="mt-2 text-xs leading-5 text-red-900">
              Contact the student, review their latest evidence, and agree on an immediate completion plan or adjusted deadline.
            </p>
          )}
          {onOpenMessages && (
            <button
              className="mt-3 flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
              onClick={onOpenMessages}
              type="button"
            >
              <MessageCircleQuestion className="size-4" />
              {role === "student" ? "Message teacher now" : "Open student messages"}
            </button>
          )}
        </div>
      )}
      {nextTask && effectiveCompletedDays !== undefined && effectiveCompletedDays < tasks.length && (
        <div className="mt-2 rounded-lg bg-white px-3 py-2 text-slate-700">
          <strong>{isAssessment ? "Next review" : "Next"}: Day {nextTask.dayNumber} · {nextTask.title}</strong>
          <span className="ml-2 text-slate-500">{nextTask.estimatedMinutes} min</span>
          <p className="mt-1">{nextTask.description}</p>
        </div>
      )}
      {assignmentComplete && (
        <p className="mt-2 flex items-center gap-1.5 font-medium text-emerald-700"><CheckCircle2 className="size-4" /> {isAssessment ? "Study plan completed" : "Assignment streak completed"}</p>
      )}
      {tasks.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-medium text-indigo-700">View all {tasks.length} daily {isAssessment ? "study sessions" : "tasks"}</summary>
          <ol className="mt-2 space-y-2">
            {tasks.map((task) => (
              <li className="rounded-lg bg-white px-3 py-2" key={task.dayNumber}>
                <strong>Day {task.dayNumber}: {task.title}</strong>
                <span className="ml-2 text-slate-500">{task.estimatedMinutes} min</span>
                <p className="mt-1 text-slate-600">{task.description}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
