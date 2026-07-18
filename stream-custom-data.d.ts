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
    assignment_creator_id?: string;
    assignment_summary?: string;
    assignment_source?: "independent" | "personal" | "school";
    amended_due_date?: string;
    class_id?: string;
    class_name?: string;
    completed_work_days?: number;
    created_by_id?: string;
    daily_plan?: string;
    due_date?: string;
    estimated_completion_percent?: number;
    estimated_total_minutes?: number;
    group_administrator_ids?: string;
    group_assignment_batch_id?: string;
    group_contributions?: string;
    group_name?: string;
    group_student_ids?: string;
    last_progress_at?: string;
    last_progress_confidence?: "high" | "medium" | "low";
    last_progress_summary?: string;
    late_amendment?: boolean;
    original_due_date?: string;
    recommended_work_days?: number;
    remaining_work_summary?: string;
    student_username?: string;
    teacher_request_created_at?: string;
    teacher_request_id?: string;
    teacher_request_question?: string;
    teacher_request_requested_by?: string;
    teacher_request_requested_by_name?: string;
    teacher_request_resolved_at?: string;
    teacher_request_resolved_by?: string;
    teacher_request_status?: "open" | "resolved";
  }
}
