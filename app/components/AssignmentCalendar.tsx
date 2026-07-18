"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
} from "lucide-react";
import {
  type FocusEvent,
  type MouseEvent,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { AssignmentTask } from "@/lib/assignment-analysis";
import { getClassColor } from "@/lib/assignment-priority";

export type CalendarAssignment = {
  classId?: string;
  className: string;
  completedSteps: number;
  currentMission?: string | null;
  dailyPlan: AssignmentTask[];
  dueDate: string;
  id: string;
  ownerName?: string;
  targetSteps: number;
  title: string;
};

type CalendarItem = {
  assignment: CalendarAssignment;
  date: string;
  task: AssignmentTask | null;
  type: "deadline" | "mission";
};

type CalendarTooltip = {
  color: ReturnType<typeof getClassColor>;
  item: CalendarItem;
  left: number;
  top: number;
};

const DAY_MS = 86_400_000;
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const dateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

const parseDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const buildCalendarItems = (
  assignment: CalendarAssignment,
  today: Date,
): CalendarItem[] => {
  const dueDate = parseDate(assignment.dueDate);
  const complete =
    assignment.targetSteps > 0 &&
    assignment.completedSteps >= assignment.targetSteps;
  const items: CalendarItem[] = [];

  if (dueDate) {
    items.push({
      assignment,
      date: dateKey(dueDate),
      task: null,
      type: "deadline",
    });
  }
  if (complete) return items;

  const remainingTasks = assignment.dailyPlan.slice(assignment.completedSteps);
  if (remainingTasks.length === 0) {
    if (assignment.currentMission) {
      items.push({
        assignment,
        date: dateKey(today),
        task: {
          dayNumber: assignment.completedSteps + 1,
          description: assignment.currentMission,
          estimatedMinutes: 0,
          title: "Current mission",
        },
        type: "mission",
      });
    }
    return items;
  }

  const todayTime = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const availableSpan = dueDate
    ? Math.max(0, Math.round((dueDate.getTime() - todayTime) / DAY_MS))
    : Math.max(0, remainingTasks.length - 1);

  remainingTasks.forEach((task, index) => {
    const offset = remainingTasks.length === 1
      ? 0
      : Math.round((index * availableSpan) / (remainingTasks.length - 1));
    items.push({
      assignment,
      date: dateKey(addDays(today, offset)),
      task,
      type: "mission",
    });
  });

  return items;
};

export default function AssignmentCalendar({
  assignments,
  description = "Hover over a mission for details. Select it to open the assignment.",
  emptyMessage = "No assignments are scheduled yet.",
  onAssignmentSelect,
  title = "Learning calendar",
}: {
  assignments: CalendarAssignment[];
  description?: string;
  emptyMessage?: string;
  onAssignmentSelect: (assignmentId: string) => void;
  title?: string;
}) {
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [tooltip, setTooltip] = useState<CalendarTooltip | null>(null);
  const todayKey = dateKey(today);
  const items = useMemo(
    () => assignments.flatMap((assignment) => buildCalendarItems(assignment, today)),
    [assignments, today],
  );
  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();
    items.forEach((item) => {
      grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]);
    });
    return grouped;
  }, [items]);

  const days = useMemo(() => {
    const monthStart = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const gridStart = addDays(monthStart, -monthStart.getDay());
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [visibleMonth]);

  const moveMonth = (offset: number) => {
    setVisibleMonth((current) =>
      new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  };

  const showTooltip = (
    event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>,
    item: CalendarItem,
    color: ReturnType<typeof getClassColor>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = 256;
    const estimatedHeight = 210;
    const left = Math.min(
      Math.max(12, rect.left + rect.width / 2 - tooltipWidth / 2),
      window.innerWidth - tooltipWidth - 12,
    );
    const below = rect.bottom + 8;
    const top = below + estimatedHeight <= window.innerHeight
      ? below
      : Math.max(12, rect.top - estimatedHeight - 8);
    setTooltip({ color, item, left, top });
  };

  return (
    <>
    <section className="min-w-0 bg-[#f4f0e8] p-3 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <CalendarDays className="size-6 text-[#7b61ff]" /> {title}
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-500">
            {description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Previous month"
            className="flex size-10 items-center justify-center rounded-full border-2 border-black bg-white hover:bg-[#fffc00]"
            onClick={() => moveMonth(-1)}
            type="button"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            className="min-w-36 rounded-full border-2 border-black bg-white px-4 py-2 text-sm font-black"
            onClick={() => setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
            type="button"
          >
            {visibleMonth.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </button>
          <button
            aria-label="Next month"
            className="flex size-10 items-center justify-center rounded-full border-2 border-black bg-white hover:bg-[#fffc00]"
            onClick={() => moveMonth(1)}
            type="button"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="flex min-h-80 items-center justify-center rounded-[2rem] border-2 border-dashed border-zinc-300 bg-white p-8 text-center text-sm font-semibold text-zinc-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[1.75rem] border-2 border-black bg-white shadow-[5px_5px_0_#111]">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 border-b-2 border-black bg-black text-white">
              {weekdays.map((weekday) => (
                <div className="px-2 py-2 text-center text-[11px] font-black uppercase tracking-[0.14em]" key={weekday}>
                  {weekday}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = dateKey(day);
                const dayItems = itemsByDate.get(key) ?? [];
                const outsideMonth = day.getMonth() !== visibleMonth.getMonth();
                return (
                  <div
                    className={`min-h-32 border-b border-r border-zinc-300 p-1.5 ${outsideMonth ? "bg-zinc-50 text-zinc-400" : "bg-white"}`}
                    key={key}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`flex size-7 items-center justify-center rounded-full text-xs font-black ${key === todayKey ? "bg-[#fffc00] text-black ring-2 ring-black" : ""}`}>
                        {day.getDate()}
                      </span>
                      {dayItems.some((item) => item.type === "deadline") && (
                        <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[8px] font-black tracking-wide text-white">DUE</span>
                      )}
                    </div>
                    <div className="grid gap-1">
                      {dayItems.map((item, index) => {
                        const color = getClassColor(
                          item.assignment.classId,
                          item.assignment.className,
                        );
                        const isDeadline = item.type === "deadline";
                        return (
                          <button
                            className="relative w-full rounded-lg border-l-4 px-2 py-1.5 text-left text-[10px] font-bold leading-3.5 shadow-sm transition hover:z-20 hover:-translate-y-0.5 hover:ring-2 hover:ring-black"
                            key={`${item.assignment.id}:${item.type}:${index}`}
                            onBlur={() => setTooltip(null)}
                            onClick={() => onAssignmentSelect(item.assignment.id)}
                            onFocus={(event) => showTooltip(event, item, color)}
                            onMouseEnter={(event) => showTooltip(event, item, color)}
                            onMouseLeave={() => setTooltip(null)}
                            style={{
                              backgroundColor: isDeadline ? "#fee2e2" : color.background,
                              borderLeftColor: isDeadline ? "#dc2626" : color.border,
                              color: isDeadline ? "#991b1b" : color.text,
                            }}
                            type="button"
                          >
                            <span className="flex items-start gap-1">
                              {isDeadline ? <Flag className="mt-0.5 size-3 shrink-0" /> : <Clock3 className="mt-0.5 size-3 shrink-0" />}
                              <span className="line-clamp-2">
                                {isDeadline ? `Due: ${item.assignment.title}` : item.task?.title}
                                {item.assignment.ownerName ? ` · ${item.assignment.ownerName}` : ""}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
      {tooltip && typeof document !== "undefined" && createPortal(
        <div
          className="pointer-events-none fixed z-[100] w-64 rounded-xl border-2 border-black bg-white p-3 text-left text-xs font-medium leading-5 text-black shadow-[4px_4px_0_#111]"
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <strong className="block text-sm font-black">{tooltip.item.assignment.title}</strong>
          <span className="mt-0.5 block font-bold" style={{ color: tooltip.color.text }}>
            {tooltip.item.assignment.className}
          </span>
          {tooltip.item.assignment.ownerName && (
            <span className="mt-0.5 block capitalize text-zinc-500">
              {tooltip.item.assignment.ownerName}
            </span>
          )}
          {tooltip.item.type === "deadline" ? (
            <span className="mt-2 block font-black text-red-700">Assignment due today</span>
          ) : (
            <>
              <span className="mt-2 block font-black">
                Day {tooltip.item.task?.dayNumber}: {tooltip.item.task?.title}
              </span>
              <span className="mt-1 block text-zinc-600">{tooltip.item.task?.description}</span>
              {Boolean(tooltip.item.task?.estimatedMinutes) && (
                <span className="mt-2 block font-black">About {tooltip.item.task?.estimatedMinutes} minutes</span>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
