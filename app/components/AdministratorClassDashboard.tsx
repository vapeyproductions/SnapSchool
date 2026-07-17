"use client";

import type { User } from "firebase/auth";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleCheckBig,
  ChevronRight,
  CircleUserRound,
  FileImage,
  Inbox,
  Loader2,
  MessageCircleQuestion,
  Pencil,
  School,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Channel as StreamChannel, ChannelFilters, ChannelSort } from "stream-chat";
import { Channel, Chat, MessageComposer, MessageList, Window } from "stream-chat-react";

import {
  amendStudentAssignmentDueDate,
  deletePublishedAssignment,
  getAdministratorClasses,
  resolveGroupTeacherRequest,
  type SchoolClassSummary,
  updatePublishedAssignment,
} from "@/actions/stream";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getAssignmentPriority } from "@/lib/assignment-priority";

import { useGetStreamClient } from "./useGetStreamClient";

type DashboardTab = "group-chat" | "messages" | "overview" | "progress";
type AssignmentKind =
  | "essay"
  | "exam"
  | "homework"
  | "other"
  | "project"
  | "quiz"
  | "reading"
  | "test";

type DailyTask = {
  estimatedMinutes?: number;
  title?: string;
};

type GroupContribution = {
  lastProgressAt?: string;
  progressSummary?: string;
  submissionCount?: number;
  username?: string;
};

type AssignmentGroup = {
  channels: StreamChannel[];
  dueDate?: string;
  key: string;
  kind: string;
  title: string;
};

const progressPercent = (channel: StreamChannel) => {
  const completed = channel.data?.completed_work_days ?? 0;
  const target = channel.data?.recommended_work_days ?? 0;
  if (target <= 0) return 0;
  return Math.min(100, Math.round((completed / target) * 100));
};

const parseDailyPlan = (channel: StreamChannel): DailyTask[] => {
  if (typeof channel.data?.daily_plan !== "string") return [];

  try {
    const plan = JSON.parse(channel.data.daily_plan) as DailyTask[];
    return Array.isArray(plan) ? plan : [];
  } catch {
    return [];
  }
};

