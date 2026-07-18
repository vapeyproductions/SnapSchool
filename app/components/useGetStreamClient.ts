"use client";

import type { User } from "firebase/auth";
import { useCallback, useMemo } from "react";
import { useCreateChatClient } from "stream-chat-react";

import { createToken } from "@/actions/stream";

export const useGetStreamClient = (user: User, displayName?: string) => {
  const tokenProvider = useCallback(
    async () => createToken(await user.getIdToken()),
    [user],
  );

  const userData = useMemo(
    () => ({
      id: user.uid,
      name: displayName || user.displayName || user.email?.split("@")[0] || "User",
      image: user.photoURL ?? "",
    }),
    [displayName, user.displayName, user.email, user.photoURL, user.uid],
  );

  const client = useCreateChatClient({
    apiKey: process.env.NEXT_PUBLIC_STREAM_API_KEY!,
    tokenOrProvider: tokenProvider,
    userData,
  });

  return { client };
};
