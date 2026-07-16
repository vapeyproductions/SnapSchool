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
  const isIndependentAssignment = channel.data?.assignment_source === "independent";
  const effectiveCompletedDays = completedDays ?? channel.data?.completed_work_days;
  const currentTaskIndex = Math.min(
    effectiveCompletedDays ?? 0,
    Math.max(tasks.length - 1, 0),
  );
  const nextTask = tasks[currentTaskIndex];
  const futureTasks = tasks.slice(currentTaskIndex + 1);
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
    <section className="m-4 rounded-[1.75rem] border-2 border-black bg-white p-4 text-sm shadow-[4px_4px_0_#111] sm:p-5">
      {nextTask && !assignmentComplete && (
        <div className="rounded-2xl border-2 border-black bg-[#fffc00] p-4 text-black">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em]">Today&apos;s mission</p>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-base">Day {nextTask.dayNumber} · {nextTask.title}</strong>
            <span className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold">
              <Clock3 className="size-3.5" /> {nextTask.estimatedMinutes} min
            </span>
            {dueDate && (
              <span className="flex items-center gap-1 rounded-full bg-black px-2.5 py-1 text-xs font-bold text-white">
                <CalendarDays className="size-3.5" /> {isAssessment ? "Test" : "Due"} {new Date(`${dueDate}T00:00:00`).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="mt-2 font-medium leading-5">{nextTask.description}</p>
        </div>
      )}
      {overdue && (
        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-red-50 p-4 text-red-950">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-red-600" /> Deadline missed — recovery plan
          </p>
          {role === "student" ? (
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-5 text-red-900">
              <li>{isIndependentAssignment ? "Review what remains and choose the most urgent unfinished part." : "Message your teacher today, explain what is unfinished, and ask what to prioritize."}</li>
              <li>Upload evidence of everything you have completed so the plan can be recalibrated.</li>
              <li>Complete the next remaining task as soon as possible and submit another progress update.</li>
            </ol>
          ) : (
            <p className="mt-2 text-xs leading-5 text-red-900">
              Contact the student, review their latest evidence, and agree on an immediate completion plan or adjusted deadline.
            </p>
          )}
          {onOpenMessages && !isIndependentAssignment && (
            <button
              className="mt-3 flex items-center gap-1.5 rounded-full border-2 border-black bg-red-600 px-3 py-2 text-xs font-black text-white shadow-[2px_2px_0_#111] hover:bg-red-700"
              onClick={onOpenMessages}
              type="button"
            >
              <MessageCircleQuestion className="size-4" />
              {role === "student" ? "Message teacher now" : "Open student messages"}
            </button>
          )}
        </div>
      )}
      {assignmentComplete && (
        <p className="flex items-center gap-1.5 rounded-2xl bg-emerald-100 px-4 py-3 font-bold text-emerald-800"><CheckCircle2 className="size-4" /> {isAssessment ? "Study plan completed" : "Assignment streak completed"}</p>
      )}
      {tasks.length > 0 && (
        <details className="mt-4 border-t-2 border-dashed border-zinc-300 pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 py-2 font-black text-black hover:bg-[#f4f0e8]">
            <span className="flex items-center gap-2"><ListChecks className="size-4" /> Open {isAssessment ? "study roadmap" : "assignment roadmap"}</span>
            <span className="text-xs font-bold text-zinc-500">{futureTasks.length} future mission{futureTasks.length === 1 ? "" : "s"} ▾</span>
          </summary>
          <div className="mt-3 rounded-2xl bg-[#f4f0e8] p-3">
            <div className="flex flex-wrap gap-2">
              {typeof estimatedMinutes === "number" && (
                <span className="rounded-full bg-[#c7b7ff] px-2.5 py-1 text-xs font-bold">
                  About {estimatedMinutes} min {channel.data?.last_progress_at ? "remaining" : "total"}
                </span>
              )}
              {typeof effectiveCompletedDays === "number" && typeof targetDays === "number" && (
                <span className="rounded-full bg-[#c9f7d4] px-2.5 py-1 text-xs font-bold">
                  {effectiveCompletedDays} of {targetDays} days complete
                </span>
              )}
            </div>
            {summary && <p className="mt-3 font-medium leading-5 text-zinc-700">{summary}</p>}
          </div>
          {futureTasks.length > 0 ? (
            <ol className="mt-3 space-y-2">
            {futureTasks.map((task) => (
              <li className="rounded-xl border border-zinc-300 bg-[#f4f0e8] px-3 py-2" key={task.dayNumber}>
                <strong>Day {task.dayNumber}: {task.title}</strong>
                <span className="ml-2 text-slate-500">{task.estimatedMinutes} min</span>
                <p className="mt-1 text-slate-600">{task.description}</p>
              </li>
            ))}
            </ol>
          ) : (
            <p className="mt-3 rounded-xl bg-[#f4f0e8] px-3 py-2 text-xs font-medium text-zinc-600">
              This is the final daily mission in the plan.
            </p>
          )}
        </details>
      )}
    </section>
  );
}
