"use client";

import {
  CalendarDays,
  FileText,
  Loader2,
  School,
  Sparkles,
} from "lucide-react";
import { type Dispatch, useContext, useEffect, useState } from "react";

import {
  createClassAssignment,
  getAdministratorClasses,
  type SchoolClassSummary,
} from "@/actions/stream";
import AuthContext from "@/app/components/AuthContext";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AssignmentAnalysis } from "@/lib/assignment-analysis";

const earliestPlanningDueDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, "0"),
    String(tomorrow.getDate()).padStart(2, "0"),
  ].join("-");
};

export default function CreateStreakModal({
  setOpen,
}: {
  setOpen: Dispatch<React.SetStateAction<boolean>>;
}) {
  const { role, user } = useContext(AuthContext);
  const minimumDueDate = earliestPlanningDueDate();
  const [assignmentRequestId, setAssignmentRequestId] = useState(() => crypto.randomUUID());
  const [classes, setClasses] = useState<SchoolClassSummary[]>([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [clarification, setClarification] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueDateManuallySet, setDueDateManuallySet] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [analysis, setAnalysis] = useState<AssignmentAnalysis | null>(null);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!user || role !== "administrator" || classesLoaded) return;
    let cancelled = false;

    const loadClasses = async () => {
      setIsLoadingClasses(true);
      try {
        const result = await getAdministratorClasses(await user.getIdToken());
        if (cancelled) return;
        if (result.success) {
          setClasses(result.classes);
          setClassesLoaded(true);
        } else {
          setErrorMessage(result.error ?? "Unable to load classes");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load classes");
        }
      } finally {
        if (!cancelled) setIsLoadingClasses(false);
      }
    };

    void loadClasses();
    return () => {
      cancelled = true;
    };
  }, [classesLoaded, role, user]);

  useEffect(() => {
    const upsertClass = (event: Event) => {
      const classRecord = (event as CustomEvent<SchoolClassSummary>).detail;
      if (!classRecord?.id) return;
      setClasses((current) =>
        [...current.filter((schoolClass) => schoolClass.id !== classRecord.id), classRecord]
          .sort((first, second) => first.name.localeCompare(second.name)),
      );
      setClassesLoaded(true);
    };
    const removeDeletedClass = (event: Event) => {
      const classId = (event as CustomEvent<{ classId?: string }>).detail?.classId;
      if (!classId) return;
      setClasses((current) => current.filter((schoolClass) => schoolClass.id !== classId));
      setClassIds((current) => current.filter((selectedId) => selectedId !== classId));
    };
    window.addEventListener("snapschool:class-created", upsertClass);
    window.addEventListener("snapschool:class-updated", upsertClass);
    window.addEventListener("snapschool:class-deleted", removeDeletedClass);
    return () => {
      window.removeEventListener("snapschool:class-created", upsertClass);
      window.removeEventListener("snapschool:class-updated", upsertClass);
      window.removeEventListener("snapschool:class-deleted", removeDeletedClass);
    };
  }, []);

  const analyzeAssignment = async () => {
    setErrorMessage("");
    if (!user || role !== "administrator") {
      setErrorMessage("Only administrators can analyze assignments");
      return;
    }
    if (!description.trim() && files.length === 0) {
      setErrorMessage("Add a brief description or upload an assignment first");
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.set("description", description.trim());
      formData.set("clarification", clarification.trim());
      if (dueDateManuallySet && dueDate) formData.set("dueDateOverride", dueDate);
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/assignments/analyze", {
        body: formData,
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        method: "POST",
      });
      const result = (await response.json()) as {
        analysis?: AssignmentAnalysis;
        error?: string;
      };

      if (!response.ok || !result.analysis) {
        throw new Error(result.error ?? "Unable to analyze this assignment");
      }
      setAnalysis(result.analysis);
      setTitle(result.analysis.suggestedTitle);
      if (!dueDateManuallySet && result.analysis.detectedDueDate) {
        setDueDate(result.analysis.detectedDueDate);
      }
      if (!result.analysis.inputValid) {
        setErrorMessage(
          "The AI needs more information. Review its notes below, add a correction or clarification, and update the plan.",
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to analyze this assignment");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createAssignment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    if (!user || role !== "administrator") {
      setErrorMessage("Only administrators can create assignments");
      return;
    }
    if (!analysis) {
      setErrorMessage("Analyze and review the assignment before creating it");
      return;
    }
    if (!analysis.inputValid) {
      setErrorMessage("Clarify the assignment and update the AI plan before publishing");
      return;
    }
    if (!dueDate) {
      setErrorMessage("A due date is required before assigning this work");
      return;
    }
    if (dueDate < minimumDueDate) {
      setErrorMessage("Choose a due date of at least tomorrow so the plan can finish the day before it is due");
      return;
    }

    setIsCreating(true);
    try {
      const firebaseIdToken = await user.getIdToken();
      const plan = {
        assignmentKind: analysis.assignmentKind,
        assignmentSummary: analysis.assignmentSummary,
        dailyTasks: analysis.dailyTasks,
        dueDate,
        estimatedTotalMinutes: analysis.estimatedTotalMinutes,
        recommendedWorkDays: analysis.recommendedWorkDays,
      };

      const result = await createClassAssignment({
        classIds,
        firebaseIdToken,
        plan,
        requestId: assignmentRequestId,
        title: title.trim(),
      });
      if (result.success) {
        setAssignmentRequestId(crypto.randomUUID());
        setClassIds([]);
        setDescription("");
        setClarification("");
        setDueDate("");
        setDueDateManuallySet(false);
        setFiles([]);
        setFileInputKey((current) => current + 1);
        setAnalysis(null);
        setTitle("");
        setErrorMessage("");
        window.dispatchEvent(new Event("snapschool:assignment-created"));
        setOpen(false);
        return;
      }
      setErrorMessage(result.error ?? "Unable to assign work to the class");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create the assignment");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Create an AI-planned assignment</DialogTitle>
        <DialogDescription>
          Upload the instructions or describe the work. Review the suggested due date and daily plan—or study plan for a test—before students receive it.
        </DialogDescription>
      </DialogHeader>

      <form className="space-y-5" onSubmit={createAssignment}>
        <fieldset className="block space-y-2 text-sm font-medium">
          <legend className="flex items-center gap-2"><School className="size-4" /> Classes</legend>
          {isLoadingClasses ? (
            <span className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-slate-500"><Loader2 className="size-4 animate-spin" /> Loading classes...</span>
          ) : (
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-slate-300 bg-white p-3">
              {classes.length > 1 && (
                <button
                  className="mb-1 text-xs font-semibold text-indigo-700 hover:underline"
                  onClick={() => setClassIds(
                    classIds.length === classes.length
                      ? []
                      : classes.map((schoolClass) => schoolClass.id),
                  )}
                  type="button"
                >
                  {classIds.length === classes.length ? "Clear all" : "Select all classes"}
                </button>
              )}
              {classes.map((schoolClass) => (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-indigo-50" key={schoolClass.id}>
                  <span>
                    <span className="block font-semibold text-slate-900">{schoolClass.name}</span>
                    <span className="block text-xs font-normal text-slate-500">{schoolClass.studentCount} students</span>
                  </span>
                  <input
                    checked={classIds.includes(schoolClass.id)}
                    className="size-4 accent-indigo-600"
                    onChange={(event) => setClassIds((current) =>
                      event.target.checked
                        ? [...current, schoolClass.id]
                        : current.filter((id) => id !== schoolClass.id),
                    )}
                    type="checkbox"
                  />
                </label>
              ))}
            </div>
          )}
          {classesLoaded && classes.length === 0 && <span className="block text-xs text-amber-700">Create a class and add students before assigning classwork.</span>}
          {classIds.length > 0 && <span className="block text-xs text-indigo-700">One assignment will be published to {classIds.length} class{classIds.length === 1 ? "" : "es"}.</span>}
        </fieldset>

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-indigo-950"><Sparkles className="size-5 text-indigo-600" /> Assignment source</div>
          <label className="block space-y-2 text-sm font-medium">
            Brief description
            <textarea className="min-h-28 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-100" maxLength={12000} onChange={(event) => setDescription(event.target.value)} placeholder="For example: Read chapters 3-4 and write a two-page response comparing the main characters." value={description} />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Screenshots or documents (optional)
            <span className="flex items-center gap-3 rounded-xl border border-dashed border-indigo-300 bg-white px-3 py-3 text-sm text-slate-600">
              <FileText className="size-5 text-indigo-600" />
              <input accept=".gif,.jpeg,.jpg,.pdf,.png,.txt,.webp,.doc,.docx" className="min-w-0 flex-1 text-xs" key={fileInputKey} multiple onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setAnalysis(null); }} type="file" />
            </span>
            <span className="block text-xs font-normal text-slate-500">Up to 10 files, 10 MB each and 30 MB combined. Upload pages in reading order. Avoid student names, grades, or other private information.</span>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Due date (optional before analysis)
            <span className="relative block"><CalendarDays className="absolute left-3 top-3 size-4 text-slate-400" /><input className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3" min={minimumDueDate} onChange={(event) => { setDueDate(event.target.value); setDueDateManuallySet(Boolean(event.target.value)); }} type="date" value={dueDate} /></span>
            <span className="block text-xs font-normal text-slate-500">Your date overrides one detected in the uploaded assignment.</span>
          </label>
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-60" disabled={isAnalyzing || (!description.trim() && files.length === 0)} onClick={() => void analyzeAssignment()} type="button">
            {isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isAnalyzing ? "Analyzing assignment..." : analysis ? "Analyze again" : "Analyze with AI"}
          </button>
        </div>

        {analysis && (
          <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div><p className="font-semibold text-emerald-950">Review the suggested plan</p><p className="text-xs text-slate-600">AI estimates can be wrong. Confirm the title, due date, and workload before assigning.</p></div>
            {analysis.warnings.length > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><strong>Check before assigning:</strong><ul className="mt-1 list-disc pl-5">{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
            <div className="rounded-xl border-2 border-indigo-400 bg-indigo-50 p-4">
              <label className="block space-y-2 text-sm font-semibold text-indigo-950">
                Teacher corrections or clarification
                <textarea className="min-h-28 w-full rounded-xl border border-indigo-300 bg-white px-3 py-2.5 font-normal text-slate-900" maxLength={4000} onChange={(event) => setClarification(event.target.value)} placeholder="Correct dates, explain quiz coverage, add missing page numbers, or clarify any other issue the AI identified." value={clarification} />
              </label>
              <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60" disabled={isAnalyzing || !clarification.trim()} onClick={() => void analyzeAssignment()} type="button">
                {isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Re-analyze with my clarification
              </button>
            </div>
            <label className="block space-y-2 text-sm font-medium">Assignment title<input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" maxLength={100} minLength={3} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
            <label className="block space-y-2 text-sm font-medium">Due date (required)<input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" min={minimumDueDate} onChange={(event) => { setDueDate(event.target.value); setDueDateManuallySet(Boolean(event.target.value)); }} required type="date" value={dueDate} /></label>
            <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-white p-3"><span className="block text-slate-500">Estimated effort</span><strong>{analysis.estimatedTotalMinutes} minutes</strong></div><div className="rounded-xl bg-white p-3"><span className="block text-slate-500">Streak target</span><strong>{analysis.recommendedWorkDays} work days</strong></div></div>
            <div className="text-sm"><p className="font-medium">Summary</p><p className="mt-1 leading-6 text-slate-600">{analysis.assignmentSummary}</p></div>
            <div className="text-sm"><p className="font-medium">Why this workload</p><p className="mt-1 leading-6 text-slate-600">{analysis.workloadRationale}</p></div>
            <div><p className="text-sm font-medium">{["test", "quiz", "exam"].includes(analysis.assignmentKind) ? "Daily study plan" : "Daily plan"}</p><ol className="mt-2 space-y-2">{analysis.dailyTasks.map((task) => <li className="rounded-xl bg-white p-3 text-sm" key={task.dayNumber}><div className="flex justify-between gap-3"><strong>Day {task.dayNumber}: {task.title}</strong><span className="shrink-0 text-slate-500">{task.estimatedMinutes} min</span></div><p className="mt-1 leading-5 text-slate-600">{task.description}</p></li>)}</ol></div>
          </div>
        )}

        {errorMessage && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errorMessage}</p>}
        {analysis && (
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={isCreating || !analysis.inputValid || !dueDate || !title.trim() || classIds.length === 0} type="submit">
            {isCreating && <Loader2 className="size-4 animate-spin" />}
            {isCreating ? "Creating assignments..." : `Publish to ${classIds.length} class${classIds.length === 1 ? "" : "es"}`}
          </button>
        )}
      </form>
    </DialogContent>
  );
}
