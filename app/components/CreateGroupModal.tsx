"use client";

import { Loader2, School, Sparkles } from "lucide-react";
import { type Dispatch, useContext, useEffect, useState } from "react";

import {
  createAssignmentChannel,
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
  const [classes, setClasses] = useState<SchoolClassSummary[]>([]);
  const [classId, setClassId] = useState("");
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [members, setMembers] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AssignmentAnalysis | null>(null);
  const [title, setTitle] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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

  const analyzeAssignment = async () => {
    setErrorMessage("");
    if (!user || role !== "administrator") {
      setErrorMessage("Only administrators can analyze group projects");
      return;
    }
    if (!description.trim() && !file) {
      setErrorMessage("Add a description or upload the project instructions");
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.set("description", description.trim());
      formData.set("dueDate", dueDate);
      if (file) formData.set("file", file);
      const response = await fetch("/api/assignments/analyze", {
        body: formData,
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        method: "POST",
      });
      const result = (await response.json()) as { analysis?: AssignmentAnalysis; error?: string };
      if (!response.ok || !result.analysis) throw new Error(result.error ?? "Unable to analyze this project");
      if (!result.analysis.inputValid) throw new Error(result.analysis.warnings[0] ?? "The project instructions are not readable");
      setAnalysis(result.analysis);
      setTitle(result.analysis.suggestedTitle);
      if (!dueDate && result.analysis.detectedDueDate) setDueDate(result.analysis.detectedDueDate);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to analyze this project");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    if (!user || role !== "administrator") return setErrorMessage("Only administrators can create group projects");
    if (!analysis || !dueDate) return setErrorMessage("Analyze the project and confirm its due date first");

    setIsCreating(true);
    try {
      const usernames = [...new Set(members.split(",").map((member) => member.trim().toLowerCase()).filter(Boolean))];
      const { success, error } = await createAssignmentChannel({
        assignmentType: "group",
        classId,
        firebaseIdToken: await user.getIdToken(),
        memberUsernames: usernames,
        plan: {
          assignmentKind: analysis.assignmentKind,
          assignmentSummary: analysis.assignmentSummary,
          dailyTasks: analysis.dailyTasks,
          dueDate,
          estimatedTotalMinutes: analysis.estimatedTotalMinutes,
          recommendedWorkDays: analysis.recommendedWorkDays,
        },
        title: title.trim(),
      });
      if (success) return setOpen(false);
      setErrorMessage(error ?? "Unable to create the group project");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create the group project");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Create an AI-planned group project</DialogTitle>
        <DialogDescription>Add at least two people, including at least one student. Multiple administrators are welcome.</DialogDescription>
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
          {!isLoadingClasses && classes.length === 0 && <span className="block text-xs text-amber-700">Create a class before starting a group project.</span>}
        </label>
        <label className="block space-y-2 text-sm font-medium">Student and administrator usernames<input className="w-full rounded-xl border border-slate-300 px-3 py-2.5" onChange={(event) => setMembers(event.target.value)} placeholder="alex, ms.jones, taylor" required value={members} /><span className="block text-xs font-normal text-slate-500">Comma-separated. You are added automatically.</span></label>
        <label className="block space-y-2 text-sm font-medium">Project description<textarea className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2.5" maxLength={12000} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the project requirements, or upload them below." value={description} /></label>
        <label className="block space-y-2 text-sm font-medium">Screenshot or document (optional)<input accept=".gif,.jpeg,.jpg,.pdf,.png,.txt,.webp,.doc,.docx" className="block w-full rounded-xl border border-dashed border-indigo-300 p-3 text-xs" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /><span className="block text-xs font-normal text-slate-500">Maximum 10 MB. Avoid student names, grades, or private information.</span></label>
        <label className="block space-y-2 text-sm font-medium">Due date (optional before analysis)<input className="w-full rounded-xl border border-slate-300 px-3 py-2.5" min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} /></label>
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white disabled:opacity-60" disabled={isAnalyzing || (!description.trim() && !file)} onClick={() => void analyzeAssignment()} type="button">{isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{isAnalyzing ? "Analyzing project..." : analysis ? "Analyze again" : "Analyze with AI"}</button>

        {analysis && <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4"><p className="font-semibold">Review the suggested plan</p><p className="text-xs text-slate-600">AI estimates can be wrong. Confirm everything before creating the project.</p><label className="block space-y-2 text-sm font-medium">Project title<input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" maxLength={100} minLength={3} onChange={(event) => setTitle(event.target.value)} required value={title} /></label><label className="block space-y-2 text-sm font-medium">Due date (required)<input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDueDate(event.target.value)} required type="date" value={dueDate} /></label><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-white p-3"><span className="block text-slate-500">Effort</span><strong>{analysis.estimatedTotalMinutes} min</strong></div><div className="rounded-xl bg-white p-3"><span className="block text-slate-500">Streak target</span><strong>{analysis.recommendedWorkDays} days</strong></div></div><p className="text-sm leading-6 text-slate-600">{analysis.assignmentSummary}</p><ol className="space-y-2">{analysis.dailyTasks.map((task) => <li className="rounded-xl bg-white p-3 text-sm" key={task.dayNumber}><strong>Day {task.dayNumber}: {task.title}</strong><span className="float-right text-slate-500">{task.estimatedMinutes} min</span><p className="mt-1 text-slate-600">{task.description}</p></li>)}</ol></section>}
        {errorMessage && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errorMessage}</p>}
        {analysis && <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={isCreating || !classId || !dueDate || !title.trim()} type="submit">{isCreating && <Loader2 className="size-4 animate-spin" />}{isCreating ? "Creating project..." : "Create group project"}</button>}
      </form>
    </DialogContent>
  );
}
