"use client";

import type { User } from "firebase/auth";
import { Loader2 } from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useContext,
} from "react";
import type { ChannelFilters, ChannelSort } from "stream-chat";
import { Channel, Chat } from "stream-chat-react";

import AdministratorClassDashboard from "./AdministratorClassDashboard";
import AuthContext from "./AuthContext";
import { ChannelContent } from "./ChannelContent";
import { PriorityAssignmentList } from "./PriorityAssignmentList";
import { useGetStreamClient } from "./useGetStreamClient";

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

function AuthenticatedStreakPage({
  user,
  onDailyMinutesChange,
  setReminderMessage,
  setStreakReminder,
}: StreakPageProps & { user: User }) {
  const { client } = useGetStreamClient(user);
  const filters: ChannelFilters = {
    members: { $in: [user.uid] },
    type: "messaging",
  };
  const options = { presence: true, state: true };
  const sort: ChannelSort = { last_message_at: -1 };

  if (!client) return <LoadingStreaks />;

  return (
    <Chat client={client}>
      <div className="chat-container flex h-[66vh] min-h-[36rem] max-h-[52rem] overflow-hidden bg-white max-md:h-auto max-md:min-h-0 max-md:flex-col">
        <div
          className="channel-list student-story-list w-80 shrink-0 overflow-y-auto border-r-2 border-black bg-[#f4f0e8] max-md:h-48 max-md:w-full max-md:border-b-2 max-md:border-r-0"
        >
          <div className="sticky top-0 z-10 border-b-2 border-black bg-[#fffc00] px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.13em] text-black">Assignments</p>
            <p className="mt-0.5 text-[11px] font-medium leading-4 text-zinc-700">
              Most urgent is always at the top.
            </p>
          </div>
          <PriorityAssignmentList
            enabled
            filters={filters}
            onDailyMinutesChange={onDailyMinutesChange}
            options={options}
            sort={sort}
          />
        </div>

        <div className="chat-panel min-w-0 flex-1 bg-white max-md:h-[38rem]">
          <Channel>
            <ChannelContent
              user={user}
              setReminderMessage={setReminderMessage}
              setStreakReminder={setStreakReminder}
            />
          </Channel>
        </div>
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

  if (loading || !user) return <LoadingStreaks />;

  if (role === "administrator") {
    return <AdministratorClassDashboard user={user} />;
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
