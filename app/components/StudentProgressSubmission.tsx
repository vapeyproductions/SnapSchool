"use client";

import { FileCheck2, Loader2, Sparkles, Upload } from "lucide-react";
import { useContext, useRef, useState } from "react";
import { useChannelStateContext } from "stream-chat-react";

import AuthContext from "./AuthContext";
import type { ProgressAnalysis } from "@/lib/progress-analysis";

type ProgressResult = {
  analysis?: ProgressAnalysis;
  approved: boolean;
  completedWorkDays?: number;
  currentStreak?: number;
  targetDays?: number;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function StudentProgressSubmission() {
  const { role, user } = useContext(AuthContext);
  const { channel } = useChannelStateContext("StudentProgressSubmission");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<ProgressResult | null>(null);

  if (role !== "student" || !user || !channel.data?.daily_plan) return null;

  const submitProgress = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setResult(null);

    if (!file) {
      setErrorMessage("Choose a screenshot, photo, or document first");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorMessage("The progress file must be 10 MB or smaller");
      return;
    }

    setIsSubmitting(true);
    try {
      const isImage = file.type.startsWith("image/");
      const upload = isImage
        ? await channel.sendImage(file, file.name, file.type)
        : await channel.sendFile(file, file.name, file.type);

      await channel.sendMessage({
        attachments: [
          {
            asset_url: upload.file,
            image_url: isImage ? upload.file : undefined,
            mime_type: file.type,
            title: file.name,
            type: isImage ? "image" : "file",
          },
        ],
        text: note.trim()
          ? `Progress evidence: ${note.trim()}`
          : "Progress evidence submitted for AI review.",
      });

      const formData = new FormData();
      formData.set("channelCid", channel.cid);
      formData.set("file", file);
      formData.set("note", note.trim());
      const response = await fetch("/api/assignments/progress", {
        body: formData,
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        method: "POST",
      });
      const responseBody = (await response.json()) as ProgressResult & { error?: string };
      if (!response.ok) throw new Error(responseBody.error ?? "Unable to review this progress");

      setResult(responseBody);
      const analysis = responseBody.analysis;
      if (analysis) {
        const reviewText = responseBody.approved
          ? `🤖 AI progress review: Today's work is recorded. ${analysis.progressSummary} ${analysis.recommendedRemainingWorkDays} planned work day${analysis.recommendedRemainingWorkDays === 1 ? "" : "s"} remain.`
          : `🤖 AI progress review: This submission did not complete today's goal yet. ${analysis.feedback}`;
        await channel.sendMessage({ text: reviewText });
      }

      if (responseBody.approved) {
        setFile(null);
        setNote("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `${error.message}. Your evidence was still posted in the chat.`
          : "Unable to review progress. Your evidence was still posted in the chat.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="border-b border-emerald-100 bg-emerald-50/60 px-4 py-3">
      <div className="flex items-start gap-2">
        <FileCheck2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        <div>
          <p className="text-sm font-semibold text-emerald-950">Complete today with progress evidence</p>
          <p className="text-xs leading-5 text-slate-600">
            Upload visible work. AI will compare it with the assignment plan and adjust what remains before the due date.
          </p>
        </div>
      </div>

      <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={submitProgress}>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-emerald-300 bg-white px-3 py-2 text-xs text-slate-600">
            <Upload className="size-4 text-emerald-700" />
            <input
              accept=".gif,.jpeg,.jpg,.pdf,.png,.txt,.webp,.doc,.docx"
              className="min-w-0 flex-1"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setErrorMessage("");
                setResult(null);
              }}
              ref={fileInputRef}
              type="file"
            />
          </label>
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional: briefly explain what you completed"
            value={note}
          />
          <p className="text-[11px] text-slate-500">Maximum 10 MB. Do not upload grades or unrelated private information.</p>
        </div>
        <button
          className="flex items-center justify-center gap-2 self-start rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          disabled={isSubmitting || !file}
          type="submit"
        >
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {isSubmitting ? "Reviewing..." : "Submit progress"}
        </button>
      </form>

      {errorMessage && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{errorMessage}</p>}
      {result?.analysis && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${result.approved ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`} role="status">
          <strong>{result.approved ? "Today completed." : "More evidence needed."}</strong>{" "}
          {result.analysis.feedback}
          {result.approved && typeof result.targetDays === "number" && (
            <span className="mt-1 block">Recalibrated assignment progress: {result.completedWorkDays} of {result.targetDays} work days.</span>
          )}
          {result.analysis.warnings.length > 0 && <span className="mt-1 block">Check: {result.analysis.warnings.join(" ")}</span>}
        </div>
      )}
    </section>
  );
}
