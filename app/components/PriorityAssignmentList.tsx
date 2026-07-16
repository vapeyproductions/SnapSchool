"use client";

import { AlertTriangle, CheckCircle2, Clock3, Flame } from "lucide-react";
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

type PriorityAssignmentListProps = {
  enabled: boolean;
  filters: ChannelFilters;
  options: ChannelOptions;
  sort: ChannelSort;
};

const urgencyStyles = {
  complete: "bg-emerald-100 text-emerald-700",
  critical: "bg-red-100 text-red-700",
  high: "bg-amber-100 text-amber-800",
  normal: "bg-slate-100 text-slate-600",
};

export function PriorityAssignmentList({
  enabled,
  filters,
  options,
  sort,
}: PriorityAssignmentListProps) {
  const prioritizeChannels = useCallback(
    (channels: Channel[]) => {
      if (!enabled) return channels;
      return channels
        .filter(
          (channel) => !getAssignmentPriority(channel.data ?? {}).completed,
        )
        .sort((first, second) => {
          const priorityDifference =
            getAssignmentPriority(second.data ?? {}).score -
            getAssignmentPriority(first.data ?? {}).score;
          if (priorityDifference !== 0) return priorityDifference;
          return (first.data?.name ?? "").localeCompare(
            second.data?.name ?? "",
          );
        });
    },
    [enabled],
  );

  const renderChannels = useCallback(
    (channels: Channel[], channelPreview: (channel: Channel) => ReactNode) =>
      channels.map((channel) => {
        const priority = getAssignmentPriority(channel.data ?? {});
        return (
          <div
            className="assignment-story-card"
            data-urgency={priority.urgency}
            key={channel.cid}
            style={{
              backgroundColor: enabled ? priority.color.background : undefined,
              borderLeftColor: enabled ? priority.color.border : "transparent",
            }}
          >
            {channelPreview(channel)}
          </div>
        );
      }),
    [enabled],
  );

  const getLatestMessagePreview = useCallback(
    (channel: Channel) => {
      if (!enabled) return undefined;
      const priority = getAssignmentPriority(channel.data ?? {});
      const urgencyLabel = priority.urgency === "complete"
        ? "Complete"
        : priority.daysUntilDue !== null && priority.daysUntilDue < 0
          ? "EXTREMELY URGENT"
        : priority.urgency === "critical"
          ? "Do next"
          : priority.urgency === "high"
            ? "High priority"
            : "On track";

      return (
        <span className="mt-1 block space-y-1 text-xs">
          <span className="flex flex-wrap items-center gap-1">
            <span
              className="rounded-full px-2 py-0.5 font-semibold"
              style={{
                backgroundColor: priority.color.background,
                color: priority.color.text,
              }}
            >
              {priority.classLabel}
            </span>
            <span className={`rounded-full px-2 py-0.5 font-semibold ${urgencyStyles[priority.urgency]}`}>
              {urgencyLabel}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-500">
            <span className="flex items-center gap-1">
              {priority.urgency === "complete" ? <CheckCircle2 className="size-3" /> : priority.urgency === "critical" ? <AlertTriangle className="size-3" /> : <Clock3 className="size-3" />}
              {priority.dueLabel}
            </span>
            <span>{priority.remainingMinutes} min left</span>
            {priority.streakStatus === "missed" && <span className="flex items-center gap-1 font-semibold text-red-600"><Flame className="size-3" /> Streak reset</span>}
          </span>
        </span>
      );
    },
    [enabled],
  );

  return (
    <ChannelList
      allowNewMessagesFromUnfilteredChannels={!enabled}
      channelRenderFilterFn={prioritizeChannels}
      filters={filters}
      getLatestMessagePreview={getLatestMessagePreview}
      lockChannelOrder={enabled}
      options={options}
      renderChannels={renderChannels}
      sort={sort}
    />
  );
}
