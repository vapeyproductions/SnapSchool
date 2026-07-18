import type { LocalMessage } from "stream-chat";

export const isRoutineProgressMessage = (message: LocalMessage) => {
  if (
    message.snapschool_event === "progress_evidence" ||
    message.snapschool_event === "progress_review"
  ) {
    return true;
  }

  const text = message.text?.trim() ?? "";
  return (
    text.startsWith("🤖 AI progress review:") ||
    text.startsWith("Progress evidence")
  );
};

