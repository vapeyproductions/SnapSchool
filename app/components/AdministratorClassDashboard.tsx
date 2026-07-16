"use client";

import type { User } from "firebase/auth";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  FileImage,
  Inbox,
  Loader2,
  MessageCircleQuestion,
  School,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Channel as StreamChannel, ChannelFilters, ChannelSort } from "stream-chat";
import { Channel, Chat, MessageComposer, MessageList, Window } from "stream-chat-react";

import {
  getAdministratorClasses,
  type SchoolClassSummary,
} from "@/actions/stream";
import { getAssignmentPriority } from "@/lib/assignment-priority";

import { useGetStreamClient } from "./useGetStreamClient";

type DashboardTab = "messages" | "overview" | "progress";

type DailyTask = {
  estimatedMinutes?: number;
  title?: string;
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

const formatDueDate = (date?: string) =>
  date
    ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "No due date";

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
  const [replyChannelCid, setReplyChannelCid] = useState("");
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [, refresh] = useState(0);

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
        const dueDate = channel.data?.due_date;
        const kind = channel.data?.assignment_kind || "assignment";
        const key = `${title}:${dueDate ?? "none"}:${kind}`;
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
    : assignments[0]?.key || "";
  const selectedAssignment = assignments.find(
    (assignment) => assignment.key === effectiveAssignmentKey,
  );
  const selectedClass = classes.find((schoolClass) => schoolClass.id === selectedClassId);
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
  const messageThreads = useMemo(
    () =>
      (selectedAssignment?.channels ?? [])
        .map((channel) => ({
          channel,
          message: [...channel.state.messages]
            .reverse()
            .find((message) => isStudentMessage(channel, message)),
        }))
        .filter((thread) => Boolean(thread.message))
        .sort(
          (first, second) =>
            new Date(second.message?.created_at ?? 0).getTime() -
            new Date(first.message?.created_at ?? 0).getTime(),
        ),
    [selectedAssignment],
  );
  const replyChannel = selectedAssignment?.channels.find(
    (channel) => channel.cid === replyChannelCid,
  );

  if (!client || loading) return <LoadingDashboard />;

  return (
    <Chat client={client}>
      <div className="grid min-h-[42rem] bg-white lg:grid-cols-[15rem_19rem_minmax(0,1fr)]">
        <aside className="border-b-2 border-black bg-[#f4f0e8] lg:border-b-0 lg:border-r-2">
          <div className="border-b-2 border-black bg-[#fffc00] px-4 py-4">
            <p className="text-xs font-black uppercase tracking-[0.14em]">Classes</p>
            <p className="mt-1 text-xs font-medium text-zinc-700">Choose a class to review its work.</p>
          </div>
          <div className="grid gap-2 p-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {classes.map((schoolClass) => {
              const assignmentCount = channels.filter(
                (channel) => channel.data?.class_id === schoolClass.id,
              ).reduce((keys, channel) => {
                keys.add(`${channel.data?.assignment_title}:${channel.data?.due_date}`);
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
                    setTab("overview");
                    setReplyChannelCid("");
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

        <aside className="border-b-2 border-black bg-white lg:border-b-0 lg:border-r-2">
          <div className="border-b-2 border-black px-4 py-4">
            <p className="font-black">{selectedClass?.name ?? "Assignments"}</p>
            <p className="mt-1 text-xs text-zinc-500">Published assignments and assessments</p>
          </div>
          <div className="grid gap-2 p-3">
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
                  (total, channel) => total + channel.countUnread(),
                  0,
                );
                const priority = getAssignmentPriority(assignment.channels[0].data ?? {});

                return (
                  <button
                    className={`rounded-2xl border-2 p-3 text-left transition ${
                      effectiveAssignmentKey === assignment.key
                        ? "border-black bg-[#fffbd5] shadow-[3px_3px_0_#111]"
                        : "border-zinc-200 bg-white hover:border-black"
                    }`}
                    key={assignment.key}
                    onClick={() => {
                      setSelectedAssignmentKey(assignment.key);
                      setTab("overview");
                      setReplyChannelCid("");
                    }}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate font-black">{assignment.title}</span>
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
        </aside>

        <main className="min-w-0 bg-[#f4f0e8]">
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-black tracking-tight">{selectedAssignment.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-500">
                      <span className="capitalize">{selectedAssignment.kind}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><CalendarDays className="size-3.5" /> Due {formatDueDate(selectedAssignment.dueDate)}</span>
                      <span>·</span>
                      <span>{selectedAssignment.channels.length} students</span>
                    </p>
                  </div>
                  <div className="rounded-2xl border-2 border-black bg-[#fffc00] px-4 py-2 text-center shadow-[3px_3px_0_#111]">
                    <p className="text-xl font-black">{averageProgress}%</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider">Class average</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-1 overflow-x-auto rounded-full border-2 border-black bg-[#f4f0e8] p-1">
                  {([
                    ["overview", "Overview"],
                    ["messages", `Notifications (${messageThreads.length})`],
                    ["progress", "Student progress"],
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
                <section className="grid gap-4 p-4 sm:grid-cols-3">
                  <div className="rounded-2xl border-2 border-black bg-white p-4 shadow-[3px_3px_0_#111] sm:col-span-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">Overall class progress</p>
                        <p className="mt-1 text-xs text-zinc-500">Average completed streak steps across assigned students</p>
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
                  <div className="rounded-2xl border-2 border-black bg-red-100 p-4">
                    <AlertTriangle className="size-5 text-red-700" />
                    <p className="mt-3 text-2xl font-black">{noProgressStudents}</p>
                    <p className="text-xs font-bold text-red-800">Not started</p>
                  </div>
                  {messageThreads.length > 0 && (
                    <button
                      className="flex items-center justify-between rounded-2xl border-2 border-black bg-[#c7b7ff] p-4 text-left shadow-[3px_3px_0_#111] sm:col-span-3"
                      onClick={() => setTab("messages")}
                      type="button"
                    >
                      <span><strong className="block">{messageThreads.length} student message thread{messageThreads.length === 1 ? "" : "s"}</strong><span className="text-xs">Open the notification inbox to respond.</span></span>
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
                        messageThreads.map(({ channel, message }) => (
                          <button
                            className={`rounded-2xl border-2 p-3 text-left ${replyChannelCid === channel.cid ? "border-black bg-[#fffbd5]" : "border-zinc-200 bg-white"}`}
                            key={channel.cid}
                            onClick={() => setReplyChannelCid(channel.cid)}
                            type="button"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <strong className="truncate text-sm capitalize">{studentName(channel)}</strong>
                              {channel.countUnread() > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">New</span>}
                            </span>
                            <span className="mt-1 block truncate text-xs text-zinc-600">{message?.text}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="min-h-[31rem] bg-white">
                    {replyChannel ? (
                      <Channel channel={replyChannel}>
                        <Window>
                          <div className="border-b-2 border-black bg-[#c7b7ff] px-4 py-3">
                            <p className="font-black capitalize">Reply to {studentName(replyChannel)}</p>
                            <p className="text-xs">This response stays attached to {selectedAssignment.title}.</p>
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

              {tab === "progress" && (
                <section className="grid gap-3 p-4">
                  {selectedAssignment.channels
                    .slice()
                    .sort((first, second) => progressPercent(first) - progressPercent(second))
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

                      return (
                        <details className="group rounded-2xl border-2 border-black bg-white shadow-[3px_3px_0_#111]" key={channel.cid}>
                          <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                            <CircleUserRound className="size-8 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate capitalize">{studentName(channel)}</strong>
                              <span className="mt-1 block h-2 overflow-hidden rounded-full bg-zinc-200"><span className="block h-full bg-[#7b61ff]" style={{ width: `${percent}%` }} /></span>
                            </span>
                            <span className="shrink-0 text-right"><strong className="block">{percent}%</strong><span className="text-[10px] text-zinc-500">{completedDays}/{targetDays} steps</span></span>
                            <ChevronRight className="size-4 transition group-open:rotate-90" />
                          </summary>
                          <div className="grid gap-4 border-t-2 border-black bg-[#f4f0e8] p-4 md:grid-cols-2">
                            <div>
                              <p className="text-xs font-black uppercase tracking-wider">Progress so far</p>
                              <p className="mt-2 text-sm leading-6 text-zinc-700">{channel.data?.last_progress_summary || "No reviewed progress has been submitted yet."}</p>
                              {channel.data?.remaining_work_summary && <p className="mt-2 rounded-xl bg-white p-3 text-xs leading-5"><strong>Still to do:</strong> {channel.data.remaining_work_summary}</p>}
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
