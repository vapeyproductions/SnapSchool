"use client";

import type { User } from "firebase/auth";
import { Hand, Loader2 } from "lucide-react";
import { useState } from "react";
import type { Channel } from "stream-chat";

import { requestTeacherForGroupAssignment } from "@/actions/stream";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type LocalRequest = {
  channelCid: string;
  createdAt?: string;
  question?: string;
  requestId?: string;
  requestedByName?: string;
  status?: "open" | "resolved";
};

export function RequestTeacherButton({
  channel,
  user,
}: {
  channel: Channel;
  user: User;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [localRequest, setLocalRequest] = useState<LocalRequest | null>(null);
  const localApplies =
    localRequest?.channelCid === channel.cid &&
    channel.data?.teacher_request_id !== localRequest.requestId;
  const status = localApplies
    ? localRequest.status
    : channel.data?.teacher_request_status;
  const question = localApplies
    ? localRequest.question
    : channel.data?.teacher_request_question;
  const requestedByName = localApplies
    ? localRequest.requestedByName
    : channel.data?.teacher_request_requested_by_name;

  if (channel.data?.assignment_type !== "group") return null;

  const requestTeacher = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const result = await requestTeacherForGroupAssignment({
        channelCid: channel.cid,
        firebaseIdToken: await user.getIdToken(),
        question: String(formData.get("question") ?? ""),
      });
      if (
        !result.success ||
        !result.requestId ||
        !result.question ||
        !result.requestedByName
      ) {
        setErrorMessage(result.error ?? "Unable to request the teacher");
        return;
      }

      setLocalRequest({
        channelCid: channel.cid,
        createdAt: result.createdAt ?? undefined,
        question: result.question,
        requestId: result.requestId,
        requestedByName: result.requestedByName,
        status: "open",
      });
      setOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to request the teacher",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "open") {
    return (
      <div className="border-b-2 border-black bg-[#fffc00] px-4 py-3 text-xs text-black">
        <div className="flex items-start gap-2">
          <Hand className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-black">Teacher requested{requestedByName ? ` by ${requestedByName}` : ""}</p>
            <p className="mt-1 font-medium leading-5">{question}</p>
            <p className="mt-1 text-[10px] text-zinc-600">This request stays open until the teacher marks it resolved.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b-2 border-black bg-[#c7b7ff] px-4 py-2.5">
      <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); setErrorMessage(""); }}>
        <DialogTrigger render={<Button className="rounded-full border-2 border-black bg-white px-4 text-xs font-black text-black shadow-[2px_2px_0_#111] hover:bg-[#fffc00]" />}>
          <Hand className="size-4" /> Request teacher
        </DialogTrigger>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request your teacher</DialogTitle>
            <DialogDescription>
              Ask one specific question about this group assignment. Only one teacher request can remain open at a time.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={requestTeacher}>
            <label className="block space-y-2 text-sm font-medium">
              What does your group need help with?
              <textarea className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2.5" maxLength={500} minLength={5} name="question" placeholder="We need help deciding…" required />
            </label>
            {errorMessage && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>}
            <Button className="w-full rounded-xl bg-black font-black text-white" disabled={isSubmitting} type="submit">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting ? "Sending request…" : "Send teacher request"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
