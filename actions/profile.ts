"use server";

import { StreamChat } from "stream-chat";

import type { AccountRole } from "@/lib/server";

type FirestoreValue = {
  integerValue?: string;
  stringValue?: string;
  timestampValue?: string;
};

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
  name?: string;
};

type Profile = {
  role: AccountRole;
  studentMode?: "independent" | "school";
  uid: string;
  username: string;
};

export type FamilyConnection = {
  id: string;
  parentUid: string;
  parentUsername: string;
  status: "approved" | "pending" | "rejected";
  studentUid: string;
  studentUsername: string;
};

export type ParentAssignmentSummary = {
  assignmentType: "group" | "individual";
  className: string;
  completedSteps: number;
  currentMission: string | null;
  dueDate: string;
  id: string;
  lastProgressSummary: string | null;
  progressPercent: number;
  remainingWorkSummary: string | null;
  targetSteps: number;
  title: string;
};

export type ParentChildDashboard = {
  assignments: ParentAssignmentSummary[];
  studentUid: string;
  studentUsername: string;
};

const firebaseConfig = () => {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) throw new Error("Firebase server configuration is missing");
  return { apiKey, projectId };
};

const documentUrl = (collection: string, id: string) => {
  const { projectId } = firebaseConfig();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
};

const authHeaders = (idToken: string) => ({
  Authorization: `Bearer ${idToken}`,
  "Content-Type": "application/json",
});

const parseProfile = (document: FirestoreDocument): Profile | null => {
  const uid = document.fields?.uid?.stringValue;
  const username = document.fields?.username?.stringValue;
  const role = document.fields?.role?.stringValue;
  const studentModeValue = document.fields?.studentMode?.stringValue;
  if (!uid || !username || (role !== "student" && role !== "administrator" && role !== "parent")) return null;
  return {
    role,
    studentMode:
      role === "student" && studentModeValue === "independent"
        ? "independent"
        : role === "student"
          ? "school"
          : undefined,
    uid,
    username,
  };
};

const getProfileByUsername = async (idToken: string, usernameValue: string) => {
  const username = usernameValue.trim().toLowerCase();
  const response = await fetch(documentUrl("users", username), {
    cache: "no-store",
    headers: authHeaders(idToken),
  });
  if (response.status === 404) throw new Error(`The username "${username}" was not found`);
  if (!response.ok) throw new Error("Unable to load that profile");
  const profile = parseProfile((await response.json()) as FirestoreDocument);
  if (!profile) throw new Error("That account has an invalid profile");
  return profile;
};

const getProfileByUid = async (
  idToken: string,
  uid: string,
  fallbackUsername?: string,
) => {
  const response = await fetch(documentUrl("profiles", uid), {
    cache: "no-store",
    headers: authHeaders(idToken),
  });
  if (response.ok) {
    const profile = parseProfile((await response.json()) as FirestoreDocument);
    if (profile) return profile;
  }
  if (fallbackUsername) return getProfileByUsername(idToken, fallbackUsername);
  throw new Error("Unable to load this account profile");
};

const authenticate = async (idToken: string): Promise<Profile> => {
  if (!idToken) throw new Error("You must be signed in");
  const { apiKey } = firebaseConfig();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  const result = (await response.json()) as {
    users?: Array<{ displayName?: string; localId?: string }>;
  };
  const account = result.users?.[0];
  if (!response.ok || !account?.localId || !account.displayName) {
    throw new Error("Your session is invalid or has expired. Sign in again.");
  }
  const profile = await getProfileByUid(idToken, account.localId, account.displayName);
  if (profile.uid !== account.localId) throw new Error("Your profile could not be verified");
  return profile;
};

const parseConnection = (document: FirestoreDocument): FamilyConnection | null => {
  const id = document.name?.split("/").pop();
  const parentUid = document.fields?.parentUid?.stringValue;
  const parentUsername = document.fields?.parentUsername?.stringValue;
  const studentUid = document.fields?.studentUid?.stringValue;
  const studentUsername = document.fields?.studentUsername?.stringValue;
  const status = document.fields?.status?.stringValue;
  if (!id || !parentUid || !parentUsername || !studentUid || !studentUsername || (status !== "pending" && status !== "approved" && status !== "rejected")) return null;
  return { id, parentUid, parentUsername, status, studentUid, studentUsername };
};

