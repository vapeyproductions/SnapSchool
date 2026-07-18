"use client";

import { Camera, Loader2, Sparkles, Upload } from "lucide-react";
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
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
      const isImage = file.type.startsWith("image/");
      try {
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

        if (analysis) {
          const reviewText = responseBody.approved
            ? `🤖 AI progress review: Today's work is recorded. ${analysis.progressSummary} ${analysis.recommendedRemainingWorkDays} planned work day${analysis.recommendedRemainingWorkDays === 1 ? "" : "s"} remain.`
            : `🤖 AI progress review: This submission did not complete today's goal yet. ${analysis.feedback}`;
          await channel.sendMessage({ text: reviewText });
        }
      } catch {
        setErrorMessage(
          "The AI review completed, but the evidence image could not be added to the assignment chat. Please try uploading it again from the chat.",
        );
      }

      if (responseBody.approved) {
        setFile(null);
        setNote("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to review progress.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="m-4 rounded-[1.75rem] border-2 border-black bg-white p-4 shadow-[4px_4px_0_#111] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#fffc00]">
          <Camera className="size-5" />
        </span>
        <div>
          <p className="font-black tracking-tight text-black">Snap today&apos;s progress</p>
          <p className="mt-0.5 text-xs font-medium leading-5 text-zinc-600">
            Share visible work. AI checks it against today&apos;s mission and reshapes the plan if needed.
          </p>
        </div>
      </div>

      <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={submitProgress}>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-black bg-[#fffc00] px-3 py-3 text-xs font-black text-black transition hover:-translate-y-0.5">
              <Camera className="size-4" />
              Take photo
              <input
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setErrorMessage("");
                  setResult(null);
                }}
                ref={cameraInputRef}
                type="file"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-black bg-white px-3 py-3 text-xs font-black text-black transition hover:-translate-y-0.5">
              <Upload className="size-4" />
              Choose file
              <input
                accept=".gif,.jpeg,.jpg,.pdf,.png,.txt,.webp,.doc,.docx"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setErrorMessage("");
                  setResult(null);
                }}
                ref={fileInputRef}
                type="file"
              />
            </label>
          </div>
          {file && (
            <p className="truncate rounded-xl bg-[#f4f0e8] px-3 py-2 text-xs font-bold text-zinc-700">
              Selected: {file.name}
            </p>
          )}
          <input
            className="w-full rounded-2xl border-2 border-black bg-white px-3 py-2.5 text-sm outline-none focus:shadow-[2px_2px_0_#111]"
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional: briefly explain what you completed"
            value={note}
          />
          <p className="text-[11px] font-medium text-zinc-500">Maximum 10 MB. Keep grades and unrelated private information out of frame.</p>
        </div>
        <button
          className="flex items-center justify-center gap-2 self-start rounded-full border-2 border-black bg-[#fffc00] px-5 py-3 text-sm font-black text-black shadow-[3px_3px_0_#111] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
          disabled={isSubmitting || !file}
          type="submit"
        >
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {isSubmitting ? "Reviewing..." : "Keep my streak"}
        </button>
      </form>

      {errorMessage && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{errorMessage}</p>}
      {result?.analysis && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${result.approved ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`} role="status">
          <strong>{result.approved ? "Today completed." : "More evidence needed."}</strong>{" "}
          {result.analysis.feedback}
          <span className="mt-1 block">
            AI estimate: {result.analysis.estimatedCompletionPercent}% of the assignment is complete.
          </span>
          {result.approved && typeof result.targetDays === "number" && (
            <span className="mt-1 block">Recalibrated assignment progress: {result.completedWorkDays} of {result.targetDays} work days.</span>
          )}
          {result.analysis.warnings.length > 0 && <span className="mt-1 block">Check: {result.analysis.warnings.join(" ")}</span>}
        </div>
      )}
    </section>
  );
}
