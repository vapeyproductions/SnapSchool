"use client";

import { Loader2, School, Sparkles } from "lucide-react";
import { type Dispatch, useContext, useEffect, useState } from "react";

import {
  createClassGroupAssignment,
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

export default function CreateGroupModal({
  setOpen,
}: {
  setOpen: Dispatch<React.SetStateAction<boolean>>;
}) {
  const { role, user } = useContext(AuthContext);
  const [assignmentRequestId, setAssignmentRequestId] = useState(() => crypto.randomUUID());
  const [classes, setClasses] = useState<SchoolClassSummary[]>([]);
  const [classId, setClassId] = useState("");
  const [administrators, setAdministrators] = useState("");
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [members, setMembers] = useState("");
  const [description, setDescription] = useState("");
  const [clarification, setClarification] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueDateManuallySet, setDueDateManuallySet] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AssignmentAnalysis | null>(null);
  const [title, setTitle] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const parseGroups = () =>
    members
      .split(/\r?\n/)
      .map((line) => [
        ...new Set(
          line
            .split(",")
            .map((member) => member.trim().toLowerCase())
            .filter(Boolean),
        ),
      ])
      .filter((group) => group.length > 0);

  useEffect(() => {
    if (!user || role !== "administrator") return;
    let cancelled = false;

    const loadClasses = async () => {
      setIsLoadingClasses(true);
      try {
        const result = await getAdministratorClasses(await user.getIdToken());
        if (cancelled) return;
        if (!result.success) {
          setErrorMessage(result.error ?? "Unable to load classes");
          return;
        }
        setClasses(result.classes);
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
  }, [role, user]);

  useEffect(() => {
    const removeDeletedClass = (event: Event) => {
      const deletedClassId = (event as CustomEvent<{ classId?: string }>).detail?.classId;
      if (!deletedClassId) return;
      setClasses((current) =>
        current.filter((schoolClass) => schoolClass.id !== deletedClassId),
      );
      setClassId((current) => (current === deletedClassId ? "" : current));
    };
    window.addEventListener("snapschool:class-deleted", removeDeletedClass);
    return () => window.removeEventListener("snapschool:class-deleted", removeDeletedClass);
  }, []);

  const analyzeAssignment = async () => {
    setErrorMessage("");
    if (!user || role !== "administrator") {
      setErrorMessage("Only administrators can analyze group assignments");
      return;
    }
    if (!description.trim() && !file) {
      setErrorMessage("Add a description or upload the assignment instructions");
      return;
    }
    const groups = parseGroups();
    if (groups.length === 0 || groups.some((group) => group.length < 2)) {
      setErrorMessage("Add at least one group with two students before analyzing the assignment");
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.set("description", description.trim());
      formData.set("clarification", clarification.trim());
      if (dueDateManuallySet && dueDate) formData.set("dueDateOverride", dueDate);
      formData.set(
        "groupWorkerCount",
        String(Math.min(...groups.map((group) => group.length))),
      );
      formData.set("groupCount", String(groups.length));
      if (file) formData.set("file", file);
      const response = await fetch("/api/assignments/analyze", {
        body: formData,
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        method: "POST",
      });
      const result = (await response.json()) as { analysis?: AssignmentAnalysis; error?: string };
      if (!response.ok || !result.analysis) throw new Error(result.error ?? "Unable to analyze this group assignment");
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
      setErrorMessage(error instanceof Error ? error.message : "Unable to analyze this group assignment");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    if (!user || role !== "administrator") return setErrorMessage("Only administrators can create group assignments");
    if (!analysis || !dueDate) return setErrorMessage("Analyze the assignment and confirm its due date first");
    if (!analysis.inputValid) return setErrorMessage("Clarify the assignment and update the AI plan before publishing");

    setIsCreating(true);
    try {
      const groups = parseGroups();
      const { success, error } = await createClassGroupAssignment({
        administratorUsernames: administrators
          .split(",")
          .map((username) => username.trim().toLowerCase())
          .filter(Boolean),
        classId,
        firebaseIdToken: await user.getIdToken(),
        groups,
        plan: {
          assignmentKind: analysis.assignmentKind,
          assignmentSummary: analysis.assignmentSummary,
          dailyTasks: analysis.dailyTasks,
          dueDate,
          estimatedTotalMinutes: analysis.estimatedTotalMinutes,
          recommendedWorkDays: analysis.recommendedWorkDays,
        },
        requestId: assignmentRequestId,
        title: title.trim(),
      });
      if (success) {
        setAssignmentRequestId(crypto.randomUUID());
        window.dispatchEvent(new Event("snapschool:assignment-created"));
        return setOpen(false);
      }
      setErrorMessage(error ?? "Unable to create the group assignment");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create the group assignment");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Create an AI-planned group assignment</DialogTitle>
        <DialogDescription>Add at least two people, including at least one student. AI will account for the team size, shared workload, deadline, and coordination steps.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={handleCreateGroup}>
        <label className="block space-y-2 text-sm font-medium">
          <span className="flex items-center gap-2"><School className="size-4" /> Class</span>
          {isLoadingClasses ? (
            <span className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-slate-500"><Loader2 className="size-4 animate-spin" /> Loading classes...</span>
          ) : (
            <select className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" disabled={classes.length === 0} onChange={(event) => setClassId(event.target.value)} required value={classId}>
              <option value="">Select a class</option>
              {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
            </select>
          )}
          {!isLoadingClasses && classes.length === 0 && <span className="block text-xs text-amber-700">Create a class before starting a group assignment.</span>}
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Student groups
          <textarea className="min-h-32 w-full rounded-xl border border-slate-300 px-3 py-2.5" onChange={(event) => { setMembers(event.target.value); setAnalysis(null); }} placeholder={"alex, jordan, taylor\nsam, casey, morgan\nriley, jamie"} required value={members} />
          <span className="block text-xs font-normal leading-5 text-slate-500">
            Enter one group per line and separate student usernames with commas. Each student can appear in only one group. You are automatically added to every group chat.
          </span>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Additional administrators (optional)
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5" onChange={(event) => setAdministrators(event.target.value)} placeholder="ms.smith, mr.lee" value={administrators} />
          <span className="block text-xs font-normal text-slate-500">
            Enter class administrators once, separated by commas. They will join every group chat.
          </span>
        </label>
        <label className="block space-y-2 text-sm font-medium">Assignment description<textarea className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2.5" maxLength={12000} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the group requirements, or upload them below." value={description} /></label>
        <label className="block space-y-2 text-sm font-medium">Screenshot or document (optional)<input accept=".gif,.jpeg,.jpg,.pdf,.png,.txt,.webp,.doc,.docx" className="block w-full rounded-xl border border-dashed border-indigo-300 p-3 text-xs" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /><span className="block text-xs font-normal text-slate-500">Maximum 10 MB. Avoid student names, grades, or private information.</span></label>
        <label className="block space-y-2 text-sm font-medium">Due date (optional before analysis)<input className="w-full rounded-xl border border-slate-300 px-3 py-2.5" min={new Date().toISOString().slice(0, 10)} onChange={(event) => { setDueDate(event.target.value); setDueDateManuallySet(Boolean(event.target.value)); }} type="date" value={dueDate} /></label>
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white disabled:opacity-60" disabled={isAnalyzing || (!description.trim() && !file)} onClick={() => void analyzeAssignment()} type="button">{isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{isAnalyzing ? "Analyzing assignment..." : analysis ? "Analyze again" : "Analyze with AI"}</button>

        {analysis && <section className="space-y-3 rounded-2xl border-2 border-indigo-400 bg-indigo-50 p-4">{analysis.warnings.length > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><strong>Check before assigning:</strong><ul className="mt-1 list-disc pl-5">{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}<label className="block space-y-2 text-sm font-semibold text-indigo-950">Teacher corrections or clarification<textarea className="min-h-28 w-full rounded-xl border border-indigo-300 bg-white px-3 py-2.5 font-normal text-slate-900" maxLength={4000} onChange={(event) => setClarification(event.target.value)} placeholder="Correct dates, explain coverage, add missing requirements, or clarify any other issue the AI identified." value={clarification} /></label><button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60" disabled={isAnalyzing || !clarification.trim()} onClick={() => void analyzeAssignment()} type="button">{isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Re-analyze with my clarification</button></section>}
        {analysis && <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4"><p className="font-semibold">Review the suggested plan</p><p className="text-xs text-slate-600">AI estimates can be wrong. Confirm everything before publishing the assignment.</p><label className="block space-y-2 text-sm font-medium">Assignment title<input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" maxLength={100} minLength={3} onChange={(event) => setTitle(event.target.value)} required value={title} /></label><label className="block space-y-2 text-sm font-medium">Due date (required)<input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" min={new Date().toISOString().slice(0, 10)} onChange={(event) => { setDueDate(event.target.value); setDueDateManuallySet(Boolean(event.target.value)); }} required type="date" value={dueDate} /></label><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-white p-3"><span className="block text-slate-500">Effort</span><strong>{analysis.estimatedTotalMinutes} min</strong></div><div className="rounded-xl bg-white p-3"><span className="block text-slate-500">Streak target</span><strong>{analysis.recommendedWorkDays} days</strong></div></div><p className="text-sm leading-6 text-slate-600">{analysis.assignmentSummary}</p><ol className="space-y-2">{analysis.dailyTasks.map((task) => <li className="rounded-xl bg-white p-3 text-sm" key={task.dayNumber}><strong>Day {task.dayNumber}: {task.title}</strong><span className="float-right text-slate-500">{task.estimatedMinutes} min</span><p className="mt-1 text-slate-600">{task.description}</p></li>)}</ol></section>}
        {errorMessage && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errorMessage}</p>}
        {analysis && <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={isCreating || !analysis.inputValid || !classId || !dueDate || !title.trim()} type="submit">{isCreating && <Loader2 className="size-4 animate-spin" />}{isCreating ? "Publishing groups..." : `Publish assignment to ${parseGroups().length} group${parseGroups().length === 1 ? "" : "s"}`}</button>}
      </form>
    </DialogContent>
  );
}