const queryConnections = async (
  idToken: string,
  fieldPath: "parentUid" | "studentUid",
  uid: string,
) => {
  const { projectId } = firebaseConfig();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      cache: "no-store",
      headers: authHeaders(idToken),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "familyConnections" }],
          where: {
            fieldFilter: {
              field: { fieldPath },
              op: "EQUAL",
              value: { stringValue: uid },
            },
          },
        },
      }),
    },
  );
  if (!response.ok) throw new Error("Unable to load family connections");
  const rows = (await response.json()) as Array<{ document?: FirestoreDocument }>;
  const connections = rows
    .map((row) => row.document && parseConnection(row.document))
    .filter((connection): connection is FamilyConnection => Boolean(connection));

  return Promise.all(
    connections.map(async (connection) => {
      const [parent, student] = await Promise.all([
        getProfileByUid(idToken, connection.parentUid, connection.parentUsername),
        getProfileByUid(idToken, connection.studentUid, connection.studentUsername),
      ]);
      if (parent.role !== "parent" || student.role !== "student") {
        throw new Error("This family connection contains invalid account roles");
      }
      return {
        ...connection,
        parentUsername: parent.username,
        studentUsername: student.username,
      };
    }),
  );
};

export const getProfileSettings = async (idToken: string) => {
  try {
    const profile = await authenticate(idToken);
    const connections = profile.role === "parent"
      ? await queryConnections(idToken, "parentUid", profile.uid)
      : profile.role === "student"
        ? await queryConnections(idToken, "studentUid", profile.uid)
        : [];
    return { connections, error: null, profile, success: true as const };
  } catch (error) {
    return {
      connections: [] as FamilyConnection[],
      error: error instanceof Error ? error.message : "Unable to load profile settings",
      profile: null,
      success: false as const,
    };
  }
};

export const getAssignableIndependentStudents = async (idToken: string) => {
  try {
    const caller = await authenticate(idToken);
    if (caller.role === "student") {
      if (caller.studentMode !== "independent") {
        throw new Error("School-connected students receive assignments from their administrators");
      }
      return {
        error: null,
        students: [{ uid: caller.uid, username: caller.username }],
        success: true as const,
      };
    }
    if (caller.role !== "parent") {
      throw new Error("This account cannot create independent assignments");
    }
    const connections = (await queryConnections(idToken, "parentUid", caller.uid))
      .filter((connection) => connection.status === "approved");
    const students = (await Promise.all(
      connections.map((connection) =>
        getProfileByUid(idToken, connection.studentUid, connection.studentUsername),
      ),
    ))
      .filter((student) => student.role === "student" && student.studentMode === "independent")
      .map((student) => ({ uid: student.uid, username: student.username }));
    return { error: null, students, success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to load independent students",
      students: [] as Array<{ uid: string; username: string }>,
      success: false as const,
    };
  }
};

