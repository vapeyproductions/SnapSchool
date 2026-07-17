"use client";

import type { User } from "firebase/auth";
import { ArrowLeft, CalendarDays, ListChecks, Loader2 } from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Channel as StreamChannel,
  ChannelFilters,
  ChannelSort,
} from "stream-chat";
import { Channel, Chat, useChatContext } from "stream-chat-react";

import AdministratorClassDashboard from "./AdministratorClassDashboard";
import AssignmentCalendar, { type CalendarAssignment } from "./AssignmentCalendar";
import AuthContext from "./AuthContext";
import ParentDashboard from "./ParentDashboard";
import { ChannelContent } from "./ChannelContent";
import { PriorityAssignmentList } from "./PriorityAssignmentList";
import { useGetStreamClient } from "./useGetStreamClient";
import type { AssignmentTask } from "@/lib/assignment-analysis";
import { getAssignmentPriority } from "@/lib/assignment-priority";

type StreakPageProps = {
  onDailyMinutesChange?: (minutes: number) => void;
  setReminderMessage: Dispatch<SetStateAction<string>>;
  setStreakReminder: Dispatch<SetStateAction<boolean>>;
};

function LoadingStreaks() {
  return (
    <div className="flex min-h-72 items-center justify-center">
      <Loader2
        aria-label="Loading streak chats"
        className="h-6 w-6 animate-spin text-gray-500"
      />
    </div>
  );
}

const parseDailyPlan = (value: unknown): AssignmentTask[] => {
  if (typeof value !== "string") return [];
  try {
    const tasks = JSON.parse(value) as AssignmentTask[];
    return Array.isArray(tasks) ? tasks : [];
  } catch {
    return [];
  }
};

function StudentAssignmentCalendar({
  channels,
  onOpenAssignment,
}: {
  channels: StreamChannel[];
  onOpenAssignment: () => void;
}) {
  const { setActiveChannel } = useChatContext("StudentAssignmentCalendar");
  const assignments = useMemo<CalendarAssignment[]>(
    () => channels
      .filter((channel) => {
        const data = channel.data ?? {};
        return Boolean(data.assignment_title) && !getAssignmentPriority(data).completed;
      })
      .map((channel) => ({
        classId: channel.data?.class_id ?? "",
        className: channel.data?.class_name ?? "Individual",
        completedSteps: channel.data?.completed_work_days ?? 0,
        currentMission: null,
        dailyPlan: parseDailyPlan(channel.data?.daily_plan),
        dueDate: channel.data?.due_date ?? "",
        id: channel.cid,
        targetSteps: channel.data?.recommended_work_days ?? 0,
        title: channel.data?.assignment_title ?? "Assignment",
      })),
    [channels],
  );

  return (
    <AssignmentCalendar
      assignments={assignments}
      onAssignmentSelect={(assignmentId) => {
        const channel = channels.find((candidate) => candidate.cid === assignmentId);
        if (!channel) return;
        setActiveChannel(channel);
        onOpenAssignment();
      }}
    />
  );
}

