"use client";

import type { User } from "firebase/auth";
import {
  Bell,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getDashboardNotificationAssignments,
  type NotificationAssignmentSummary,
} from "@/actions/profile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AccountRole } from "@/lib/server";

type Reminder = NotificationAssignmentSummary & {
  message: string;
  timing: "due" | "tomorrow";
};

const localDateString = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

const tomorrowString = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateString(tomorrow);
};

const isAssessmentOrEssay = (kind: string) =>
  ["essay", "exam", "quiz", "test"].includes(kind);

const makeReminder = (
  assignment: NotificationAssignmentSummary,
  today: string,
  tomorrow: string,
): Reminder | null => {
  const complete =
    assignment.targetSteps > 0 &&
    assignment.completedSteps >= assignment.targetSteps;
  if (complete) return null;

  if (assignment.dueDate === today) {
    const message = ["exam", "quiz", "test"].includes(assignment.assignmentKind)
      ? "This assessment is today. Review the final plan and be ready."
      : "This assignment is due today. Finish and submit it before the deadline.";
    return { ...assignment, message, timing: "due" };
  }
  if (
    assignment.dueDate === tomorrow &&
    isAssessmentOrEssay(assignment.assignmentKind)
  ) {
    const message = assignment.assignmentKind === "essay"
      ? "This essay is due tomorrow. Complete your final review and submission check."
      : "This assessment is tomorrow. Complete the final review in your study plan.";
    return { ...assignment, message, timing: "tomorrow" };
  }
  return null;
};

export default function NotificationCenter({
  role,
  user,
}: {
  role: AccountRole;
  user: User;
}) {
  const [assignments, setAssignments] = useState<NotificationAssignmentSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const autoOpenChecked = useRef(false);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const result = await getDashboardNotificationAssignments(await user.getIdToken());
      if (!result.success) throw new Error(result.error ?? "Unable to load reminders");
      setAssignments(result.assignments);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load reminders");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadNotifications(); }, 0);
    const refresh = () => { void loadNotifications(); };
    window.addEventListener("snapschool:assignment-created", refresh);
    window.addEventListener("snapschool:assignment-deleted", refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("snapschool:assignment-created", refresh);
      window.removeEventListener("snapschool:assignment-deleted", refresh);
    };
  }, [loadNotifications]);

  const today = localDateString();
  const reminders = useMemo(
    () => assignments
      .map((assignment) => makeReminder(assignment, today, tomorrowString()))
      .filter((reminder): reminder is Reminder => Boolean(reminder))
      .sort((first, second) => {
        if (first.timing !== second.timing) return first.timing === "due" ? -1 : 1;
        return `${first.studentDisplayName}:${first.title}`.localeCompare(
          `${second.studentDisplayName}:${second.title}`,
        );
      }),
    [assignments, today],
  );

  useEffect(() => {
    if (isLoading || autoOpenChecked.current) return;
    autoOpenChecked.current = true;
    if (reminders.length === 0) return;
    const sessionKey = `snapschool:notifications-shown:${user.uid}:${today}`;
    if (window.sessionStorage.getItem(sessionKey) === "1") return;
    window.sessionStorage.setItem(sessionKey, "1");
    const autoOpen = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(autoOpen);
  }, [isLoading, reminders.length, today, user.uid]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            aria-label={`${reminders.length} assignment notification${reminders.length === 1 ? "" : "s"}`}
            className="relative flex size-10 items-center justify-center rounded-full border-2 border-black bg-white transition hover:-translate-y-0.5"
            type="button"
          />
        }
      >
        <Bell className="size-5" />
        {reminders.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full border-2 border-black bg-[#ff5b35] px-1 text-[10px] font-black leading-4 text-white">
            {reminders.length > 9 ? "9+" : reminders.length}
          </span>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-[2rem] border-2 border-black sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            <BellRing className="size-5 text-[#f24e2e]" /> Assignment reminders
          </DialogTitle>
          <DialogDescription>
            {role === "parent"
              ? "Due-date reminders for every approved student connected to your account."
              : "Your due-today reminders and final preparation alerts."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="flex items-center justify-center gap-2 rounded-2xl bg-[#f4f0e8] p-8 text-sm font-semibold text-zinc-500">
            <Loader2 className="size-5 animate-spin" /> Loading reminders…
          </p>
        ) : errorMessage ? (
          <div className="space-y-3 rounded-2xl border-2 border-red-600 bg-red-50 p-4 text-sm text-red-700" role="alert">
            <p className="font-bold">{errorMessage}</p>
            <button className="rounded-full border-2 border-red-700 bg-white px-3 py-1.5 text-xs font-black" onClick={() => void loadNotifications()} type="button">Try again</button>
          </div>
        ) : reminders.length === 0 ? (
          <div className="rounded-2xl border-2 border-emerald-700 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto size-8 text-emerald-700" />
            <p className="mt-2 font-black text-emerald-900">You&apos;re all caught up</p>
            <p className="mt-1 text-xs text-emerald-800">No assignments need a due-date reminder today.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {reminders.map((reminder) => (
              <article className={`rounded-2xl border-2 border-black p-4 shadow-[3px_3px_0_#111] ${reminder.timing === "due" ? "bg-[#fffbd5]" : "bg-[#e9e3ff]"}`} key={`${reminder.studentUid}:${reminder.id}:${reminder.timing}`}>
                <div className="flex items-start gap-3">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-black ${reminder.timing === "due" ? "bg-[#ff5b35] text-white" : "bg-white text-black"}`}>
                    {reminder.timing === "due" ? <BellRing className="size-4" /> : <CalendarClock className="size-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">
                      {role === "parent" && <span>{reminder.studentDisplayName} · </span>}
                      {reminder.timing === "due" ? "Due today" : "Due tomorrow"}
                    </p>
                    <h3 className="mt-1 font-black leading-5">{reminder.title}</h3>
                    <p className="mt-1 text-xs font-medium leading-5 text-zinc-700">{reminder.message}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
