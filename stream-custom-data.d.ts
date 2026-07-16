import "stream-chat";
import type { DefaultChannelData } from "stream-chat-react";

declare module "stream-chat" {
  // Stream v9 uses interface merging to register React's default channel fields.
  interface CustomChannelData extends DefaultChannelData {
    assignment_title?: string;
    assignment_type?: "individual" | "group";
    assignment_kind?:
      | "essay"
      | "exam"
      | "homework"
      | "other"
      | "project"
      | "quiz"
      | "reading"
      | "test";
    assignment_summary?: string;
    class_id?: string;
    class_name?: string;
    completed_work_days?: number;
    created_by_id?: string;
    daily_plan?: string;
    due_date?: string;
    estimated_total_minutes?: number;
    last_progress_at?: string;
    last_progress_confidence?: "high" | "medium" | "low";
    last_progress_summary?: string;
    recommended_work_days?: number;
    remaining_work_summary?: string;
    student_username?: string;
  }
}
