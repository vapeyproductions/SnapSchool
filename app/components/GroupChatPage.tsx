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

function AuthenticatedGroupChat({ user }: { user: User }) {
  const { client } = useGetStreamClient(user);

  const filters: ChannelFilters = {
    members: { $in: [user.uid] },
    type: "livestream",
  };
  const options = { presence: true, state: true };
  const sort: ChannelSort = { last_message_at: -1 };

  if (!client) return <LoadingChat />;

  return (
    <Chat client={client}>
      <div className="chat-container flex h-[62vh] min-h-[32rem] max-h-[46rem] overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="channel-list w-64 shrink-0 overflow-y-auto border-r border-slate-200 max-sm:w-28">
          <ChannelList filters={filters} options={options} sort={sort} />
        </div>

        <div className="chat-panel min-w-0 flex-1">
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
  const { user, loading } = useContext(AuthContext);

  if (loading || !user) return <LoadingChat />;

  return <AuthenticatedGroupChat user={user} />;
}
