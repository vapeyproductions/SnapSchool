"use client";

import type { User } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { useContext } from "react";
import type { ChannelFilters, ChannelSort } from "stream-chat";
import {
  Channel,
  ChannelHeader,
  ChannelList,
  Chat,
  MessageComposer,
  MessageList,
  Window,
} from "stream-chat-react";

import AuthContext from "./AuthContext";
import { AssignmentPlanPanel } from "./AssignmentPlanPanel";
import { StudentProgressSubmission } from "./StudentProgressSubmission";
import { useGetStreamClient } from "./useGetStreamClient";

function LoadingChat() {
  return (
    <div className="flex min-h-72 items-center justify-center">
      <Loader2
        aria-label="Loading group chats"
        className="h-6 w-6 animate-spin text-gray-500"
      />
    </div>
  );
}

function AuthenticatedGroupChat({ displayName, user }: { displayName: string; user: User }) {
  const { client } = useGetStreamClient(user, displayName);

  const filters: ChannelFilters = {
    members: { $in: [user.uid] },
    type: "livestream",
  };
  const options = { presence: true, state: true };
  const sort: ChannelSort = { last_message_at: -1 };

  if (!client) return <LoadingChat />;

  return (
    <Chat client={client}>
      <div className="chat-container flex h-[66vh] min-h-[36rem] max-h-[52rem] overflow-hidden bg-white max-md:h-auto max-md:min-h-0 max-md:flex-col">
        <div className="channel-list w-72 shrink-0 overflow-y-auto border-r-2 border-black bg-[#f4f0e8] max-md:h-44 max-md:w-full max-md:border-b-2 max-md:border-r-0">
          <div className="sticky top-0 z-10 border-b-2 border-black bg-[#c7b7ff] px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.13em]">Project circles</p>
            <p className="mt-0.5 text-[11px] font-medium">Team updates and conversations</p>
          </div>
          <ChannelList filters={filters} options={options} sort={sort} />
        </div>

        <div className="chat-panel min-w-0 flex-1 max-md:h-[38rem]">
          <Channel>
            <Window>
              <ChannelHeader />
              <AssignmentPlanPanel />
              <StudentProgressSubmission />
              <MessageList />
              <MessageComposer />
            </Window>
          </Channel>
        </div>
      </div>
    </Chat>
  );
}

export default function GroupChatPage() {
  const { displayName, user, loading } = useContext(AuthContext);

  if (loading || !user) return <LoadingChat />;

  return <AuthenticatedGroupChat displayName={displayName} user={user} />;
}
