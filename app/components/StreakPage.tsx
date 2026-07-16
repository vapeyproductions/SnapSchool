"use client";

import type { User } from "firebase/auth";
import { Loader2 } from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useContext,
  useState,
} from "react";
import type { ChannelFilters, ChannelSort } from "stream-chat";
import { Channel, Chat } from "stream-chat-react";

import AuthContext from "./AuthContext";
import { ChannelContent } from "./ChannelContent";
import { PriorityAssignmentList } from "./PriorityAssignmentList";
import {
  TeacherAssignmentList,
  type TeacherGrouping,
} from "./TeacherAssignmentList";
import { useGetStreamClient } from "./useGetStreamClient";

type StreakPageProps = {
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
  setReminderMessage,
  setStreakReminder,
}: StreakPageProps & { user: User }) {
  const { role } = useContext(AuthContext);
  const [teacherGrouping, setTeacherGrouping] =
    useState<TeacherGrouping>("class");
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
          className={`channel-list shrink-0 overflow-y-auto border-r-2 border-black bg-[#f4f0e8] max-md:h-48 max-md:w-full max-md:border-b-2 max-md:border-r-0 ${
            role === "administrator" ? "teacher-pulse-list w-96" : "student-story-list w-80"
          }`}
        >
          {role === "student" && (
            <div className="sticky top-0 z-10 border-b-2 border-black bg-[#fffc00] px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.13em] text-black">Your streak feed</p>
              <p className="mt-0.5 text-[11px] font-medium leading-4 text-zinc-700">
                Most urgent is always at the top.
              </p>
            </div>
          )}
          {role === "administrator" ? (
            <>
              <div className="sticky top-0 z-10 border-b-2 border-black bg-[#fffc00] p-3">
                <p className="mb-2 px-1 text-xs font-black uppercase tracking-[0.13em] text-black">
                  View your pulse by
                </p>
                <div className="grid grid-cols-2 rounded-full border-2 border-black bg-white p-1">
                  <button
                    className={`rounded-full px-2 py-1.5 text-xs font-bold ${
                      teacherGrouping === "class"
                        ? "bg-black text-white"
                        : "text-zinc-600"
                    }`}
                    onClick={() => setTeacherGrouping("class")}
                    type="button"
                  >
                    Class
                  </button>
                  <button
                    className={`rounded-full px-2 py-1.5 text-xs font-bold ${
                      teacherGrouping === "assignment"
                        ? "bg-black text-white"
                        : "text-zinc-600"
                    }`}
                    onClick={() => setTeacherGrouping("assignment")}
                    type="button"
                  >
                    Assignment
                  </button>
                </div>
              </div>
              <TeacherAssignmentList
                filters={filters}
                grouping={teacherGrouping}
                options={options}
                sort={sort}
              />
            </>
          ) : (
            <PriorityAssignmentList
              enabled
              filters={filters}
              options={options}
              sort={sort}
            />
          )}
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
  setReminderMessage,
  setStreakReminder,
}: StreakPageProps) {
  const { user, loading } = useContext(AuthContext);

  if (loading || !user) return <LoadingStreaks />;

  return (
    <AuthenticatedStreakPage
      user={user}
      setReminderMessage={setReminderMessage}
      setStreakReminder={setStreakReminder}
    />
  );
}
