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
const MAX_PHOTOS = 6;
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2200;

const canvasBlob = (
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The photo could not be prepared for upload")),
      "image/jpeg",
      quality,
    );
  });

const optimizePhoto = async (file: File): Promise<File> => {
  if (!file.type.startsWith("image/") || (file.size < 700_000 && file.type !== "image/heic" && file.type !== "image/heif")) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`SchoolSnap could not read ${file.name}. Try a screenshot or JPEG photo.`));
      element.src = objectUrl;
    });
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The photo could not be prepared for upload");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let blob = await canvasBlob(canvas, 0.86);
    if (blob.size > 1_200_000) blob = await canvasBlob(canvas, 0.72);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "worksheet-progress";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export function StudentProgressSubmission() {
  const { role, user } = useContext(AuthContext);
  const { channel } = useChannelStateContext("StudentProgressSubmission");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<ProgressResult | null>(null);

  if (role !== "student" || !user || !channel.data?.daily_plan) return null;

  const submitProgress = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setResult(null);

    if (!files.length && !note.trim()) {
      setErrorMessage("Describe what you completed or add a photo or document");
      return;
    }
    if (files.some((file) => file.size > MAX_FILE_BYTES)) {
      setErrorMessage("The progress file must be 10 MB or smaller");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("channelCid", channel.cid);
      files.forEach((file) => formData.append("files", file));
      formData.set("note", note.trim());
      const response = await fetch("/api/assignments/progress", {
        body: formData,
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        method: "POST",
      });
      const responseText = await response.text();
      let responseBody: ProgressResult & { error?: string };
      try {
        responseBody = JSON.parse(responseText) as ProgressResult & { error?: string };
      } catch {
        throw new Error(
          response.status === 413
            ? "The selected photos are too large to upload. Try fewer photos or take screenshots of them."
            : `The progress review service returned an unreadable response (${response.status}). Please try again.`,
        );
      }
      if (!response.ok) throw new Error(responseBody.error ?? "Unable to review this progress");

      setResult(responseBody);
      const analysis = responseBody.analysis;
      try {
        const attachments = [];
        for (const evidenceFile of files) {
          const isImage = evidenceFile.type.startsWith("image/");
          const upload = isImage
            ? await channel.sendImage(evidenceFile, evidenceFile.name, evidenceFile.type)
            : await channel.sendFile(evidenceFile, evidenceFile.name, evidenceFile.type);
          attachments.push({
            asset_url: upload.file,
            image_url: isImage ? upload.file : undefined,
            mime_type: evidenceFile.type,
            title: evidenceFile.name,
            type: isImage ? "image" : "file",
          });
        }

        await channel.sendMessage({
          attachments,
          snapschool_event: "progress_evidence",
          text: note.trim()
            ? `Progress update: ${note.trim()}`
            : "Progress evidence submitted for AI review.",
        });

        if (analysis) {
          const reviewText = responseBody.approved
            ? `🤖 AI progress review: Today's work is recorded. ${analysis.progressSummary} ${analysis.recommendedRemainingWorkDays} planned work day${analysis.recommendedRemainingWorkDays === 1 ? "" : "s"} remain.`
            : `🤖 AI progress review: This submission did not complete today's goal yet. ${analysis.feedback}`;
          await channel.sendMessage({
            snapschool_event: "progress_review",
            text: reviewText,
          });
        }
      } catch {
        setErrorMessage(
          "The AI review completed, but the progress update could not be added to the assignment chat. Please try submitting it again.",
        );
      }

      if (responseBody.approved) {
        window.dispatchEvent(
          new CustomEvent("snapschool:assignment-progress-updated", {
            detail: { cid: channel.cid },
          }),
        );
        setFiles([]);
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

  const chooseFiles = async (selectedFiles: FileList | null, append = false) => {
    setErrorMessage("");
    setResult(null);
    if (!selectedFiles?.length) {
      if (!append) setFiles([]);
      return;
    }

    const selected = Array.from(selectedFiles);
    const combinedCount = (append ? files.length : 0) + selected.length;
    if (combinedCount > MAX_PHOTOS) {
      if (!append) setFiles([]);
      setErrorMessage(`Choose up to ${MAX_PHOTOS} photos at a time`);
      return;
    }
    const allSelectedFiles = append ? [...files, ...selected] : selected;
    if (allSelectedFiles.length > 1 && allSelectedFiles.some((file) => !file.type.startsWith("image/"))) {
      setFiles([]);
      setErrorMessage("Upload either one document or up to six worksheet photos");
      return;
    }

    try {
      const newlyOptimized = await Promise.all(selected.map(optimizePhoto));
      const optimized = append ? [...files, ...newlyOptimized] : newlyOptimized;
      const totalBytes = optimized.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > MAX_UPLOAD_BYTES) {
        setFiles([]);
        setErrorMessage("These photos are still too large together. Choose fewer photos or take screenshots of them.");
        return;
      }
      setFiles(optimized);
    } catch (error) {
      setFiles([]);
      setErrorMessage(error instanceof Error ? error.message : "The selected photos could not be prepared");
    }
  };

  return (
    <section className="m-4 rounded-[1.75rem] border-2 border-black bg-white p-4 shadow-[4px_4px_0_#111] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#fffc00]">
          <Camera className="size-5" />
        </span>
        <div>
          <p className="font-black tracking-tight text-black">Share today&apos;s progress</p>
          <p className="mt-0.5 text-xs font-medium leading-5 text-zinc-600">
            Write what you completed, or share visible work. AI checks it against today&apos;s mission and reshapes the plan if needed.
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
                  const input = event.currentTarget;
                  void chooseFiles(input.files, true).finally(() => { input.value = ""; });
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
                multiple
                onChange={(event) => void chooseFiles(event.target.files)}
                ref={fileInputRef}
                type="file"
              />
            </label>
          </div>
          {files.length > 0 && (
            <p className="rounded-xl bg-[#f4f0e8] px-3 py-2 text-xs font-bold text-zinc-700">
              Selected: {files.length === 1 ? files[0].name : `${files.length} worksheet photos`}
            </p>
          )}
          <textarea
            className="min-h-20 w-full resize-y rounded-2xl border-2 border-black bg-white px-3 py-2.5 text-sm outline-none focus:shadow-[2px_2px_0_#111]"
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What did you complete? For example: I read Chapter 1 and wrote notes on the main characters."
            value={note}
          />
          <p className="text-[11px] font-medium text-zinc-500">For reading or other work without visible proof, a specific written update is enough. Files are optional.</p>
        </div>
        <button
          className="flex items-center justify-center gap-2 self-start rounded-full border-2 border-black bg-[#fffc00] px-5 py-3 text-sm font-black text-black shadow-[3px_3px_0_#111] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
          disabled={isSubmitting || (!files.length && !note.trim())}
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
