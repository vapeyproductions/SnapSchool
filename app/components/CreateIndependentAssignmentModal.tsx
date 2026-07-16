"use client";

import { CalendarDays, FileText, Loader2, Sparkles, UserRound } from "lucide-react";
import { type Dispatch, useContext, useEffect, useState } from "react";

import { getAssignableIndependentStudents } from "@/actions/profile";
import { createIndependentAssignment } from "@/actions/stream";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AssignmentAnalysis } from "@/lib/assignment-analysis";

import AuthContext from "./AuthContext";

type AssignableStudent = { uid: string; username: string };

export default function CreateIndependentAssignmentModal({
  setOpen,
}: {
  setOpen: Dispatch<React.SetStateAction<boolean>>;
}) {
  const { role, user } = useContext(AuthContext);
  const [students, setStudents] = useState<AssignableStudent[]>([]);
  const [targetStudentUid, setTargetStudentUid] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AssignmentAnalysis | null>(null);
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!user || (role !== "student" && role !== "parent")) return;
    let active = true;
    user.getIdToken()
      .then((firebaseIdToken) => getAssignableIndependentStudents(firebaseIdToken))
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setStudents(result.students);
          setTargetStudentUid(result.students[0]?.uid ?? "");
        } else {
          setErrorMessage(result.error ?? "Unable to load independent students");
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setErrorMessage("Unable to load independent students");
        setIsLoading(false);
      });
    return () => { active = false; };
  }, [role, user]);

  const analyze = async () => {
    if (!user || !targetStudentUid) return;
    if (!description.trim() && !file) {
      setErrorMessage("Describe the assignment or upload its instructions");
      return;
    }
    setIsAnalyzing(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.set("description", description.trim());
      formData.set("dueDate", dueDate);
      formData.set("targetStudentUid", targetStudentUid);
      if (file) formData.set("file", file);
      const response = await fetch("/api/assignments/analyze", {
        body: formData,
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        method: "POST",
      });
      const result = (await response.json()) as { analysis?: AssignmentAnalysis; error?: string };
      if (!response.ok || !result.analysis) throw new Error(result.error ?? "Unable to analyze this assignment");
      if (!result.analysis.inputValid) throw new Error(result.analysis.warnings[0] ?? "The assignment instructions could not be read");
      setAnalysis(result.analysis);
      setTitle(result.analysis.suggestedTitle);
      if (!dueDate && result.analysis.detectedDueDate) setDueDate(result.analysis.detectedDueDate);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to analyze this assignment");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const publish = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !analysis || !targetStudentUid || !dueDate) return;
    setIsCreating(true);
    setErrorMessage("");
    try {
      const result = await createIndependentAssignment({
        firebaseIdToken: await user.getIdToken(),
        plan: {
          assignmentKind: analysis.assignmentKind,
          assignmentSummary: analysis.assignmentSummary,
          dailyTasks: analysis.dailyTasks,
          dueDate,
          estimatedTotalMinutes: analysis.estimatedTotalMinutes,
          recommendedWorkDays: analysis.recommendedWorkDays,
        },
        requestId,
        targetStudentUid,
        title: title.trim(),
      });
      if (!result.success) throw new Error(result.error ?? "Unable to add assignment");
      setRequestId(crypto.randomUUID());
      window.dispatchEvent(new Event("snapschool:assignment-created"));
      setOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add assignment");
    } finally {
      setIsCreating(false);
    }
  };

  const selectedStudent = students.find((student) => student.uid === targetStudentUid);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border-2 border-black sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Add an independent assignment</DialogTitle>
        <DialogDescription>
          Upload or describe the work once. AI will estimate the effort and turn it into manageable daily streak missions.
        </DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <p className="flex items-center gap-2 rounded-xl bg-zinc-100 p-4 text-sm"><Loader2 className="size-4 animate-spin" /> Checking assignment access…</p>
      ) : students.length === 0 ? (
        <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          {role === "parent"
            ? "No approved independent students are connected to this parent account. The student must choose independent use and approve your parent request."
            : "This school-connected account receives assignments from its administrators and cannot add independent work."}
        </p>
      ) : (
        <form className="space-y-5" onSubmit={publish}>
          <label className="block space-y-2 text-sm font-medium">
            <span className="flex items-center gap-2"><UserRound className="size-4" /> Assignment for</span>
            {role === "parent" ? (
              <select className="w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 capitalize" onChange={(event) => { setTargetStudentUid(event.target.value); setAnalysis(null); }} required value={targetStudentUid}>
                {students.map((student) => <option key={student.uid} value={student.uid}>{student.username}</option>)}
              </select>
            ) : (
              <p className="rounded-xl border-2 border-black bg-[#fffbd5] px-3 py-2.5 font-black capitalize">{selectedStudent?.username}</p>
            )}
          </label>

          <section className="space-y-4 rounded-2xl border-2 border-black bg-indigo-50 p-4">
            <p className="flex items-center gap-2 font-black"><Sparkles className="size-5 text-indigo-600" /> Assignment information</p>
            <label className="block space-y-2 text-sm font-medium">Brief description<textarea className="min-h-28 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" maxLength={12000} onChange={(event) => { setDescription(event.target.value); setAnalysis(null); }} placeholder="Example: Read chapters 3–4 and write a two-page comparison." value={description} /></label>
            <label className="block space-y-2 text-sm font-medium">Screenshot, photo, or document (optional)<span className="flex items-center gap-3 rounded-xl border border-dashed border-indigo-300 bg-white p-3"><FileText className="size-5 text-indigo-600" /><input accept=".gif,.jpeg,.jpg,.pdf,.png,.txt,.webp,.doc,.docx" className="min-w-0 flex-1 text-xs" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setAnalysis(null); }} type="file" /></span></label>
            <label className="block space-y-2 text-sm font-medium">Due date (optional before analysis)<span className="relative block"><CalendarDays className="absolute left-3 top-3 size-4 text-slate-400" /><input className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3" min={new Date().toISOString().slice(0, 10)} onChange={(event) => { setDueDate(event.target.value); setAnalysis(null); }} type="date" value={dueDate} /></span></label>
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-black text-white disabled:opacity-60" disabled={isAnalyzing || (!description.trim() && !file)} onClick={() => void analyze()} type="button">{isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{isAnalyzing ? "Analyzing…" : "Analyze with AI"}</button>
          </section>

          {analysis && (
            <section className="space-y-4 rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-4">
              <div><p className="font-black">Review the AI plan</p><p className="text-xs text-zinc-600">Confirm the title, due date, and workload before adding it.</p></div>
              <label className="block space-y-2 text-sm font-medium">Assignment title<input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" maxLength={100} minLength={3} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
              <label className="block space-y-2 text-sm font-medium">Due date<input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDueDate(event.target.value)} required type="date" value={dueDate} /></label>
              <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-white p-3"><span className="block text-zinc-500">Estimated effort</span><strong>{analysis.estimatedTotalMinutes} min</strong></div><div className="rounded-xl bg-white p-3"><span className="block text-zinc-500">Streak plan</span><strong>{analysis.recommendedWorkDays} days</strong></div></div>
              <p className="text-sm leading-6 text-zinc-700">{analysis.assignmentSummary}</p>
              <details className="rounded-xl bg-white p-3"><summary className="cursor-pointer font-black">Review daily missions</summary><ol className="mt-3 space-y-2">{analysis.dailyTasks.map((task) => <li className="rounded-xl bg-zinc-100 p-3 text-sm" key={task.dayNumber}><strong>Day {task.dayNumber}: {task.title}</strong><span className="float-right text-zinc-500">{task.estimatedMinutes} min</span><p className="mt-1 text-zinc-600">{task.description}</p></li>)}</ol></details>
              <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-black text-white disabled:opacity-60" disabled={isCreating || !title.trim() || !dueDate} type="submit">{isCreating && <Loader2 className="size-4 animate-spin" />}{isCreating ? "Adding assignment…" : `Add to ${selectedStudent?.username ?? "student"}`}</button>
            </section>
          )}
          {errorMessage && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{errorMessage}</p>}
        </form>
      )}
      {students.length === 0 && errorMessage && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{errorMessage}</p>}
    </DialogContent>
  );
}
