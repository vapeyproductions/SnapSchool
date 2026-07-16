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
      <div className="chat-container flex h-[62vh] min-h-[32rem] max-h-[46rem] overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div
          className={`channel-list shrink-0 overflow-y-auto border-r border-slate-200 max-sm:w-36 ${
            role === "administrator" ? "w-96" : "w-80"
          }`}
        >
          {role === "student" && (
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 max-sm:hidden">
              <p className="text-xs font-semibold text-slate-700">Priority order</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                Based on the due date and estimated work remaining.
              </p>
            </div>
          )}
          {role === "administrator" ? (
            <>
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-2">
                <p className="mb-2 px-1 text-xs font-semibold text-slate-700">
                  Organize students by
                </p>
                <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                  <button
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold ${
                      teacherGrouping === "class"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600"
                    }`}
                    onClick={() => setTeacherGrouping("class")}
                    type="button"
                  >
                    Class
                  </button>
                  <button
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold ${
                      teacherGrouping === "assignment"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600"
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

        <div className="chat-panel min-w-0 flex-1">
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