function AuthenticatedStreakPage({
  user,
  onDailyMinutesChange,
  setReminderMessage,
  setStreakReminder,
}: StreakPageProps & { user: User }) {
  const { client } = useGetStreamClient(user);
  const [assignmentChannels, setAssignmentChannels] = useState<StreamChannel[]>([]);
  const [channelError, setChannelError] = useState("");
  const [mobileAssignmentOpen, setMobileAssignmentOpen] = useState(false);
  const [dashboardView, setDashboardView] = useState<"assignments" | "calendar">("calendar");
  const filters: ChannelFilters = {
    members: { $in: [user.uid] },
    type: "messaging",
  };
  const options = { presence: true, state: true };
  const sort = useMemo<ChannelSort>(() => ({ last_message_at: -1 }), []);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    const loadAssignments = async () => {
      try {
        const baseFilters = { members: { $in: [user.uid] } };
        const [individual, group] = await Promise.all([
          client.queryChannels(
            { ...baseFilters, type: "messaging" } as ChannelFilters,
            sort,
            { message_limit: 30, state: true, watch: true },
          ),
          client.queryChannels(
            { ...baseFilters, type: "livestream" } as ChannelFilters,
            sort,
            { message_limit: 30, state: true, watch: true },
          ),
        ]);
        if (!cancelled) {
          setAssignmentChannels([...individual, ...group]);
          setChannelError("");
        }
      } catch (error) {
        if (!cancelled) {
          setChannelError(
            error instanceof Error ? error.message : "Unable to load assignments",
          );
        }
      }
    };

    void loadAssignments();
    const updateSubscription = client.on("channel.updated", () => {
      setAssignmentChannels((current) => [...current]);
    });
    const addedSubscription = client.on("notification.added_to_channel", () => {
      void loadAssignments();
    });
    const deletedSubscription = client.on("channel.deleted", (event) => {
      if (!event.cid) return;
      setAssignmentChannels((current) => current.filter((channel) => channel.cid !== event.cid));
    });
    const personalDeleted = (event: Event) => {
      const cid = (event as CustomEvent<{ cid?: string }>).detail?.cid;
      if (!cid) return;
      setAssignmentChannels((current) => current.filter((channel) => channel.cid !== cid));
    };
    window.addEventListener("snapschool:assignment-deleted", personalDeleted);
    return () => {
      cancelled = true;
      updateSubscription.unsubscribe();
      addedSubscription.unsubscribe();
      deletedSubscription.unsubscribe();
      window.removeEventListener("snapschool:assignment-deleted", personalDeleted);
    };
  }, [client, sort, user.uid]);

  if (!client) return <LoadingStreaks />;

  return (
    <Chat client={client}>
      <div className="min-w-0 bg-white">
        <div className="flex flex-wrap gap-2 border-b-2 border-black bg-white p-3">
          <button
            className={`flex items-center gap-2 rounded-full border-2 border-black px-4 py-2 text-sm font-black ${dashboardView === "calendar" ? "bg-[#fffc00] shadow-[2px_2px_0_#111]" : "bg-white"}`}
            onClick={() => setDashboardView("calendar")}
            type="button"
          >
            <CalendarDays className="size-4" /> Calendar
          </button>
          <button
            className={`flex items-center gap-2 rounded-full border-2 border-black px-4 py-2 text-sm font-black ${dashboardView === "assignments" ? "bg-[#c7b7ff] shadow-[2px_2px_0_#111]" : "bg-white"}`}
            onClick={() => setDashboardView("assignments")}
            type="button"
          >
            <ListChecks className="size-4" /> Assignments
          </button>
        </div>

        {dashboardView === "calendar" ? (
          <StudentAssignmentCalendar
            channels={assignmentChannels}
            onOpenAssignment={() => {
              setDashboardView("assignments");
              setMobileAssignmentOpen(true);
            }}
          />
        ) : (
      <div className="chat-container flex h-[66vh] min-h-[36rem] max-h-[52rem] min-w-0 overflow-hidden bg-white max-md:h-[calc(100dvh-11rem)] max-md:max-h-none max-md:min-h-[32rem] max-md:flex-col">
        <div
          className="mobile-assignment-list channel-list student-story-list w-80 shrink-0 overflow-y-auto border-r-2 border-black bg-[#f4f0e8] max-md:h-full max-md:w-full max-md:border-r-0"
          data-mobile-hidden={mobileAssignmentOpen}
        >
          <div className="sticky top-0 z-10 border-b-2 border-black bg-[#fffc00] px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.13em] text-black">Assignments</p>
            <p className="mt-0.5 text-[11px] font-medium leading-4 text-zinc-700">
              Most urgent is always at the top.
            </p>
          </div>
          <PriorityAssignmentList
            channels={assignmentChannels}
            enabled
            filters={filters}
            onChannelSelected={() => setMobileAssignmentOpen(true)}
            onDailyMinutesChange={onDailyMinutesChange}
            options={options}
            sort={sort}
          />
        </div>

        <div
          className="mobile-assignment-detail chat-panel min-w-0 max-w-full flex-1 overflow-hidden bg-white max-md:h-full max-md:w-full max-md:flex-col"
          data-mobile-hidden={!mobileAssignmentOpen}
        >
          <button
            className="mobile-assignment-back shrink-0 items-center gap-2 border-b-2 border-black bg-white px-4 py-3 text-sm font-black text-black md:hidden"
            onClick={() => setMobileAssignmentOpen(false)}
            type="button"
          >
            <ArrowLeft className="size-4" /> Back to assignments
          </button>
          {channelError && (
            <p className="border-b-2 border-red-600 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
              {channelError}
            </p>
          )}
          <Channel>
            <ChannelContent
              user={user}
              setReminderMessage={setReminderMessage}
              setStreakReminder={setStreakReminder}
            />
          </Channel>
        </div>
      </div>
        )}
      </div>
    </Chat>
  );
}

export default function StreakPage({
  onDailyMinutesChange,
  setReminderMessage,
  setStreakReminder,
}: StreakPageProps) {
  const { role, user, loading } = useContext(AuthContext);

  if (loading || !user || !role) return <LoadingStreaks />;

  if (role === "administrator") {
    return <AdministratorClassDashboard user={user} />;
  }

  if (role === "parent") {
    return <ParentDashboard user={user} />;
  }

  return (
    <AuthenticatedStreakPage
      user={user}
      onDailyMinutesChange={onDailyMinutesChange}
      setReminderMessage={setReminderMessage}
      setStreakReminder={setStreakReminder}
    />
  );
}
