"use client";

import type { User } from "firebase/auth";
import { CalendarDays, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { getParentDashboard, type ParentChildDashboard } from "@/actions/profile";
import { deletePublishedAssignment } from "@/actions/stream";
import AssignmentCalendar from "./AssignmentCalendar";

const formatDate = (date: string) => date
  ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  : "No due date";

export default function ParentDashboard({
  dashboardView,
  onDashboardViewChange,
  user,
}: {
  dashboardView: "assignments" | "calendar";
  onDashboardViewChange: (view: "assignments" | "calendar") => void;
  user: User;
}) {
  const [children, setChildren] = useState<ParentChildDashboard[]>([]);
  const [selectedChildUid, setSelectedChildUid] = useState("");
  const [calendarChildUid, setCalendarChildUid] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [deletingCid, setDeletingCid] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");

  const loadDashboard = async () => {
    const firebaseIdToken = await user.getIdToken();
    setIsLoading(true);
    setErrorMessage("");
    const result = await getParentDashboard(firebaseIdToken);
    if (result.success) {
      setChildren(result.children);
      setSelectedChildUid((current) => current || result.children[0]?.studentUid || "");
    } else {
      setErrorMessage(result.error ?? "Unable to load family dashboard");
    }
    setIsLoading(false);
  };

  const deletePersonalAssignment = async (cid: string, title: string) => {
    if (!window.confirm(`Delete “${title}”? This removes its plan and submitted progress permanently.`)) return;
    setDeletingCid(cid);
    setErrorMessage("");
    try {
      const result = await deletePublishedAssignment({
        channelCids: [cid],
        firebaseIdToken: await user.getIdToken(),
      });
      if (!result.success) throw new Error(result.error ?? "Unable to delete the assignment");
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete the assignment");
    } finally {
      setDeletingCid("");
    }
  };

  useEffect(() => {
    let active = true;
    user.getIdToken()
      .then((firebaseIdToken) => getParentDashboard(firebaseIdToken))
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setChildren(result.children);
          setSelectedChildUid(result.children[0]?.studentUid || "");
        } else {
          setErrorMessage(result.error ?? "Unable to load family dashboard");
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setErrorMessage("Unable to load family dashboard");
        setIsLoading(false);
      });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    const refreshAfterCreation = () => { void loadDashboard(); };
    window.addEventListener("snapschool:assignment-created", refreshAfterCreation);
    return () => window.removeEventListener("snapschool:assignment-created", refreshAfterCreation);
  });

  if (isLoading) {
    return <div className="flex min-h-[34rem] items-center justify-center gap-2 text-sm font-semibold text-zinc-500"><Loader2 className="size-5 animate-spin" /> Loading family progress…</div>;
  }

  const selectedChild = children.find((child) => child.studentUid === selectedChildUid) ?? children[0];
  const calendarChildren = calendarChildUid === "all"
    ? children
    : children.filter((child) => child.studentUid === calendarChildUid);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-[34rem] bg-[#f4f0e8]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-white p-4">
        <div>
          <p className="flex items-center gap-2 font-black"><ShieldCheck className="size-5 text-[#7b61ff]" /> Family progress dashboard</p>
          <p className="mt-1 text-xs text-zinc-500">See approved students&apos; deadlines and progress. You can add personal work, but only students can submit streak evidence.</p>
        </div>
        <button className="flex items-center gap-2 rounded-full border-2 border-black bg-white px-4 py-2 text-xs font-black" onClick={() => void loadDashboard()} type="button"><RefreshCw className="size-4" /> Refresh</button>
      </div>

      {errorMessage && <p className="m-4 rounded-2xl border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">{errorMessage}</p>}

      {children.length === 0 ? (
        <div className="flex min-h-[28rem] items-center justify-center p-6 text-center">
          <div><ShieldCheck className="mx-auto size-10 text-zinc-400" /><p className="mt-3 font-black">No approved student connections</p><p className="mt-1 max-w-md text-sm text-zinc-500">Open Profile Settings, request access using the student&apos;s username, and have the student approve it from their own settings.</p></div>
        </div>
      ) : (
        <div className="grid min-h-[30rem] md:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="border-b-2 border-black bg-[#fffbd5] p-3 md:border-b-0 md:border-r-2">
            <p className="mb-3 text-xs font-black uppercase tracking-wider">Students</p>
            <div className="grid gap-2">
              {dashboardView === "calendar" && (
                <button
                  className={`rounded-2xl border-2 border-black p-3 text-left font-black ${calendarChildUid === "all" ? "bg-black text-white shadow-[3px_3px_0_#7b61ff]" : "bg-white"}`}
                  onClick={() => setCalendarChildUid("all")}
                  type="button"
                >
                  All students
                  <span className={`mt-1 block text-xs font-medium ${calendarChildUid === "all" ? "text-zinc-300" : "text-zinc-500"}`}>
                    {children.reduce((total, child) => total + child.assignments.filter((assignment) => assignment.progressPercent < 100).length, 0)} active assignments
                  </span>
                </button>
              )}
              {children.map((child) => (
                <button className={`rounded-2xl border-2 border-black p-3 text-left font-black capitalize ${(dashboardView === "calendar" ? calendarChildUid === child.studentUid : selectedChild?.studentUid === child.studentUid) ? "bg-black text-white shadow-[3px_3px_0_#7b61ff]" : "bg-white"}`} key={child.studentUid} onClick={() => dashboardView === "calendar" ? setCalendarChildUid(child.studentUid) : setSelectedChildUid(child.studentUid)} type="button">
                  {child.studentUsername}
                  <span className={`mt-1 block text-xs font-medium ${(dashboardView === "calendar" ? calendarChildUid === child.studentUid : selectedChild?.studentUid === child.studentUid) ? "text-zinc-300" : "text-zinc-500"}`}>{child.assignments.filter((assignment) => assignment.progressPercent < 100).length} active assignments</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 p-4 sm:p-5">
            <div className="mb-4">
              <p className="text-2xl font-black capitalize">
                {dashboardView === "calendar" && calendarChildUid === "all"
                  ? "All students’ calendar"
                  : `${(dashboardView === "calendar" ? calendarChildren[0]?.studentUsername : selectedChild?.studentUsername) ?? "Student"}’s ${dashboardView === "calendar" ? "calendar" : "assignments"}`}
              </p>
              <p className="text-sm text-zinc-500">Progress updates appear after the student submits evidence and the AI reviews it.</p>
            </div>
            {dashboardView === "calendar" ? (
              <AssignmentCalendar
                assignments={calendarChildren.flatMap((child) => child.assignments
                  .filter((assignment) => assignment.progressPercent < 100)
                  .map((assignment) => ({
                    classId: assignment.classId,
                    className: assignment.className,
                    completedSteps: assignment.completedSteps,
                    currentMission: assignment.currentMission,
                    dailyPlan: assignment.dailyPlan,
                    dueDate: assignment.dueDate,
                    id: `${child.studentUid}::${assignment.id}`,
                    ownerName: child.studentUsername,
                    targetSteps: assignment.targetSteps,
                    title: assignment.title,
                  })))}
                emptyMessage={calendarChildUid === "all" ? "No connected students have active assignments scheduled." : `${calendarChildren[0]?.studentUsername ?? "This student"} has no active assignments scheduled.`}
                onAssignmentSelect={(calendarAssignmentId) => {
                  const separator = calendarAssignmentId.indexOf("::");
                  const childUid = calendarAssignmentId.slice(0, separator);
                  const assignmentId = calendarAssignmentId.slice(separator + 2);
                  setSelectedChildUid(childUid);
                  setSelectedAssignmentId(assignmentId);
                  onDashboardViewChange("assignments");
                  window.setTimeout(() => {
                    document.getElementById(`parent-assignment-${assignmentId}`)?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }, 0);
                }}
                title={calendarChildUid === "all" ? "All students" : `${calendarChildren[0]?.studentUsername ?? "Student"}’s calendar`}
              />
            ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {selectedChild?.assignments.map((assignment) => {
                const overdue = assignment.dueDate && assignment.dueDate < today && assignment.progressPercent < 100;
                const complete = assignment.progressPercent === 100;
                return (
                  <article className={`rounded-2xl border-2 border-black p-4 shadow-[4px_4px_0_#111] ${selectedAssignmentId === assignment.id ? "ring-4 ring-[#7b61ff] ring-offset-2" : ""} ${overdue ? "bg-red-100" : complete ? "bg-emerald-100" : "bg-white"}`} id={`parent-assignment-${assignment.id}`} key={assignment.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-lg font-black">{assignment.title}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{assignment.className} · {assignment.assignmentType}</p></div>
                      {complete ? <CheckCircle2 className="size-5 shrink-0 text-emerald-700" /> : overdue ? <span className="rounded-full bg-red-700 px-2 py-1 text-[10px] font-black text-white">OVERDUE</span> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold"><span className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1"><CalendarDays className="size-3.5" /> Due {formatDate(assignment.dueDate)}</span><span className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1"><Clock3 className="size-3.5" /> {assignment.completedSteps}/{assignment.targetSteps} steps</span></div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full border-2 border-black bg-zinc-200"><div className={`h-full ${overdue ? "bg-red-600" : "bg-[#7b61ff]"}`} style={{ width: `${assignment.progressPercent}%` }} /></div>
                    <p className="mt-1 text-right text-xs font-black">{assignment.progressPercent}% complete</p>
                    {assignment.currentMission && !complete && <p className="mt-3 rounded-xl bg-white/80 p-3 text-sm"><strong>Current mission:</strong> {assignment.currentMission}</p>}
                    {assignment.lastProgressSummary && <p className="mt-2 text-xs leading-5 text-zinc-700"><strong>Latest reviewed progress:</strong> {assignment.lastProgressSummary}</p>}
                    {assignment.remainingWorkSummary && <p className="mt-2 text-xs leading-5 text-zinc-700"><strong>Still to do:</strong> {assignment.remainingWorkSummary}</p>}
                    {assignment.createdById === user.uid && (
                      <button className="mt-3 flex items-center gap-1.5 rounded-full border-2 border-red-700 bg-white px-3 py-1.5 text-xs font-black text-red-700 disabled:opacity-50" disabled={deletingCid === assignment.id} onClick={() => void deletePersonalAssignment(assignment.id, assignment.title)} type="button">
                        {deletingCid === assignment.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        {deletingCid === assignment.id ? "Deleting…" : "Delete personal assignment"}
                      </button>
                    )}
                  </article>
                );
              })}
              {selectedChild?.assignments.length === 0 && <p className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 lg:col-span-2">No assignments have been published to this student yet.</p>}
            </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
