"use client";

import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Check, ClipboardList, Loader2, MessageCircleQuestion, Pencil, Trash2, UsersRound, X } from "lucide-react";
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
  useChatContext,
  useChannelStateContext,
  Window,
} from "stream-chat-react";

import db from "@/lib/firebase";
import {
  deletePublishedAssignment,
  renameStudentGroup,
  syncStudentGroupMemberNames,
} from "@/actions/stream";
import {
  getUsernameById,
  isSameUTCDate,
  updateChatStreak,
} from "@/lib/server";
import { AssignmentPlanPanel } from "./AssignmentPlanPanel";
import AuthContext from "./AuthContext";
import { StudentProgressSubmission } from "./StudentProgressSubmission";
import { RequestTeacherButton } from "./RequestTeacherButton";

type ChannelContentProps = {
  user: User;
  setReminderMessage: Dispatch<SetStateAction<string>>;
  setStreakReminder: Dispatch<SetStateAction<boolean>>;
};

type AssignmentView = "messages" | "plan";
const EMPTY_DISPLAY_NAMES: Record<string, string> = {};

const parseMemberIds = (value: unknown): string[] => {
  if (typeof value !== "string") return [];
  try {
    const ids = JSON.parse(value) as unknown;
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string" && Boolean(id))
      : [];
  } catch {
    return [];
  }
};

