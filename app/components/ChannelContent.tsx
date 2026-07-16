"use client";

import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { ClipboardList, MessageCircleQuestion } from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MessageComposer,
  MessageList,
  useChannelStateContext,
  Window,
} from "stream-chat-react";

import db from "@/lib/firebase";
import {
  getUsernameById,
  isSameUTCDate,
  updateChatStreak,
} from "@/lib/server";
import { AssignmentPlanPanel } from "./AssignmentPlanPanel";
import AuthContext from "./AuthContext";
import { StudentProgressSubmission } from "./StudentProgressSubmission";

type ChannelContentProps = {
  user: User;
  setReminderMessage: Dispatch<SetStateAction<string>>;
  setStreakReminder: Dispatch<SetStateAction<boolean>>;
};

type AssignmentView = "messages" | "plan";

export function ChannelContent({
  user,
  setReminderMessage,
  setStreakReminder,
}: ChannelContentProps) {
  const { role } = useContext(AuthContext);
  const { channel, members = {}, messages = [] } = useChannelStateContext(
    "ChannelContent",
  );
  const [viewState, setViewState] = useState<{
    channelCid: string;
    view: AssignmentView;
  }>(() => ({ channelCid: channel.cid, view: "plan" }));
  const view =
    viewState.channelCid === channel.cid ? viewState.view : "plan";
  const changeView = (nextView: AssignmentView) => {
    setViewState({ channelCid: channel.cid, view: nextView });
  };
  const [currentStreak, setCurrentStreak] = useState(0);
  const [completedWorkDays, setCompletedWorkDays] = useState(0);
  const [syncError, setSyncError] = useState("");
  const completedDayRef = useRef("");
  const reminderStateRef = useRef("");

  const memberIDs = useMemo(
    () =>
      Object.values(members)
        .map((member) => member.user_id)
        .filter((memberId): memberId is string => Boolean(memberId)),
    [members],
  );
  const otherMemberId = useMemo(
    () => memberIDs.find((memberId) => memberId !== user.uid),
    [memberIDs, user.uid],
  );
  const otherUsername = useMemo(
    () =>
      otherMemberId
        ? getUsernameById(members, otherMemberId)
        : null,
    [members, otherMemberId],
  );
  const targetDays =
    typeof channel.data?.recommended_work_days === "number"
      ? channel.data.recommended_work_days
      : undefined;
  const dueDate =
    typeof channel.data?.due_date === "string"
      ? channel.data.due_date
      : undefined;
  const targetCompleted = targetDays !== undefined && currentStreak >= targetDays;
  const assignmentTitle =
    channel.data?.assignment_title || channel.data?.name || "Assignment";
  const isAssessment = ["exam", "quiz", "test"].includes(
    channel.data?.assignment_kind ?? "",
  );

  useEffect(() => {
    if (!channel.cid) return;

    const streakRef = doc(db, "channels", channel.cid);
    const unsubscribe = onSnapshot(
      streakRef,
      (snapshot) => {
        const streak = snapshot.data()?.currentStreak;
        const storedStreak = typeof streak === "number" ? streak : 0;
        const lastProgressDate = snapshot.data()?.lastProgressDate;
        const today = new Date();
        const todayUTC = Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate(),
        );
        const lastProgressTime =
          typeof lastProgressDate === "string"
            ? new Date(`${lastProgressDate}T00:00:00Z`).getTime()
            : Number.NaN;
        const missedAtLeastOneDay =
          !Number.isNaN(lastProgressTime) &&
          Math.floor((todayUTC - lastProgressTime) / 86400000) > 1;
        const nextStreak = missedAtLeastOneDay ? 0 : storedStreak;
        const completed = snapshot.data()?.completedWorkDays;
        setCurrentStreak(nextStreak);
        setCompletedWorkDays(typeof completed === "number" ? completed : nextStreak);
        setSyncError("");
      },
      () => {
        setSyncError("Unable to load this streak right now");
      },
    );

    return unsubscribe;
  }, [channel.cid]);

  useEffect(() => {
    if (!channel.cid || memberIDs.length < 2) return;

    // AI-planned assignments are completed by reviewed progress evidence,
    // not merely by exchanging messages in the chat.
    if (channel.data?.daily_plan) return;

    if (targetCompleted) {
      setStreakReminder(false);
      return;
    }

    const [userA, userB] = memberIDs;
    const today = new Date();
    const todayString = today.toISOString().split("T")[0];
    const sentMessageToday = (memberId: string) =>
      messages.some((message) => {
        if (message.user?.id !== memberId || !message.created_at) return false;

        const messageDate =
          message.created_at instanceof Date
            ? message.created_at
            : new Date(message.created_at);

        return (
          !Number.isNaN(messageDate.getTime()) &&
          isSameUTCDate(messageDate, today)
        );
      });
    const userAMessagedToday = sentMessageToday(userA);
    const userBMessagedToday = sentMessageToday(userB);
    const dailyKey = `${channel.cid}:${todayString}`;

    if (userAMessagedToday && userBMessagedToday) {
      setStreakReminder(false);

      if (completedDayRef.current === dailyKey) return;
      completedDayRef.current = dailyKey;

      void updateChatStreak(channel.cid, today, targetDays).catch(() => {
        completedDayRef.current = "";
        setSyncError("Messages sent, but the streak could not be updated");
      });
      return;
    }

    const memberAName = getUsernameById(members, userA) ?? "the first member";
    const memberBName = getUsernameById(members, userB) ?? "the second member";
    let reminderMessage = "";

    if (!userAMessagedToday && !userBMessagedToday) {
      reminderMessage = `Streak pending: Both ${memberAName} and ${memberBName} need to send a message today.`;
    } else if (user.uid === userA && !userAMessagedToday) {
      reminderMessage = `Streak pending: Send a message to ${memberBName}.`;
    } else if (user.uid === userB && !userBMessagedToday) {
      reminderMessage = `Streak pending: Send a message to ${memberAName}.`;
    } else if (user.uid === userA && !userBMessagedToday) {
      reminderMessage = `Streak pending: Waiting for ${memberBName}.`;
    } else if (user.uid === userB && !userAMessagedToday) {
      reminderMessage = `Streak pending: Waiting for ${memberAName}.`;
    }

    const reminderKey = `${dailyKey}:${userAMessagedToday}:${userBMessagedToday}`;

    if (reminderMessage && reminderStateRef.current !== reminderKey) {
      reminderStateRef.current = reminderKey;
      setReminderMessage(reminderMessage);
      setStreakReminder(true);
    }
  }, [
    channel.cid,
    channel.data?.daily_plan,
    memberIDs,
    members,
    messages,
    setReminderMessage,
    setStreakReminder,
    targetCompleted,
    targetDays,
    user.uid,
  ]);

  const showReminder = () => {
    const recipient = otherUsername ?? "your streak partner";
    const streakSummary =
      currentStreak > 0
        ? ` Your current streak is ${currentStreak} day${
            currentStreak === 1 ? "" : "s"
          }.`
        : "";

    setReminderMessage(
      `Keep making daily progress with ${recipient}.${streakSummary}`,
    );
    setStreakReminder(true);
  };

  return (
    <Window>
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-950">
                {assignmentTitle}
              </p>
              <p className="text-xs text-slate-500">
                {channel.data?.class_name || "Individual assignment"}
                {dueDate &&
                  ` · Due ${new Date(`${dueDate}T00:00:00`).toLocaleDateString()}`}
              </p>
            </div>

            <div className="grid shrink-0 grid-cols-2 rounded-xl bg-slate-100 p-1">
              <button
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  view === "plan"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-950"
                }`}
                onClick={() => changeView("plan")}
                type="button"
              >
                <ClipboardList className="size-4" />
                {isAssessment ? "Study plan" : "Assignment plan"}
              </button>
              <button
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  view === "messages"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-950"
                }`}
                onClick={() => changeView("messages")}
                type="button"
              >
                <MessageCircleQuestion className="size-4" />
                {role === "student" ? "Ask teacher" : "Messages"}
              </button>
            </div>
          </div>
        </header>

        {view === "plan" ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2">
              <p className="text-sm font-medium text-zinc-700">
                🔥 {currentStreak} day streak
                {targetDays && (
                  <span className="ml-2 font-normal text-zinc-500">
                    · Assignment {completedWorkDays} / {targetDays} work days
                  </span>
                )}
              </p>
              <button
                className="shrink-0 rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
                onClick={showReminder}
                type="button"
              >
                Streak reminder
              </button>
            </div>
            {syncError && (
              <p
                className="bg-red-50 px-4 py-2 text-sm text-red-700"
                role="alert"
              >
                {syncError}
              </p>
            )}
            <AssignmentPlanPanel
              completedDays={completedWorkDays}
              onOpenMessages={() => changeView("messages")}
            />
            <StudentProgressSubmission />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="shrink-0 border-b border-indigo-100 bg-indigo-50 px-4 py-2.5 text-xs leading-5 text-indigo-900">
              {role === "student"
                ? "Ask your teacher a question about this assignment. Your conversation stays attached to this work."
                : "Answer student questions and discuss this assignment here."}
            </div>
            <MessageList />
            <MessageComposer />
          </div>
        )}
      </div>
    </Window>
  );
}