export const requestParentConnection = async (data: {
  firebaseIdToken: string;
  studentUsername: string;
}) => {
  try {
    const parent = await authenticate(data.firebaseIdToken);
    if (parent.role !== "parent") throw new Error("Only parent accounts can request student supervision");
    const student = await getProfileByUsername(data.firebaseIdToken, data.studentUsername);
    if (student.role !== "student") throw new Error("Supervision requests can only be sent to student accounts");
    const connectionId = `${parent.uid}_${student.uid}`;
    const existing = await fetch(documentUrl("familyConnections", connectionId), {
      cache: "no-store",
      headers: authHeaders(data.firebaseIdToken),
    });
    if (existing.ok) {
      const connection = parseConnection((await existing.json()) as FirestoreDocument);
      if (connection?.status === "approved") throw new Error("You are already connected to this student");
      if (connection?.status === "pending") throw new Error("This request is already waiting for student approval");
    }

    const response = await fetch(documentUrl("familyConnections", connectionId), {
      method: "PATCH",
      cache: "no-store",
      headers: authHeaders(data.firebaseIdToken),
      body: JSON.stringify({ fields: {
        parentUid: { stringValue: parent.uid },
        parentUsername: { stringValue: parent.username },
        requestedAt: { timestampValue: new Date().toISOString() },
        status: { stringValue: "pending" },
        studentUid: { stringValue: student.uid },
        studentUsername: { stringValue: student.username },
      } }),
    });
    if (!response.ok) throw new Error("Unable to send the connection request");
    return { error: null, success: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to send request", success: false as const };
  }
};

export const respondToParentConnection = async (data: {
  approved: boolean;
  connectionId: string;
  firebaseIdToken: string;
}) => {
  try {
    const student = await authenticate(data.firebaseIdToken);
    if (student.role !== "student") throw new Error("Only the student can respond to this request");
    const response = await fetch(documentUrl("familyConnections", data.connectionId), {
      cache: "no-store",
      headers: authHeaders(data.firebaseIdToken),
    });
    if (!response.ok) throw new Error("That connection request was not found");
    const connection = parseConnection((await response.json()) as FirestoreDocument);
    if (!connection || connection.studentUid !== student.uid) throw new Error("You cannot respond to this request");
    if (connection.status !== "pending") throw new Error("This request has already been answered");

    const updateUrl = new URL(documentUrl("familyConnections", data.connectionId));
    updateUrl.searchParams.append("updateMask.fieldPaths", "status");
    updateUrl.searchParams.append("updateMask.fieldPaths", "respondedAt");
    const update = await fetch(updateUrl, {
      method: "PATCH",
      cache: "no-store",
      headers: authHeaders(data.firebaseIdToken),
      body: JSON.stringify({ fields: {
        respondedAt: { timestampValue: new Date().toISOString() },
        status: { stringValue: data.approved ? "approved" : "rejected" },
      } }),
    });
    if (!update.ok) throw new Error("Unable to save your response");
    return { error: null, success: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to respond", success: false as const };
  }
};

export const removeFamilyConnection = async (data: {
  connectionId: string;
  firebaseIdToken: string;
}) => {
  try {
    const caller = await authenticate(data.firebaseIdToken);
    const response = await fetch(documentUrl("familyConnections", data.connectionId), {
      cache: "no-store",
      headers: authHeaders(data.firebaseIdToken),
    });
    if (!response.ok) throw new Error("That family connection was not found");
    const connection = parseConnection((await response.json()) as FirestoreDocument);
    if (!connection || (connection.parentUid !== caller.uid && connection.studentUid !== caller.uid)) {
      throw new Error("You cannot remove this family connection");
    }
    const remove = await fetch(documentUrl("familyConnections", data.connectionId), {
      method: "DELETE",
      cache: "no-store",
      headers: authHeaders(data.firebaseIdToken),
    });
    if (!remove.ok) throw new Error("Unable to remove the family connection");
    return { error: null, success: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to remove connection", success: false as const };
  }
};

const parseDailyMission = (value: unknown, completedSteps: number) => {
  if (typeof value !== "string") return null;
  try {
    const tasks = JSON.parse(value) as Array<{ title?: string }>;
    return Array.isArray(tasks) ? tasks[Math.min(completedSteps, Math.max(0, tasks.length - 1))]?.title ?? null : null;
  } catch {
    return null;
  }
};

export const getParentDashboard = async (firebaseIdToken: string) => {
  try {
    const parent = await authenticate(firebaseIdToken);
    if (parent.role !== "parent") throw new Error("Only parent accounts can open the family dashboard");
    const connections = (await queryConnections(firebaseIdToken, "parentUid", parent.uid))
      .filter((connection) => connection.status === "approved");
    const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
    const secret = process.env.STREAM_SECRET_KEY;
    if (!apiKey || !secret) throw new Error("Stream server configuration is missing");
    const streamClient = StreamChat.getInstance(apiKey, secret);

    const children = await Promise.all(connections.map(async (connection) => {
      const [individual, group] = await Promise.all([
        streamClient.queryChannels({ members: { $in: [connection.studentUid] }, type: "messaging" }, { last_message_at: -1 }, { state: true, watch: false }),
        streamClient.queryChannels({ members: { $in: [connection.studentUid] }, type: "livestream" }, { last_message_at: -1 }, { state: true, watch: false }),
      ]);
      const assignments = [...individual, ...group]
        .filter((channel) => {
          if (!channel.data?.assignment_title) return false;
          if (channel.data.assignment_type !== "group") return Boolean(channel.state.members[connection.studentUid]);
          try {
            return (JSON.parse(channel.data.group_student_ids ?? "[]") as string[]).includes(connection.studentUid);
          } catch {
            return false;
          }
        })
        .map((channel): ParentAssignmentSummary => {
          const completedSteps = channel.data?.completed_work_days ?? 0;
          const targetSteps = channel.data?.recommended_work_days ?? 0;
          return {
            assignmentType: channel.data?.assignment_type === "group" ? "group" : "individual",
            className: channel.data?.class_name ?? "Class",
            completedSteps,
            currentMission: parseDailyMission(channel.data?.daily_plan, completedSteps),
            dueDate: channel.data?.due_date ?? "",
            id: channel.cid,
            lastProgressSummary: channel.data?.last_progress_summary ?? null,
            progressPercent: targetSteps > 0 ? Math.min(100, Math.round((completedSteps / targetSteps) * 100)) : 0,
            remainingWorkSummary: channel.data?.remaining_work_summary ?? null,
            targetSteps,
            title: channel.data?.assignment_title ?? "Assignment",
          };
        })
        .sort((first, second) => first.dueDate.localeCompare(second.dueDate));
      return { assignments, studentUid: connection.studentUid, studentUsername: connection.studentUsername } satisfies ParentChildDashboard;
    }));
    return { children, error: null, success: true as const };
  } catch (error) {
    return { children: [] as ParentChildDashboard[], error: error instanceof Error ? error.message : "Unable to load family dashboard", success: false as const };
  }
};