export function ChannelContent({
  user,
  setReminderMessage,
  setStreakReminder,
}: ChannelContentProps) {
  const { role } = useContext(AuthContext);
  const { setActiveChannel } = useChatContext("ChannelContent");
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingGroupName, setIsSavingGroupName] = useState(false);
  const [groupNameEditor, setGroupNameEditor] = useState({
    channelCid: "",
    draft: "",
    error: "",
    open: false,
  });
  const [localGroupName, setLocalGroupName] = useState<{
    channelCid: string;
    name: string;
  } | null>(null);
  const [syncedGroupDetails, setSyncedGroupDetails] = useState<{
    administratorIds: string[];
    channelCid: string;
    namesById: Record<string, string>;
    studentIds: string[];
  } | null>(null);
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
  const isGroupAssignment = channel.data?.assignment_type === "group";
  const storedGroupName =
    typeof channel.data?.group_name === "string"
      ? channel.data.group_name
      : "Group";
  const groupName =
    localGroupName?.channelCid === channel.cid
      ? localGroupName.name
      : storedGroupName;
  const groupNameEditorApplies = groupNameEditor.channelCid === channel.cid;
  const isEditingGroupName = groupNameEditorApplies && groupNameEditor.open;
  const groupNameDraft = groupNameEditorApplies
    ? groupNameEditor.draft
    : groupName;
  const groupNameError = groupNameEditorApplies ? groupNameEditor.error : "";
  const storedGroupStudentIds = useMemo(
    () => parseMemberIds(channel.data?.group_student_ids),
    [channel.data?.group_student_ids],
  );
  const storedGroupAdministratorIds = useMemo(
    () => parseMemberIds(channel.data?.group_administrator_ids),
    [channel.data?.group_administrator_ids],
  );
  const syncedGroupDetailsApply = syncedGroupDetails?.channelCid === channel.cid;
  const groupStudentIds = syncedGroupDetailsApply
    ? syncedGroupDetails.studentIds
    : storedGroupStudentIds;
  const groupAdministratorIds = syncedGroupDetailsApply
    ? syncedGroupDetails.administratorIds
    : storedGroupAdministratorIds;
  const groupDisplayNames = syncedGroupDetailsApply
    ? syncedGroupDetails.namesById
    : EMPTY_DISPLAY_NAMES;
  const groupStudentNames = useMemo(
    () =>
      groupStudentIds.map((memberId) => {
        const name =
          groupDisplayNames[memberId] || members[memberId]?.user?.name || "Student";
        return memberId === user.uid ? `${name} (you)` : name;
      }),
    [groupDisplayNames, groupStudentIds, members, user.uid],
  );
  const groupTeacherNames = useMemo(
    () =>
      groupAdministratorIds.map(
        (memberId) =>
          groupDisplayNames[memberId] || members[memberId]?.user?.name || "Teacher",
      ),
    [groupAdministratorIds, groupDisplayNames, members],
  );
  const isPersonalAssignment =
    channel.data?.assignment_source === "personal" ||
    channel.data?.assignment_source === "independent";
  const canDeletePersonalAssignment = channel.data?.created_by_id === user.uid;

  useEffect(() => {
    if (role !== "student" || !isGroupAssignment) return;
    let active = true;
    void (async () => {
      const result = await syncStudentGroupMemberNames({
        channelCid: channel.cid,
        firebaseIdToken: await user.getIdToken(),
      });
      if (!active || !result.success) return;
      setSyncedGroupDetails({
        administratorIds: result.administratorIds,
        channelCid: channel.cid,
        namesById: result.namesById,
        studentIds: result.studentIds,
      });
    })();
    return () => {
      active = false;
    };
  }, [channel.cid, isGroupAssignment, role, user]);

  const saveGroupName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingGroupName(true);
    setGroupNameEditor((current) => ({ ...current, error: "" }));
    try {
      const result = await renameStudentGroup({
        channelCid: channel.cid,
        firebaseIdToken: await user.getIdToken(),
        groupName: groupNameDraft,
      });
      if (!result.success || !result.groupName) {
        throw new Error(result.error ?? "Unable to rename the group");
      }
      setLocalGroupName({ channelCid: channel.cid, name: result.groupName });
      setGroupNameEditor({
        channelCid: channel.cid,
        draft: result.groupName,
        error: "",
        open: false,
      });
    } catch (error) {
      setGroupNameEditor((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Unable to rename the group",
      }));
    } finally {
      setIsSavingGroupName(false);
    }
  };

  const deletePersonalAssignment = async () => {
    if (!window.confirm(`Delete “${assignmentTitle}”? This removes its plan and submitted progress permanently.`)) return;
    setIsDeleting(true);
    setSyncError("");
    try {
      const result = await deletePublishedAssignment({
        channelCids: [channel.cid],
        firebaseIdToken: await user.getIdToken(),
      });
      if (!result.success) throw new Error(result.error ?? "Unable to delete the assignment");
      const deletedCid = channel.cid;
      setActiveChannel(undefined);
      window.dispatchEvent(new CustomEvent("snapschool:assignment-deleted", { detail: { cid: deletedCid } }));
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to delete the assignment");
      setIsDeleting(false);
    }
  };

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
    if (isPersonalAssignment) {
      setReminderMessage(
        `Keep your ${assignmentTitle} plan moving today.${currentStreak > 0 ? ` Your current streak is ${currentStreak} day${currentStreak === 1 ? "" : "s"}.` : ""}`,
      );
      setStreakReminder(true);
      return;
    }
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
      <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-x-hidden">
        <header className="shrink-0 border-b-2 border-black bg-black px-4 py-3 text-white">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-lg font-black tracking-tight text-white">
                {assignmentTitle}
              </p>
              <p className="mt-0.5 text-xs font-medium text-zinc-300">
                {channel.data?.class_name || "Individual assignment"}
                {dueDate &&
                  ` · ${channel.data?.late_amendment ? "Amended due" : "Due"} ${new Date(`${dueDate}T00:00:00`).toLocaleDateString()}`}
                {channel.data?.late_amendment && " · SUPER URGENT (late)"}
              </p>
            </div>

            <div className="grid shrink-0 grid-cols-2 rounded-full border border-white/30 bg-zinc-800 p-1">
              <button
                className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition ${
                  view === "plan"
                    ? "bg-[#fffc00] text-black"
                    : "text-zinc-300 hover:text-white"
                }`}
                onClick={() => changeView("plan")}
                type="button"
              >
                <ClipboardList className="size-4" />
                {isGroupAssignment
                  ? "Group plan"
                  : isAssessment
                    ? "Study plan"
                    : "Assignment plan"}
              </button>
              <button
                className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition ${
                  view === "messages"
                    ? "bg-[#fffc00] text-black"
                    : "text-zinc-300 hover:text-white"
                }`}
                onClick={() => changeView("messages")}
                type="button"
              >
                <MessageCircleQuestion className="size-4" />
                {isGroupAssignment
                  ? "Group chat"
                  : isPersonalAssignment
                    ? "Notes"
                  : role === "student"
                    ? "Ask teacher"
                    : "Messages"}
              </button>
            </div>
          </div>
        </header>

        {role === "student" && isGroupAssignment && (
          <section className="shrink-0 border-b-2 border-black bg-white px-4 py-3 text-black">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#c7b7ff]">
                <UsersRound className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black">{groupName}</p>
                  {!isEditingGroupName && (
                    <button className="inline-flex items-center gap-1 rounded-full border border-black px-2 py-1 text-[10px] font-black hover:bg-[#fffc00]" onClick={() => setGroupNameEditor({ channelCid: channel.cid, draft: groupName, error: "", open: true })} type="button">
                      <Pencil className="size-3" /> Name group
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  <strong className="text-zinc-800">Students:</strong>{" "}
                  {groupStudentNames.length > 0 ? groupStudentNames.join(", ") : "Group members are loading…"}
                </p>
                {groupTeacherNames.length > 0 && (
                  <p className="text-xs leading-5 text-zinc-600">
                    <strong className="text-zinc-800">Teacher{groupTeacherNames.length === 1 ? "" : "s"}:</strong>{" "}
                    {groupTeacherNames.join(", ")}
                  </p>
                )}
                {isEditingGroupName && (
                  <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={saveGroupName}>
                    <input autoFocus className="min-w-0 flex-1 rounded-xl border-2 border-black bg-white px-3 py-2 text-sm" maxLength={40} minLength={2} onChange={(event) => setGroupNameEditor((current) => ({ ...current, draft: event.target.value }))} required value={groupNameDraft} />
                    <div className="flex gap-2">
                      <button aria-label="Save group name" className="inline-flex items-center gap-1 rounded-xl border-2 border-black bg-[#fffc00] px-3 py-2 text-xs font-black disabled:opacity-50" disabled={isSavingGroupName} type="submit">
                        {isSavingGroupName ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
                      </button>
                      <button aria-label="Cancel renaming group" className="inline-flex items-center rounded-xl border-2 border-black bg-white px-3 py-2" disabled={isSavingGroupName} onClick={() => setGroupNameEditor({ channelCid: channel.cid, draft: groupName, error: "", open: false })} type="button">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </form>
                )}
                {groupNameError && <p className="mt-2 text-xs font-semibold text-red-700" role="alert">{groupNameError}</p>}
              </div>
            </div>
          </section>
        )}

        {view === "plan" ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f4f0e8]">
            <div className="flex items-center justify-between gap-3 border-b-2 border-black bg-[#fffc00] px-4 py-3 max-sm:flex-col max-sm:items-start">
              <p className="text-sm font-black text-black">
                <span className="mr-1.5 inline-flex size-7 items-center justify-center rounded-full bg-[#ff5b35] text-white">🔥</span>
                {currentStreak} day streak
                {targetDays && (
                  <span className="ml-2 font-semibold text-zinc-700">
                    · Assignment {completedWorkDays} / {targetDays} work days
                  </span>
                )}
              </p>
              <button
                className="shrink-0 rounded-full border-2 border-black bg-white px-3 py-1.5 text-xs font-black text-black shadow-[2px_2px_0_#111] transition hover:-translate-y-0.5"
                onClick={showReminder}
                type="button"
              >
                {isPersonalAssignment ? "Progress reminder" : "Streak reminder"}
              </button>
              {canDeletePersonalAssignment && (
                <button className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-red-700 bg-white px-3 py-1.5 text-xs font-black text-red-700 disabled:opacity-50" disabled={isDeleting} onClick={() => void deletePersonalAssignment()} type="button">
                  {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  {isDeleting ? "Deleting…" : "Delete"}
                </button>
              )}
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
            <div className="shrink-0 border-b-2 border-black bg-[#c7b7ff] px-4 py-2.5 text-xs font-semibold leading-5 text-black">
              {role === "student"
                ? isGroupAssignment
                  ? "Work together here. Use Request teacher only when the group needs direct help."
                  : isPersonalAssignment
                    ? "Keep optional notes about this assignment here. Submit actual progress from the plan tab so AI can update the streak."
                  : "Ask your teacher a question about this assignment. Your conversation stays attached to this work."
                : "Answer student questions and discuss this assignment here."}
            </div>
            {role === "student" && isGroupAssignment && (
              <RequestTeacherButton channel={channel} user={user} />
            )}
            <MessageList />
            <MessageComposer />
          </div>
        )}
      </div>
    </Window>
  );
}
