"use client";

import { AlertTriangle, CheckCircle2, MessageCircle, UserMinus } from "lucide-react";
import { useCallback } from "react";
import type { ReactNode } from "react";
import type {
  Channel,
  ChannelFilters,
  ChannelOptions,
  ChannelSort,
} from "stream-chat";
import { ChannelList } from "stream-chat-react";

import { getAssignmentPriority } from "@/lib/assignment-priority";

export type TeacherGrouping = "assignment" | "class";

type TeacherAssignmentListProps = {
  filters: ChannelFilters;
  grouping: TeacherGrouping;
  options: ChannelOptions;
  sort: ChannelSort;
};

type StudentStatus = "behind" | "complete" | "no-submission" | "on-track";

const statusRank: Record<StudentStatus, number> = {
  behind: 0,
  "no-submission": 1,
  "on-track": 2,
  complete: 3,
};

const statusStyles: Record<StudentStatus, string> = {
  behind: "bg-red-100 text-red-700",
  complete: "bg-emerald-100 text-emerald-700",
  "no-submission": "bg-slate-200 text-slate-700",
  "on-track": "bg-blue-100 text-blue-700",
};

const getStudentStatus = (channel: Channel): StudentStatus => {
  const priority = getAssignmentPriority(channel.data ?? {});
  if (priority.completed) return "complete";
  if ((channel.data?.completed_work_days ?? 0) === 0) return "no-submission";
  if (
    (priority.daysUntilDue !== null && priority.daysUntilDue < 0) ||
    priority.streakStatus === "missed" ||
    priority.minutesPerAvailableDay >= 60
  ) {
    return "behind";
  }
  return "on-track";
};

const statusLabel: Record<StudentStatus, string> = {
  behind: "Behind",
  complete: "Complete",
  "no-submission": "No submission",
  "on-track": "On track",
};

const latestStudentMessage = (channel: Channel) => {
  const creatorId = channel.data?.created_by_id;
  return [...channel.state.messages]
    .reverse()
    .find(
      (message) =>
        message.user?.id &&
        message.user.id !== creatorId &&
        message.text?.trim() &&
        !message.text.startsWith("🤖 AI progress review:"),
    );
};

export function TeacherAssignmentList({
  filters,
  grouping,
  options,
  sort,
}: TeacherAssignmentListProps) {
  const orderChannels = useCallback(
    (channels: Channel[]) =>
      [...channels].sort((first, second) => {
        const firstGroup = grouping === "class"
          ? first.data?.class_name || "Individual assignments"
          : first.data?.assignment_title || first.data?.name || "Assignment";
        const secondGroup = grouping === "class"
          ? second.data?.class_name || "Individual assignments"
          : second.data?.assignment_title || second.data?.name || "Assignment";
        const groupOrder = firstGroup.localeCompare(secondGroup);
        if (groupOrder !== 0) return groupOrder;
        const statusOrder =
          statusRank[getStudentStatus(first)] - statusRank[getStudentStatus(second)];
        if (statusOrder !== 0) return statusOrder;
        return (first.data?.student_username ?? "").localeCompare(
          second.data?.student_username ?? "",
        );
      }),
    [grouping],
  );

  const getLatestMessagePreview = useCallback((channel: Channel) => {
    const status = getStudentStatus(channel);
    const priority = getAssignmentPriority(channel.data ?? {});
    const studentMessage = latestStudentMessage(channel);
    const hasQuestion = studentMessage?.text?.includes("?");
    const unread = channel.countUnread();

    return (
      <span className="mt-1 block space-y-1 text-xs">
        <span className="flex flex-wrap items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${statusStyles[status]}`}>
            {statusLabel[status]}
          </span>
          <span className="text-slate-500">{priority.dueLabel}</span>
          {unread > 0 && (
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 font-semibold text-white">
              {unread} new
            </span>
          )}
        </span>
        <span className="block truncate text-slate-600">
          {studentMessage?.text ? (
            <>
              <MessageCircle className="mr-1 inline size-3" />
              {hasQuestion ? "Question: " : "Student: "}
              {studentMessage.text}
            </>
          ) : status === "no-submission" ? (
            <><UserMinus className="mr-1 inline size-3" /> No progress or message yet</>
          ) : status === "behind" ? (
            <><AlertTriangle className="mr-1 inline size-3" /> Needs follow-up</>
          ) : (
            <><CheckCircle2 className="mr-1 inline size-3" /> No unanswered question</>
          )}
        </span>
      </span>
    );
  }, []);

  const renderChannels = useCallback(
    (channels: Channel[], channelPreview: (channel: Channel) => ReactNode) => {
      const groups = new Map<string, Channel[]>();

      for (const channel of channels) {
        const groupKey = grouping === "class"
          ? channel.data?.class_name || "Individual assignments"
          : `${channel.data?.class_id || "individual"}:${channel.data?.assignment_title || channel.data?.name || "Assignment"}`;
        groups.set(groupKey, [...(groups.get(groupKey) ?? []), channel]);
      }

      return [...groups.entries()].map(([groupKey, groupChannels]) => {
        const first = groupChannels[0];
        const label = grouping === "class"
          ? first.data?.class_name || "Individual assignments"
          : first.data?.assignment_title || first.data?.name || "Assignment";
        const secondary = grouping === "assignment"
          ? first.data?.class_name || "Individual"
          : `${groupChannels.length} student assignment${groupChannels.length === 1 ? "" : "s"}`;
        const statuses = groupChannels.map(getStudentStatus);
        const needsAttention = statuses.filter(
          (status) => status === "behind" || status === "no-submission",
        ).length;
        const color = getAssignmentPriority(first.data ?? {}).color;

        return (
          <section className="border-b border-slate-200" key={groupKey}>
            <div
              className="border-l-4 px-3 py-2"
              style={{ backgroundColor: color.background, borderLeftColor: color.border }}
            >
              <p className="truncate text-xs font-bold" style={{ color: color.text }}>
                {label}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                {secondary}
                {needsAttention > 0 && (
                  <span className="ml-1 font-semibold text-red-600">· {needsAttention} need attention</span>
                )}
              </p>
            </div>
            {groupChannels.map((channel) => (
              <div className="border-l-4" key={channel.cid} style={{ borderLeftColor: color.border }}>
                {channelPreview(channel)}
              </div>
            ))}
          </section>
        );
      });
    },
    [grouping],
  );

  return (
    <ChannelList
      allowNewMessagesFromUnfilteredChannels={false}
      channelRenderFilterFn={orderChannels}
      filters={filters}
      getLatestMessagePreview={getLatestMessagePreview}
      lockChannelOrder
      options={options}
      renderChannels={renderChannels}
      sort={sort}
    />
  );
}