const parseStringArray = (value?: string): string[] => {
  if (!value) return [];
  try {
    const result = JSON.parse(value) as string[];
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
};

const parseGroupContributions = (
  channel: StreamChannel,
): Record<string, GroupContribution> => {
  if (!channel.data?.group_contributions) return {};
  try {
    const result = JSON.parse(channel.data.group_contributions) as Record<string, GroupContribution>;
    return result && typeof result === "object" ? result : {};
  } catch {
    return {};
  }
};

const formatDueDate = (date?: string) =>
  date
    ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "No due date";

const localDateString = () => {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
};

const isStudentOverdue = (channel: StreamChannel, today = localDateString()) => {
  const originalDueDate =
    channel.data?.original_due_date ?? channel.data?.due_date;
  return Boolean(
    originalDueDate &&
      originalDueDate < today &&
      progressPercent(channel) < 100,
  );
};

const studentName = (channel: StreamChannel) =>
  channel.data?.student_username ||
  Object.values(channel.state.members).find(
    (member) => member.user_id !== channel.data?.created_by_id,
  )?.user?.name ||
  "Student";

const isStudentMessage = (
  channel: StreamChannel,
  message: StreamChannel["state"]["messages"][number],
) =>
  Boolean(
    message.user?.id &&
      message.user.id !== channel.data?.created_by_id &&
      message.text?.trim() &&
      !message.text.startsWith("🤖 AI progress review:") &&
      !message.text.startsWith("Progress evidence"),
  );

function AssignmentManagement({
  assignment,
  onDeleted,
  onUpdated,
  user,
}: {
  assignment: AssignmentGroup;
  onDeleted: (channelCids: string[]) => void;
  onUpdated: (
    channelCids: string[],
    update: {
      assignmentKind: AssignmentKind;
      assignmentSummary: string;
      dueDate: string;
      title: string;
    },
  ) => void;
  user: User;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const channelCids = assignment.channels.map((channel) => channel.cid);
  const isGroupAssignment = assignment.channels.some(
    (channel) => channel.data?.assignment_type === "group",
  );
  const assignmentUnit = isGroupAssignment ? "group" : "student";
  const assignmentSummary =
    assignment.channels[0]?.data?.assignment_summary || "No summary provided.";
  const canDelete = assignment.channels.every(
    (channel) => channel.data?.created_by_id === user.uid,
  );

  const saveAssignment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSaving(true);
    const formData = new FormData(event.currentTarget);
    const update = {
      assignmentKind: String(formData.get("assignmentKind")) as AssignmentKind,
      assignmentSummary: String(formData.get("assignmentSummary") ?? "").trim(),
      dueDate: String(formData.get("dueDate") ?? ""),
      title: String(formData.get("title") ?? "").trim(),
    };

    try {
      const result = await updatePublishedAssignment({
        ...update,
        channelCids,
        firebaseIdToken: await user.getIdToken(),
      });
      if (!result.success) {
        setErrorMessage(result.error ?? "Unable to update the assignment");
        return;
      }
      onUpdated(channelCids, update);
      setEditOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update the assignment");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAssignment = async () => {
    setErrorMessage("");
    setIsDeleting(true);
    try {
      const result = await deletePublishedAssignment({
        channelCids,
        firebaseIdToken: await user.getIdToken(),
      });
      if (!result.success) {
        setErrorMessage(result.error ?? "Unable to delete the assignment");
        return;
      }
      onDeleted(channelCids);
      setDeleteOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete the assignment");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); setErrorMessage(""); }}>
        <DialogTrigger render={<Button className="rounded-full border-2 border-black bg-white px-3 font-black text-black hover:bg-zinc-100" />}>
          <Pencil className="size-4" /> Edit
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit shared assignment</DialogTitle>
            <DialogDescription>
              Changes apply to every assigned {assignmentUnit}. Progress and AI-recalibrated plans are preserved.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={saveAssignment}>
            <label className="block space-y-2 text-sm font-medium">
              Assignment title
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5" defaultValue={assignment.title} maxLength={100} minLength={3} name="title" required />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium">
                Type
                <select className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 capitalize" defaultValue={assignment.kind} name="assignmentKind" required>
                  {(["homework", "reading", "essay", "project", "quiz", "test", "exam", "other"] as AssignmentKind[]).map((kind) => <option className="capitalize" key={kind} value={kind}>{kind}</option>)}
                </select>
              </label>
              <label className="block space-y-2 text-sm font-medium">
                Due date
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5" defaultValue={assignment.dueDate} name="dueDate" required type="date" />
              </label>
            </div>
            <label className="block space-y-2 text-sm font-medium">
              Shared assignment summary
              <textarea className="min-h-32 w-full rounded-xl border border-slate-300 px-3 py-2.5" defaultValue={assignmentSummary} maxLength={1500} minLength={5} name="assignmentSummary" required />
            </label>
            <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Changing the due date does not erase completed streak steps. Each student&apos;s plan can recalibrate the next time they submit progress.
            </p>
            {errorMessage && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>}
            <Button className="w-full rounded-xl bg-black py-3 font-black text-white" disabled={isSaving} type="submit">
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              {isSaving ? "Updating assignment…" : `Update for ${assignment.channels.length} ${assignmentUnit}${assignment.channels.length === 1 ? "" : "s"}`}
            </Button>
            {canDelete && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3">
                <p className="text-xs font-black uppercase tracking-wider text-red-800">Delete assignment</p>
                <p className="mt-1 text-xs leading-5 text-red-700">
                  Only the creator can delete this assignment. Deletion removes it for every assigned {assignmentUnit}.
                </p>
                <Button
                  className="mt-3 rounded-full border-2 border-red-700 bg-white px-3 font-black text-red-700 hover:bg-red-100"
                  onClick={() => {
                    setErrorMessage("");
                    setEditOpen(false);
                    setDeleteOpen(true);
                  }}
                  type="button"
                >
                  <Trash2 className="size-4" /> Delete assignment
                </Button>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {canDelete && <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); setErrorMessage(""); }}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {assignment.title}?</DialogTitle>
            <DialogDescription>
              This removes the shared assignment for all {assignment.channels.length} assigned {assignmentUnit}{assignment.channels.length === 1 ? "" : "s"}, including its conversations and submitted evidence.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
            This action cannot be undone.
          </div>
          {errorMessage && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button className="rounded-xl border-2 border-black bg-white text-black hover:bg-zinc-100" disabled={isDeleting} onClick={() => setDeleteOpen(false)} type="button">Cancel</Button>
            <Button className="rounded-xl bg-red-700 font-black text-white hover:bg-red-800" disabled={isDeleting} onClick={() => void deleteAssignment()} type="button">
              {isDeleting && <Loader2 className="size-4 animate-spin" />}
              {isDeleting ? "Deleting…" : "Delete assignment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>}
    </div>
  );
}

function StudentDueDateAmendment({
  channel,
  onAmended,
  user,
}: {
  channel: StreamChannel;
  onAmended: (channelCid: string, originalDueDate: string, dueDate: string) => void;
  user: User;
}) {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const originalDueDate =
    channel.data?.original_due_date ?? channel.data?.due_date;
  const amendedDueDate = channel.data?.amended_due_date;

  const amendDueDate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSaving(true);
    const formData = new FormData(event.currentTarget);
    const dueDate = String(formData.get("amendedDueDate") ?? "");

    try {
      const result = await amendStudentAssignmentDueDate({
        channelCid: channel.cid,
        dueDate,
        firebaseIdToken: await user.getIdToken(),
      });
      if (!result.success || !result.originalDueDate || !result.amendedDueDate) {
        setErrorMessage(result.error ?? "Unable to amend the due date");
        return;
      }
      onAmended(channel.cid, result.originalDueDate, result.amendedDueDate);
      setOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to amend the due date");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border-2 border-red-200 bg-red-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-red-800">Late assignment</p>
          <p className="mt-1 text-xs text-red-700">
            Original due date: {formatDueDate(originalDueDate)}
            {amendedDueDate && ` · Amended due: ${formatDueDate(amendedDueDate)}`}
          </p>
        </div>
        <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); setErrorMessage(""); }}>
          <DialogTrigger render={<Button className="rounded-full border-2 border-red-700 bg-white px-3 text-xs font-black text-red-700 hover:bg-red-100" />}>
            <CalendarClock className="size-4" /> {amendedDueDate ? "Change amendment" : "Amend due date"}
          </DialogTrigger>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Amend {studentName(channel)}&apos;s due date</DialogTitle>
              <DialogDescription>
                The original deadline remains recorded. This assignment will stay super urgent for the student until it reaches 100% completion.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={amendDueDate}>
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
                Original due date: <strong>{formatDueDate(originalDueDate)}</strong>
              </div>
              <label className="block space-y-2 text-sm font-medium">
                Amended due date
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5" defaultValue={amendedDueDate} min={localDateString()} name="amendedDueDate" required type="date" />
              </label>
              {errorMessage && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>}
              <Button className="w-full rounded-xl bg-red-700 font-black text-white hover:bg-red-800" disabled={isSaving} type="submit">
                {isSaving && <Loader2 className="size-4 animate-spin" />}
                {isSaving ? "Saving amendment…" : "Save amended due date"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function ResolveTeacherRequestButton({
  channel,
  onResolved,
  user,
}: {
  channel: StreamChannel;
  onResolved: (channelCid: string) => void;
  user: User;
}) {
  const [isResolving, setIsResolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const requestId = channel.data?.teacher_request_id;

  if (
    channel.data?.assignment_type !== "group" ||
    channel.data?.teacher_request_status !== "open" ||
    !requestId
  ) {
    return null;
  }

  const resolveRequest = async () => {
    setIsResolving(true);
    setErrorMessage("");
    try {
      const result = await resolveGroupTeacherRequest({
        channelCid: channel.cid,
        firebaseIdToken: await user.getIdToken(),
        requestId,
      });
      if (!result.success) {
        setErrorMessage(result.error ?? "Unable to resolve the request");
        return;
      }
      onResolved(channel.cid);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to resolve the request",
      );
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button className="rounded-full border-2 border-black bg-[#fffc00] px-3 text-xs font-black text-black hover:bg-[#f3ef00]" disabled={isResolving} onClick={() => void resolveRequest()} type="button">
        {isResolving ? <Loader2 className="size-4 animate-spin" /> : <CircleCheckBig className="size-4" />}
        {isResolving ? "Resolving…" : "Mark resolved"}
      </Button>
      {errorMessage && <p className="max-w-56 text-right text-[10px] font-semibold text-red-700" role="alert">{errorMessage}</p>}
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="flex min-h-[36rem] items-center justify-center gap-2 text-sm font-semibold text-zinc-500">
      <Loader2 className="size-5 animate-spin" /> Loading your classes…
    </div>
  );
}

export default function AdministratorClassDashboard({ user }: { user: User }) {
  const { client } = useGetStreamClient(user);
  const [classes, setClasses] = useState<SchoolClassSummary[]>([]);
  const [channels, setChannels] = useState<StreamChannel[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedAssignmentKey, setSelectedAssignmentKey] = useState("");
  const [selectedGroupChannelCid, setSelectedGroupChannelCid] = useState("");
  const [replyChannelCid, setReplyChannelCid] = useState("");
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [, refresh] = useState(0);

  useEffect(() => {
    const handleClassUpdated = async (event: Event) => {
      const classRecord = (
        event as CustomEvent<
          SchoolClassSummary & { assignmentsChanged?: boolean }
        >
      ).detail;
      if (!classRecord?.id) return;

      setClasses((current) =>
        current
          .map((schoolClass) =>
            schoolClass.id === classRecord.id ? classRecord : schoolClass,
          )
          .sort((first, second) => first.name.localeCompare(second.name)),
      );
      setChannels((current) =>
        current.map((channel) => {
          if (channel.data?.class_id !== classRecord.id) return channel;
          channel.data = { ...channel.data, class_name: classRecord.name };
          return channel;
        }),
      );

      if (classRecord.assignmentsChanged && client) {
        try {
          const individualChannels = await client.queryChannels(
            {
              members: { $in: [user.uid] },
              type: "messaging",
            } as ChannelFilters,
            { last_message_at: -1 },
            { message_limit: 30, state: true, watch: true },
          );
          setChannels((current) => [
            ...individualChannels,
            ...current.filter((channel) => channel.type !== "messaging"),
          ]);
        } catch {
          setErrorMessage(
            "The roster was updated, but refresh the page to see the new student assignment records.",
          );
        }
      }
    };

    window.addEventListener("snapschool:class-updated", handleClassUpdated);
    return () =>
      window.removeEventListener("snapschool:class-updated", handleClassUpdated);
  }, [client, user.uid]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    const loadDashboard = async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const firebaseIdToken = await user.getIdToken();
        const classesResult = await getAdministratorClasses(firebaseIdToken);
        if (!classesResult.success) {
          throw new Error(classesResult.error ?? "Unable to load classes");
        }

        const sort: ChannelSort = { last_message_at: -1 };
        const options = {
          message_limit: 30,
          state: true,
          watch: true,
        };
        const baseFilter = { members: { $in: [user.uid] } };
        const [individualChannels, groupChannels] = await Promise.all([
          client.queryChannels(
            { ...baseFilter, type: "messaging" } as ChannelFilters,
            sort,
            options,
          ),
          client.queryChannels(
            { ...baseFilter, type: "livestream" } as ChannelFilters,
            sort,
            options,
          ),
        ]);

        if (cancelled) return;
        setClasses(classesResult.classes);
        setChannels([...individualChannels, ...groupChannels]);
        setSelectedClassId((current) => current || classesResult.classes[0]?.id || "");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load the class dashboard",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDashboard();
    const events = ["channel.updated", "message.new", "message.read"] as const;
    const subscriptions = events.map((eventType) =>
      client.on(eventType, () => refresh((value) => value + 1)),
    );

    return () => {
      cancelled = true;
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [client, user]);

  const assignments = useMemo(() => {
    const groups = new Map<string, AssignmentGroup>();

    channels
      .filter((channel) => channel.data?.class_id === selectedClassId)
      .forEach((channel) => {
        const title = channel.data?.assignment_title || channel.data?.name || "Assignment";
        const dueDate = channel.data?.original_due_date ?? channel.data?.due_date;
        const kind = channel.data?.assignment_kind || "assignment";
        const key = channel.data?.group_assignment_batch_id
          ? `group:${channel.data.group_assignment_batch_id}`
          : `${title}:${dueDate ?? "none"}:${kind}`;
        const existing = groups.get(key);

        if (existing) {
          existing.channels.push(channel);
        } else {
          groups.set(key, { channels: [channel], dueDate, key, kind, title });
        }
      });

    return [...groups.values()].sort((first, second) => {
      const firstDue = first.dueDate ?? "9999-12-31";
      const secondDue = second.dueDate ?? "9999-12-31";
      return firstDue.localeCompare(secondDue) || first.title.localeCompare(second.title);
    });
  }, [channels, selectedClassId]);

  const effectiveAssignmentKey = assignments.some(
    (assignment) => assignment.key === selectedAssignmentKey,
  )
    ? selectedAssignmentKey
    : "";
  const selectedAssignment = assignments.find(
    (assignment) => assignment.key === effectiveAssignmentKey,
  );
  const selectedClass = classes.find((schoolClass) => schoolClass.id === selectedClassId);
  const groupAssignmentChannels =
    selectedAssignment?.channels.filter(
      (channel) => channel.data?.assignment_type === "group",
    ) ?? [];
  const isGroupAssignment = groupAssignmentChannels.length > 0;
  const averageProgress = selectedAssignment
    ? Math.round(
        selectedAssignment.channels.reduce(
          (total, channel) => total + progressPercent(channel),
          0,
        ) / selectedAssignment.channels.length,
      )
    : 0;
  const completedStudents =
    selectedAssignment?.channels.filter((channel) => progressPercent(channel) === 100)
      .length ?? 0;
  const noProgressStudents =
    selectedAssignment?.channels.filter((channel) => progressPercent(channel) === 0)
      .length ?? 0;
  const todayString = localDateString();
  const assignmentIsOverdue = Boolean(
    selectedAssignment?.dueDate && selectedAssignment.dueDate < todayString,
  );
  const overdueStudents =
    selectedAssignment?.channels.filter((channel) =>
      isStudentOverdue(channel, todayString),
    ).length ?? 0;
  const messageThreads = (selectedAssignment?.channels ?? [])
    .map((channel) => {
      if (channel.data?.assignment_type === "group") {
        const isOpen = channel.data.teacher_request_status === "open";
        return {
          channel,
          createdAt: isOpen ? channel.data.teacher_request_created_at : undefined,
          preview: isOpen ? channel.data.teacher_request_question : undefined,
          teacherRequest: true,
        };
      }

      const message = [...channel.state.messages]
        .reverse()
        .find((item) => isStudentMessage(channel, item));
      return {
        channel,
        createdAt: message?.created_at,
        preview: message?.text,
        teacherRequest: false,
      };
    })
    .filter((thread) => Boolean(thread.preview))
    .sort(
      (first, second) =>
        new Date(second.createdAt ?? 0).getTime() -
        new Date(first.createdAt ?? 0).getTime(),
    );
  const replyChannel = selectedAssignment?.channels.find(
    (channel) => channel.cid === replyChannelCid,
  );
  const groupAssignmentChannel =
    groupAssignmentChannels.find(
      (channel) => channel.cid === selectedGroupChannelCid,
    ) ?? groupAssignmentChannels[0];

  if (!client || loading) return <LoadingDashboard />;

  return (
    <Chat client={client}>
      <div className="grid min-h-[42rem] w-full min-w-0 overflow-hidden bg-white md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0 overflow-hidden border-b-2 border-black bg-[#f4f0e8] md:border-r-2 xl:border-b-0">
          <div className="border-b-2 border-black bg-[#fffc00] px-4 py-4">
            <p className="text-xs font-black uppercase tracking-[0.14em]">Classes</p>
            <p className="mt-1 text-xs font-medium text-zinc-700">Choose a class to review its work.</p>
          </div>
          <div className="grid gap-2 p-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {classes.map((schoolClass) => {
              const assignmentCount = channels.filter(
                (channel) => channel.data?.class_id === schoolClass.id,
              ).reduce((keys, channel) => {
                keys.add(
                  channel.data?.group_assignment_batch_id
                    ? `group:${channel.data.group_assignment_batch_id}`
                    : `${channel.data?.assignment_title}:${channel.data?.due_date}`,
                );
                return keys;
              }, new Set<string>()).size;

              return (
                <button
                  className={`rounded-2xl border-2 border-black p-3 text-left transition hover:-translate-y-0.5 ${
                    selectedClassId === schoolClass.id
                      ? "bg-black text-white shadow-[3px_3px_0_#7b61ff]"
                      : "bg-white shadow-[2px_2px_0_#111]"
                  }`}
                  key={schoolClass.id}
                  onClick={() => {
                    setSelectedClassId(schoolClass.id);
                    setSelectedAssignmentKey("");
                    setTab("overview");
                    setReplyChannelCid("");
                    setSelectedGroupChannelCid("");
                  }}
                  type="button"
                >
                  <span className="flex items-center gap-2 font-black">
                    <School className="size-4" /> {schoolClass.name}
                  </span>
                  <span className={`mt-1 block text-xs ${selectedClassId === schoolClass.id ? "text-zinc-300" : "text-zinc-500"}`}>
                    {schoolClass.studentCount} students · {assignmentCount} published
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={`min-w-0 overflow-hidden bg-white ${selectedAssignment || errorMessage ? "hidden" : "block"}`}>
          <div className="border-b-2 border-black px-5 py-5">
            <p className="text-xl font-black">{selectedClass?.name ?? "Assignments"}</p>
            <p className="mt-1 text-sm text-zinc-500">
              Choose an assignment only when you need to review progress or answer a question.
            </p>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
            {assignments.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-500">
                No assignments have been published to this class yet.
              </p>
            ) : (
              assignments.map((assignment) => {
                const average = Math.round(
                  assignment.channels.reduce(
                    (total, channel) => total + progressPercent(channel),
                    0,
                  ) / assignment.channels.length,
                );
                const unread = assignment.channels.reduce(
                  (total, channel) =>
                    total +
                    (channel.data?.assignment_type === "group"
                      ? channel.data.teacher_request_status === "open"
                        ? 1
                        : 0
                      : channel.countUnread()),
                  0,
                );
                const priority = getAssignmentPriority(assignment.channels[0].data ?? {});

                return (
                  <button
                    className="min-w-0 max-w-full overflow-hidden rounded-2xl border-2 border-zinc-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-black hover:shadow-[3px_3px_0_#111]"
                    key={assignment.key}
                    onClick={() => {
                      setSelectedAssignmentKey(assignment.key);
                      setTab("overview");
                      setReplyChannelCid("");
                      setSelectedGroupChannelCid("");
                    }}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 max-w-full overflow-hidden">
                        <span className="line-clamp-2 block break-words font-black leading-5">{assignment.title}</span>
                        <span className="mt-1 block text-xs capitalize text-zinc-500">
                          {assignment.kind} · {formatDueDate(assignment.dueDate)}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0" />
                    </span>
                    <span className="mt-3 block h-2 overflow-hidden rounded-full bg-zinc-200">
                      <span className="block h-full bg-[#7b61ff]" style={{ width: `${average}%` }} />
                    </span>
                    <span className="mt-1.5 flex items-center justify-between text-xs font-semibold">
                      <span>{average}% class progress</span>
                      {unread > 0 ? (
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-white">{unread} new</span>
                      ) : (
                        <span className={priority.urgency === "critical" ? "text-red-600" : "text-zinc-500"}>{priority.dueLabel}</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <main className={`min-w-0 overflow-hidden bg-[#f4f0e8] ${selectedAssignment || errorMessage ? "block" : "hidden"}`}>
          {errorMessage ? (
            <p className="m-4 rounded-2xl border-2 border-red-600 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">
              {errorMessage}
            </p>
          ) : !selectedAssignment ? (
            <div className="flex min-h-[32rem] items-center justify-center p-6 text-center">
              <div>
                <School className="mx-auto size-10 text-zinc-400" />
                <p className="mt-3 font-black">Select an assignment</p>
                <p className="mt-1 text-sm text-zinc-500">Class progress and student questions will appear here.</p>
              </div>
            </div>
          ) : (
            <>
              <header className="border-b-2 border-black bg-white px-5 py-4">
                <button
                  className="mb-4 flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-1.5 text-xs font-black transition hover:bg-[#fffc00]"
                  onClick={() => {
                    setSelectedAssignmentKey("");
                    setReplyChannelCid("");
                    setSelectedGroupChannelCid("");
                    setTab("overview");
                  }}
                  type="button"
                >
                  <ArrowLeft className="size-4" /> Back to {selectedClass?.name ?? "assignments"}
                </button>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-black tracking-tight">{selectedAssignment.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-500">
                      <span className="capitalize">{selectedAssignment.kind}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><CalendarDays className="size-3.5" /> Due {formatDueDate(selectedAssignment.dueDate)}</span>
                      <span>·</span>
                      <span>
                        {selectedAssignment.channels.length} {isGroupAssignment ? "group" : "student"}
                        {selectedAssignment.channels.length === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <AssignmentManagement
                      assignment={selectedAssignment}
                      onDeleted={(channelCids) => {
                        const deletedCids = new Set(channelCids);
                        setChannels((current) => current.filter((channel) => !deletedCids.has(channel.cid)));
                        setSelectedAssignmentKey("");
                        setReplyChannelCid("");
                        setTab("overview");
                      }}
                      onUpdated={(channelCids, update) => {
                        const updatedCids = new Set(channelCids);
                        setChannels((current) =>
                          current.map((channel) => {
                            if (!updatedCids.has(channel.cid)) return channel;
                            channel.data = {
                              ...channel.data,
                              assignment_kind: update.assignmentKind,
                              assignment_summary: update.assignmentSummary,
                              assignment_title: update.title,
                              due_date: channel.data?.late_amendment
                                ? channel.data.due_date
                                : update.dueDate,
                              name: channel.data?.student_username
                                ? `${update.title} · ${channel.data.student_username}`
                                : update.title,
                            };
                            return channel;
                          }),
                        );
                        setSelectedAssignmentKey(
                          selectedAssignment.channels[0]?.data?.group_assignment_batch_id
                            ? `group:${selectedAssignment.channels[0].data.group_assignment_batch_id}`
                            : `${update.title}:${update.dueDate}:${update.assignmentKind}`,
                        );
                      }}
                      user={user}
                    />
                    <div className="rounded-2xl border-2 border-black bg-[#fffc00] px-4 py-2 text-center shadow-[3px_3px_0_#111]">
                      <p className="text-xl font-black">{averageProgress}%</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider">Class average</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-1 overflow-x-auto rounded-full border-2 border-black bg-[#f4f0e8] p-1">
                  {([
                    ["overview", "Overview"],
                    ["messages", `Notifications (${messageThreads.length})`],
                    ["progress", isGroupAssignment ? "Group progress" : "Student progress"],
                    ...(groupAssignmentChannel
                      ? [["group-chat", "Group chats"] as const]
                      : []),
                  ] as const).map(([value, label]) => (
                    <button
                      className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${tab === value ? "bg-black text-white" : "hover:bg-white"}`}
                      key={value}
                      onClick={() => setTab(value)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </header>

              {tab === "overview" && (
                <section className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border-2 border-black bg-white p-4 shadow-[3px_3px_0_#111] sm:col-span-2 lg:col-span-4">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">Overall class progress</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Average completed streak steps across assigned {isGroupAssignment ? "groups" : "students"}
                        </p>
                      </div>
                      <p className="text-2xl font-black">{averageProgress}%</p>
                    </div>
                    <div className="mt-3 h-4 overflow-hidden rounded-full border-2 border-black bg-zinc-200">
                      <div className="h-full bg-[#7b61ff]" style={{ width: `${averageProgress}%` }} />
                    </div>
                  </div>
                  <div className="rounded-2xl border-2 border-black bg-emerald-100 p-4">
                    <CheckCircle2 className="size-5 text-emerald-700" />
                    <p className="mt-3 text-2xl font-black">{completedStudents}</p>
                    <p className="text-xs font-bold text-emerald-800">Completed</p>
                  </div>
                  <div className="rounded-2xl border-2 border-black bg-amber-100 p-4">
                    <UsersRound className="size-5 text-amber-700" />
                    <p className="mt-3 text-2xl font-black">{selectedAssignment.channels.length - completedStudents - noProgressStudents}</p>
                    <p className="text-xs font-bold text-amber-800">In progress</p>
                  </div>
                  <div className="rounded-2xl border-2 border-black bg-slate-100 p-4">
                    <CircleUserRound className="size-5 text-slate-700" />
                    <p className="mt-3 text-2xl font-black">{noProgressStudents}</p>
                    <p className="text-xs font-bold text-slate-800">Not started</p>
                  </div>
                  <div className={`rounded-2xl border-2 border-black p-4 ${overdueStudents > 0 ? "bg-red-100" : "bg-zinc-100"}`}>
                    <AlertTriangle className={`size-5 ${overdueStudents > 0 ? "text-red-700" : "text-zinc-500"}`} />
                    <p className="mt-3 text-2xl font-black">{overdueStudents}</p>
                    <p className={`text-xs font-bold ${overdueStudents > 0 ? "text-red-800" : "text-zinc-600"}`}>Overdue</p>
                    <p className="mt-1 text-[10px] leading-4 text-zinc-600">
                      {assignmentIsOverdue
                        ? "Past due and below 100%"
                        : "Activates the day after the due date"}
                    </p>
                  </div>
                  {messageThreads.length > 0 && (
                    <button
                      className="flex items-center justify-between rounded-2xl border-2 border-black bg-[#c7b7ff] p-4 text-left shadow-[3px_3px_0_#111] sm:col-span-2 lg:col-span-4"
                      onClick={() => setTab("messages")}
                      type="button"
                    >
                      <span><strong className="block">{messageThreads.length} {isGroupAssignment ? "teacher request" : "student message thread"}{messageThreads.length === 1 ? "" : "s"}</strong><span className="text-xs">Open the notification inbox to respond.</span></span>
                      <Inbox className="size-6" />
                    </button>
                  )}
                </section>
              )}

              {tab === "messages" && (
                <section className="grid min-h-[31rem] lg:grid-cols-[18rem_minmax(0,1fr)]">
                  <div className="border-b-2 border-black bg-white p-3 lg:border-b-0 lg:border-r-2">
                    <p className="mb-3 px-1 text-xs font-black uppercase tracking-wider">Student messages</p>
                    <div className="grid gap-2">
                      {messageThreads.length === 0 ? (
                        <p className="rounded-2xl border-2 border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-500">No student questions yet.</p>
                      ) : (
                        messageThreads.map(({ channel, preview, teacherRequest }) => (
                          <button
                            className={`rounded-2xl border-2 p-3 text-left ${replyChannelCid === channel.cid ? "border-black bg-[#fffbd5]" : "border-zinc-200 bg-white"}`}
                            key={channel.cid}
                            onClick={() => setReplyChannelCid(channel.cid)}
                            type="button"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <strong className="truncate text-sm capitalize">
                                {teacherRequest
                                  ? `Teacher request · ${channel.data?.teacher_request_requested_by_name || "Group"}`
                                  : studentName(channel)}
                              </strong>
                              {channel.countUnread() > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">New</span>}
                            </span>
                            <span className="mt-1 block truncate text-xs text-zinc-600">{preview}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="min-h-[31rem] bg-white">
                    {replyChannel ? (
                      <Channel channel={replyChannel}>
                        <Window>
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black bg-[#c7b7ff] px-4 py-3">
                            <div>
                              <p className="font-black capitalize">
                                {replyChannel.data?.assignment_type === "group"
                                  ? "Group teacher request"
                                  : `Reply to ${studentName(replyChannel)}`}
                              </p>
                              <p className="text-xs">
                                {replyChannel.data?.assignment_type === "group"
                                  ? replyChannel.data.teacher_request_question
                                  : `This response stays attached to ${selectedAssignment.title}.`}
                              </p>
                            </div>
                            <ResolveTeacherRequestButton
                              channel={replyChannel}
                              onResolved={(channelCid) => {
                                setChannels((current) =>
                                  current.map((item) => {
                                    if (item.cid !== channelCid) return item;
                                    item.data = {
                                      ...item.data,
                                      teacher_request_resolved_at: new Date().toISOString(),
                                      teacher_request_status: "resolved",
                                    };
                                    return item;
                                  }),
                                );
                                setReplyChannelCid("");
                              }}
                              user={user}
                            />
                          </div>
                          <MessageList />
                          <MessageComposer />
                        </Window>
                      </Channel>
                    ) : (
                      <div className="flex h-full min-h-[31rem] items-center justify-center p-6 text-center">
                        <div><MessageCircleQuestion className="mx-auto size-9 text-zinc-400" /><p className="mt-3 font-black">Choose a student message</p><p className="mt-1 text-sm text-zinc-500">Their assignment conversation will open here for your reply.</p></div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {tab === "group-chat" && groupAssignmentChannel && (
                <section className="min-h-[34rem] bg-white">
                  {groupAssignmentChannels.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto border-b-2 border-black bg-[#f4f0e8] p-3">
                      {groupAssignmentChannels.map((channel, index) => (
                        <button
                          className={`shrink-0 rounded-full border-2 border-black px-4 py-2 text-xs font-black ${
                            groupAssignmentChannel.cid === channel.cid
                              ? "bg-black text-white"
                              : "bg-white text-black"
                          }`}
                          key={channel.cid}
                          onClick={() => setSelectedGroupChannelCid(channel.cid)}
                          type="button"
                        >
                          {channel.data?.group_name || `Group ${index + 1}`}
                        </button>
                      ))}
                    </div>
                  )}
                  <Channel channel={groupAssignmentChannel}>
                    <Window>
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black bg-[#c7b7ff] px-4 py-3">
                        <div>
                          <p className="font-black">
                            {groupAssignmentChannel.data?.group_name || "Group"} assignment chat
                          </p>
                          <p className="text-xs">
                            View team coordination without receiving notifications for ordinary group messages.
                          </p>
                        </div>
                        <ResolveTeacherRequestButton
                          channel={groupAssignmentChannel}
                          onResolved={(channelCid) => {
                            setChannels((current) =>
                              current.map((item) => {
                                if (item.cid !== channelCid) return item;
                                item.data = {
                                  ...item.data,
                                  teacher_request_resolved_at: new Date().toISOString(),
                                  teacher_request_status: "resolved",
                                };
                                return item;
                              }),
                            );
                          }}
                          user={user}
                        />
                      </div>
                      <MessageList />
                      <MessageComposer />
                    </Window>
                  </Channel>
                </section>
              )}

              {tab === "progress" && (
                <section className="grid gap-3 p-4">
                  {selectedAssignment.channels
                    .slice()
                    .sort((first, second) => {
                      const overdueOrder =
                        Number(isStudentOverdue(second, todayString)) -
                        Number(isStudentOverdue(first, todayString));
                      if (overdueOrder !== 0) return overdueOrder;
                      return progressPercent(first) - progressPercent(second);
                    })
                    .map((channel) => {
                      const completedDays = channel.data?.completed_work_days ?? 0;
                      const targetDays = channel.data?.recommended_work_days ?? 0;
                      const plan = parseDailyPlan(channel);
                      const evidence = channel.state.messages.flatMap((message) =>
                        message.user?.id !== channel.data?.created_by_id
                          ? (message.attachments ?? []).map((attachment) => ({ attachment, message }))
                          : [],
                      );
                      const percent = progressPercent(channel);
                      const urgent = isStudentOverdue(channel, todayString);
                      const progressOwner =
                        channel.data?.assignment_type === "group"
                          ? channel.data?.group_name || "Group progress"
                          : studentName(channel);
                      const groupContributions = parseGroupContributions(channel);
                      const groupStudentIds = parseStringArray(
                        channel.data?.group_student_ids,
                      );

                      return (
                        <details className={`group rounded-2xl border-2 bg-white shadow-[3px_3px_0_#111] ${urgent ? "border-red-700" : "border-black"}`} key={channel.cid}>
                          <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                            <CircleUserRound className="size-8 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <strong className="truncate capitalize">{progressOwner}</strong>
                                {urgent && <span className="rounded-full bg-red-700 px-2 py-0.5 text-[10px] font-black tracking-wider text-white">URGENT</span>}
                              </span>
                              <span className="mt-1 block h-2 overflow-hidden rounded-full bg-zinc-200"><span className={`block h-full ${urgent ? "bg-red-600" : "bg-[#7b61ff]"}`} style={{ width: `${percent}%` }} /></span>
                            </span>
                            <span className="shrink-0 text-right"><strong className="block">{percent}%</strong><span className="text-[10px] text-zinc-500">{completedDays}/{targetDays} steps</span></span>
                            <ChevronRight className="size-4 transition group-open:rotate-90" />
                          </summary>
                          <div className="grid gap-4 border-t-2 border-black bg-[#f4f0e8] p-4 md:grid-cols-2">
                            <div>
                              <p className="text-xs font-black uppercase tracking-wider">Progress so far</p>
                              <p className="mt-2 text-sm leading-6 text-zinc-700">{channel.data?.last_progress_summary || "No reviewed progress has been submitted yet."}</p>
                              {channel.data?.assignment_type === "group" && groupStudentIds.length > 0 && (
                                <div className="mt-3 rounded-xl border border-zinc-300 bg-white p-3">
                                  <p className="text-xs font-black uppercase tracking-wider">Visible member contributions</p>
                                  <div className="mt-2 grid gap-2">
                                    {groupStudentIds.map((studentId) => {
                                      const contribution = groupContributions[studentId];
                                      const memberName =
                                        contribution?.username ||
                                        channel.state.members[studentId]?.user?.name ||
                                        "Student";
                                      return (
                                        <div className="flex items-center justify-between gap-2 text-xs" key={studentId}>
                                          <span className="truncate capitalize">{memberName}</span>
                                          <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${contribution ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>
                                            {contribution
                                              ? `${contribution.submissionCount ?? 1} reviewed`
                                              : "No reviewed evidence"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {channel.data?.remaining_work_summary && <p className="mt-2 rounded-xl bg-white p-3 text-xs leading-5"><strong>Still to do:</strong> {channel.data.remaining_work_summary}</p>}
                              {urgent && channel.data?.student_username && (
                                <StudentDueDateAmendment
                                  channel={channel}
                                  onAmended={(channelCid, originalDueDate, dueDate) => {
                                    setChannels((current) =>
                                      current.map((item) => {
                                        if (item.cid !== channelCid) return item;
                                        item.data = {
                                          ...item.data,
                                          amended_due_date: dueDate,
                                          due_date: dueDate,
                                          late_amendment: true,
                                          original_due_date: originalDueDate,
                                        };
                                        return item;
                                      }),
                                    );
                                  }}
                                  user={user}
                                />
                              )}
                              {plan.length > 0 && (
                                <div className="mt-3 grid gap-1.5 text-xs">
                                  {plan.map((task, index) => (
                                    <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${index < completedDays ? "bg-emerald-100 text-emerald-800" : index === completedDays ? "bg-[#fffbd5] font-bold" : "bg-white text-zinc-500"}`} key={`${index}:${task.title}`}>
                                      {index < completedDays ? <CheckCircle2 className="size-3.5" /> : <span className="flex size-3.5 items-center justify-center rounded-full border border-current text-[9px]">{index + 1}</span>}
                                      <span className="truncate">{task.title || `Step ${index + 1}`}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-black uppercase tracking-wider">Submitted evidence</p>
                              {evidence.length === 0 ? (
                                <p className="mt-2 rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-center text-xs text-zinc-500">No images or documents submitted.</p>
                              ) : (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  {evidence.map(({ attachment }, index) => {
                                    const url = attachment.image_url || attachment.asset_url;
                                    return url ? (
                                      <a className="overflow-hidden rounded-xl border-2 border-black bg-white" href={url} key={`${url}:${index}`} rel="noreferrer" target="_blank">
                                        {attachment.image_url ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img alt={attachment.title || "Student progress evidence"} className="h-24 w-full object-cover" src={attachment.image_url} />
                                        ) : (
                                          <span className="flex h-24 items-center justify-center gap-2 p-2 text-center text-xs font-bold"><FileImage className="size-5" /> {attachment.title || "Open document"}</span>
                                        )}
                                      </a>
                                    ) : null;
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </details>
                      );
                    })}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </Chat>
  );
}
