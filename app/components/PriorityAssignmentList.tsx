"use client";

import { CalendarDays, Clock3, Flame } from "lucide-react";
import { useCallback, useEffect } from "react";
import type {
  Channel,
  ChannelFilters,
  ChannelOptions,
  ChannelSort,
} from "stream-chat";
import { ChannelList, useChatContext } from "stream-chat-react";

import { getAssignmentPriority } from "@/lib/assignment-priority";

type PriorityAssignmentListProps = {
  enabled: boolean;
  filters: ChannelFilters;
  onDailyMinutesChange?: (minutes: number) => void;
  options: ChannelOptions;
  sort: ChannelSort;
};

const urgencyStyles = {
  complete: "bg-emerald-100 text-emerald-700",
  critical: "bg-red-100 text-red-700",
  high: "bg-amber-100 text-amber-800",
  normal: "bg-slate-100 text-slate-600",
};

type DailyMission = {
  estimatedMinutes?: number;
  title?: string;
};

const getCurrentDailyMission = (channel: Channel): DailyMission | null => {
  const dailyPlan = channel.data?.daily_plan;
  if (typeof dailyPlan !== "string") return null;

  try {
    const missions = JSON.parse(dailyPlan) as DailyMission[];
    if (!Array.isArray(missions) || missions.length === 0) return null;

    const completedDays =
      typeof channel.data?.completed_work_days === "number"
        ? channel.data.completed_work_days
        : 0;
    return missions[Math.min(completedDays, missions.length - 1)] ?? null;
  } catch {
    return null;
  }
};

function DailyMinutesReporter({
  channels,
  onDailyMinutesChange,
}: {
  channels: Channel[];
  onDailyMinutesChange?: (minutes: number) => void;
}) {
  const totalMinutes = channels.reduce((total, channel) => {
    const priority = getAssignmentPriority(channel.data ?? {});
    if (priority.completed) return total;

    const estimatedMinutes = getCurrentDailyMission(channel)?.estimatedMinutes;
    return total +
      (typeof estimatedMinutes === "number" ? estimatedMinutes : 0);
  }, 0);

  useEffect(() => {
    onDailyMinutesChange?.(totalMinutes);
  }, [onDailyMinutesChange, totalMinutes]);

  return null;
}

export function PriorityAssignmentList({
  enabled,
  filters,
  onDailyMinutesChange,
  options,
  sort,
}: PriorityAssignmentListProps) {
  const { channel: activeChannel, setActiveChannel } = useChatContext(
    "PriorityAssignmentList",
  );

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
    (channels: Channel[]) => (
      <>
        <DailyMinutesReporter
          channels={channels}
          onDailyMinutesChange={onDailyMinutesChange}
        />
        {channels.map((channel) => {
        const priority = getAssignmentPriority(channel.data ?? {});
        const currentMission = getCurrentDailyMission(channel);
        const unreadCount = channel.countUnread();
        const dueDate =
          typeof channel.data?.due_date === "string"
            ? new Date(`${channel.data.due_date}T00:00:00`).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric" },
              )
            : null;
        const title =
          channel.data?.assignment_title ||
          channel.data?.name ||
          "Assignment";
        const urgencyLabel =
          priority.daysUntilDue !== null && priority.daysUntilDue < 0
            ? "EXTREMELY URGENT"
            : priority.urgency === "critical"
              ? "Do next"
              : priority.urgency === "high"
                ? "High priority"
                : "On track";

        return (
          <button
            aria-current={activeChannel?.cid === channel.cid ? "page" : undefined}
            className="assignment-story-card assignment-sidebar-card w-full p-3 text-left"
            data-active={activeChannel?.cid === channel.cid}
            data-urgency={priority.urgency}
            key={channel.cid}
            onClick={(event) => setActiveChannel(channel, undefined, event)}
            style={{
              backgroundColor: enabled ? priority.color.background : undefined,
              borderLeftColor: enabled ? priority.color.border : "transparent",
            }}
            type="button"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-base font-black text-slate-950">
                  {title}
                </span>
                {currentMission?.title && (
                  <span className="mt-0.5 block truncate text-xs font-semibold text-slate-600">
                    Today: {currentMission.title}
                  </span>
                )}
              </span>
              {unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </span>

            <span className="mt-2 flex flex-wrap items-center gap-1 text-xs">
              <span
                className="rounded-full px-2 py-0.5 font-semibold"
                style={{ color: priority.color.text }}
              >
                {priority.classLabel}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 font-semibold ${urgencyStyles[priority.urgency]}`}
              >
                {urgencyLabel}
              </span>
            </span>

            <span className="mt-2 grid gap-1 text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5 shrink-0" />
                {dueDate
                  ? `Due ${dueDate} · ${priority.dueLabel}`
                  : priority.dueLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock3 className="size-3.5 shrink-0" />
                {typeof currentMission?.estimatedMinutes === "number"
                  ? `Today · ${currentMission.estimatedMinutes} min`
                  : `${priority.remainingMinutes} min remaining`}
              </span>
              {priority.streakStatus === "missed" && (
                <span className="flex items-center gap-1 font-semibold text-red-600">
                  <Flame className="size-3.5" /> Streak reset
                </span>
              )}
            </span>
          </button>
          );
        })}
      </>
    ),
    [activeChannel?.cid, enabled, onDailyMinutesChange, setActiveChannel],
  );

  return (
    <ChannelList
      allowNewMessagesFromUnfilteredChannels={!enabled}
      channelRenderFilterFn={prioritizeChannels}
      filters={filters}
      lockChannelOrder={enabled}
      options={options}
      renderChannels={renderChannels}
      sort={sort}
    />
  );
}
