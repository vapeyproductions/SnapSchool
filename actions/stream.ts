"use server";

import { StreamChat } from "stream-chat";

import { isISODate, type AssignmentPlan } from "@/lib/assignment-analysis";

const STREAM_API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY!;
const STREAM_API_SECRET = process.env.STREAM_SECRET_KEY!;

const serverClient = StreamChat.getInstance(
  STREAM_API_KEY,
  STREAM_API_SECRET,
);

type AccountRole = "student" | "administrator";
type AssignmentType = "individual" | "group";

type AssignmentChannelArgs = {
  assignmentType: AssignmentType;
  firebaseIdToken: string;
  memberUsernames: string[];
  plan: AssignmentPlan;
  title: string;
};

type FirebaseAccount = {
  displayName?: string;
  localId?: string;
};

type UserProfile = {
  role: AccountRole;
  uid: string;
  username: string;
};

type FirestoreValue = {
  arrayValue?: { values?: FirestoreValue[] };
  stringValue?: string;
  timestampValue?: string;
};

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
  name?: string;
};

export type SchoolClassSummary = {
  id: string;
  name: string;
  studentCount: number;
  studentUsernames: string[];
};

type SchoolClassRecord = SchoolClassSummary & {
  administratorIds: string[];
  createdBy: string;
  studentIds: string[];
};

const requireServerConfig = () => {
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (
    !STREAM_API_KEY ||
    !STREAM_API_SECRET ||
    !firebaseApiKey ||
    !firebaseProjectId
  ) {
    throw new Error("The server is missing Firebase or Stream configuration");
  }

  return { firebaseApiKey, firebaseProjectId };
};

const getProfile = async (
  firebaseIdToken: string,
  username: string,
): Promise<UserProfile> => {
  const { firebaseProjectId } = requireServerConfig();
  const normalizedUsername = username.trim().toLowerCase();
  const profileUrl =
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
    `/databases/(default)/documents/users/${encodeURIComponent(normalizedUsername)}`;
  const response = await fetch(profileUrl, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${firebaseIdToken}` },
  });

  if (response.status === 404) {
    throw new Error(`The username "${normalizedUsername}" was not found`);
  }

  if (!response.ok) {
    throw new Error("Unable to verify the selected SchoolSnap user");
  }

  const document = (await response.json()) as {
    fields?: Record<string, { stringValue?: string }>;
  };
  const uid = document.fields?.uid?.stringValue;
  const role = document.fields?.role?.stringValue;

  if (
    !uid ||
    (role !== "student" && role !== "administrator")
  ) {
    throw new Error(`The user "${normalizedUsername}" has an invalid profile`);
  }

  return { role, uid, username: normalizedUsername };
};

const authenticateCaller = async (
  firebaseIdToken: string,
): Promise<UserProfile> => {
  if (!firebaseIdToken) throw new Error("You must be signed in");

  const { firebaseApiKey } = requireServerConfig();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: firebaseIdToken }),
    },
  );
  const result = (await response.json()) as {
    users?: FirebaseAccount[];
  };
  const account = result.users?.[0];
  const username = account?.displayName?.trim().toLowerCase();

  if (!response.ok || !account?.localId || !username) {
    throw new Error("Your session is invalid or has expired. Sign in again.");
  }

  const profile = await getProfile(firebaseIdToken, username);

  if (profile.uid !== account.localId) {
    throw new Error("Your SchoolSnap profile could not be verified");
  }

  return profile;
};

const generateAssignmentChannelId = (
  assignmentType: AssignmentType,
  title: string,
) => {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "assignment";
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);

  return `${assignmentType}-${slug}-${suffix}`;
};

const validateAssignmentPlan = (plan: AssignmentPlan) => {
  const today = new Date().toISOString().slice(0, 10);

  if (!isISODate(plan.dueDate) || plan.dueDate < today) {
    throw new Error("Choose a due date that is today or later");
  }

  if (
    !Number.isInteger(plan.recommendedWorkDays) ||
    plan.recommendedWorkDays < 1 ||
    plan.recommendedWorkDays > 60
  ) {
    throw new Error("The recommended streak must be between 1 and 60 days");
  }

  if (
    !Number.isInteger(plan.estimatedTotalMinutes) ||
    plan.estimatedTotalMinutes < 1 ||
    plan.estimatedTotalMinutes > 100000
  ) {
    throw new Error("The assignment time estimate is invalid");
  }

  if (
    plan.assignmentSummary.trim().length < 5 ||
    plan.assignmentSummary.length > 1500
  ) {
    throw new Error("The assignment summary must be between 5 and 1,500 characters");
  }

  if (
    !Array.isArray(plan.dailyTasks) ||
    plan.dailyTasks.length !== plan.recommendedWorkDays ||
    plan.dailyTasks.some(
      (task, index) =>
        task.dayNumber !== index + 1 ||
        task.title.trim().length < 1 ||
        task.title.length > 100 ||
        task.description.trim().length < 1 ||
        task.description.length > 500 ||
        !Number.isInteger(task.estimatedMinutes) ||
        task.estimatedMinutes < 1 ||
        task.estimatedMinutes > 1440,
    )
  ) {
    throw new Error("The daily assignment plan is invalid");
  }

  const dailyPlan = JSON.stringify(plan.dailyTasks);
  if (dailyPlan.length > 10000) {
    throw new Error("The daily assignment plan is too large");
  }

  return {
    assignment_kind: plan.assignmentKind,
    assignment_summary: plan.assignmentSummary.trim(),
    daily_plan: dailyPlan,
    due_date: plan.dueDate,
    estimated_total_minutes: plan.estimatedTotalMinutes,
    recommended_work_days: plan.recommendedWorkDays,
  };
};

const stringArrayFromValue = (value?: FirestoreValue): string[] =>
  value?.arrayValue?.values
    ?.map((item) => item.stringValue)
    .filter((item): item is string => Boolean(item)) ?? [];

const classFromDocument = (
  document: FirestoreDocument,
): SchoolClassRecord | null => {
  const fields = document.fields;
  const id = document.name?.split("/").pop();
  const name = fields?.name?.stringValue;
  const administratorIds = stringArrayFromValue(fields?.administratorIds);
  const studentIds = stringArrayFromValue(fields?.studentIds);
  const studentUsernames = stringArrayFromValue(fields?.studentUsernames);
  const createdBy = fields?.createdBy?.stringValue;

  if (!id || !name || !createdBy || studentIds.length !== studentUsernames.length) {
    return null;
  }

  return {
    administratorIds,
    createdBy,
    id,
    name,
    studentCount: studentIds.length,
    studentIds,
    studentUsernames,
  };
};

const getSchoolClass = async (
  firebaseIdToken: string,
  classId: string,
): Promise<SchoolClassRecord> => {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(classId)) {
    throw new Error("Select a valid class");
  }

  const { firebaseProjectId } = requireServerConfig();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
      `/databases/(default)/documents/classes/${classId}`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${firebaseIdToken}` },
    },
  );

  if (response.status === 404) throw new Error("That class was not found");
  if (!response.ok) throw new Error("Unable to load that class");

  const schoolClass = classFromDocument(
    (await response.json()) as FirestoreDocument,
  );

  if (!schoolClass) throw new Error("That class has invalid roster data");
  return schoolClass;
};

const publicClassSummary = (
  schoolClass: SchoolClassRecord,
): SchoolClassSummary => ({
  id: schoolClass.id,
  name: schoolClass.name,
  studentCount: schoolClass.studentCount,
  studentUsernames: schoolClass.studentUsernames,
});

export async function createToken(firebaseIdToken: string): Promise<string> {
  const profile = await authenticateCaller(firebaseIdToken);
  return serverClient.createToken(profile.uid);
}

export const getAdministratorClasses = async (
  firebaseIdToken: string,
): Promise<{
  classes: SchoolClassSummary[];
  error: string | null;
  success: boolean;
}> => {
  try {
    const administrator = await authenticateCaller(firebaseIdToken);

    if (administrator.role !== "administrator") {
      return {
        classes: [],
        error: "Only administrators can manage classes",
        success: false,
      };
    }

    const { firebaseProjectId } = requireServerConfig();
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
        "/databases/(default)/documents:runQuery",
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${firebaseIdToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "classes" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "administratorIds" },
                op: "ARRAY_CONTAINS",
                value: { stringValue: administrator.uid },
              },
            },
          },
        }),
      },
    );

    if (!response.ok) throw new Error("Unable to load your classes");

    const rows = (await response.json()) as Array<{
      document?: FirestoreDocument;
    }>;
    const classes = rows
      .map((row) => row.document && classFromDocument(row.document))
      .filter((item): item is SchoolClassRecord => Boolean(item))
      .filter((item) => item.administratorIds.includes(administrator.uid))
      .map(publicClassSummary)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { classes, error: null, success: true };
  } catch (error) {
    return {
      classes: [],
      error: error instanceof Error ? error.message : "Unable to load classes",
      success: false,
    };
  }
};

export const createSchoolClass = async (data: {
  firebaseIdToken: string;
  name: string;
  studentUsernames: string[];
}) => {
  try {
    const administrator = await authenticateCaller(data.firebaseIdToken);

    if (administrator.role !== "administrator") {
      return {
        classRecord: null,
        error: "Only administrators can create classes",
        success: false,
      };
    }

    const name = data.name.trim();
    const usernames = [...new Set(
      data.studentUsernames
        .map((username) => username.trim().toLowerCase())
        .filter(Boolean),
    )];

    if (name.length < 2 || name.length > 80) {
      return {
        classRecord: null,
        error: "Class names must be between 2 and 80 characters",
        success: false,
      };
    }

    if (usernames.length === 0) {
      return {
        classRecord: null,
        error: "Add at least one student to the class",
        success: false,
      };
    }

    if (usernames.length > 100) {
      return {
        classRecord: null,
        error: "A class can contain up to 100 students",
        success: false,
      };
    }

    if (usernames.includes(administrator.username)) {
      return {
        classRecord: null,
        error: "Do not include your own administrator username",
        success: false,
      };
    }

    const students = await Promise.all(
      usernames.map((username) => getProfile(data.firebaseIdToken, username)),
    );
    const nonStudent = students.find((profile) => profile.role !== "student");

    if (nonStudent) {
      return {
        classRecord: null,
        error: `The account "${nonStudent.username}" is not a student`,
        success: false,
      };
    }

    const classId = `class-${crypto.randomUUID().replaceAll("-", "")}`;
    const { firebaseProjectId } = requireServerConfig();
    const document: FirestoreDocument = {
      fields: {
        administratorIds: {
          arrayValue: {
            values: [{ stringValue: administrator.uid }],
          },
        },
        createdAt: { timestampValue: new Date().toISOString() },
        createdBy: { stringValue: administrator.uid },
        name: { stringValue: name },
        studentIds: {
          arrayValue: {
            values: students.map((student) => ({ stringValue: student.uid })),
          },
        },
        studentUsernames: {
          arrayValue: {
            values: students.map((student) => ({
              stringValue: student.username,
            })),
          },
        },
      },
    };
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
        `/databases/(default)/documents/classes/${classId}`,
      {
        method: "PATCH",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${data.firebaseIdToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(document),
      },
    );

    if (!response.ok) throw new Error("Unable to save the class roster");

    return {
      classRecord: {
        id: classId,
        name,
        studentCount: students.length,
        studentUsernames: students.map((student) => student.username),
      } satisfies SchoolClassSummary,
      error: null,
      success: true,
    };
  } catch (error) {
    return {
      classRecord: null,
      error: error instanceof Error ? error.message : "Unable to create class",
      success: false,
    };
  }
};

export const updateSchoolClassRoster = async (data: {
  classId: string;
  firebaseIdToken: string;
  studentUsernames: string[];
}) => {
  try {
    const administrator = await authenticateCaller(data.firebaseIdToken);

    if (administrator.role !== "administrator") {
      return {
        classRecord: null,
        error: "Only administrators can edit class rosters",
        success: false,
      };
    }

    const schoolClass = await getSchoolClass(
      data.firebaseIdToken,
      data.classId,
    );

    if (!schoolClass.administratorIds.includes(administrator.uid)) {
      return {
        classRecord: null,
        error: "You do not have permission to edit this class",
        success: false,
      };
    }

    const usernames = [...new Set(
      data.studentUsernames
        .map((username) => username.trim().toLowerCase())
        .filter(Boolean),
    )];

    if (usernames.length === 0) {
      return {
        classRecord: null,
        error: "A class must contain at least one student",
        success: false,
      };
    }

    if (usernames.length > 100) {
      return {
        classRecord: null,
        error: "A class can contain up to 100 students",
        success: false,
      };
    }

    if (usernames.includes(administrator.username)) {
      return {
        classRecord: null,
        error: "Do not add your own administrator username to the roster",
        success: false,
      };
    }

    const students = await Promise.all(
      usernames.map((username) => getProfile(data.firebaseIdToken, username)),
    );
    const nonStudent = students.find((profile) => profile.role !== "student");

    if (nonStudent) {
      return {
        classRecord: null,
        error: `The account "${nonStudent.username}" is not a student`,
        success: false,
      };
    }

    const { firebaseProjectId } = requireServerConfig();
    const updateUrl = new URL(
      `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}` +
        `/databases/(default)/documents/classes/${schoolClass.id}`,
    );
    updateUrl.searchParams.append("updateMask.fieldPaths", "studentIds");
    updateUrl.searchParams.append("updateMask.fieldPaths", "studentUsernames");
    const response = await fetch(updateUrl, {
      method: "PATCH",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${data.firebaseIdToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          studentIds: {
            arrayValue: {
              values: students.map((student) => ({ stringValue: student.uid })),
            },
          },
          studentUsernames: {
            arrayValue: {
              values: students.map((student) => ({
                stringValue: student.username,
              })),
            },
          },
        },
      } satisfies FirestoreDocument),
    });

    if (!response.ok) throw new Error("Unable to update the class roster");

    return {
      classRecord: {
        id: schoolClass.id,
        name: schoolClass.name,
        studentCount: students.length,
        studentUsernames: students.map((student) => student.username),
      } satisfies SchoolClassSummary,
      error: null,
      success: true,
    };
  } catch (error) {
    return {
      classRecord: null,
      error:
        error instanceof Error ? error.message : "Unable to update roster",
      success: false,
    };
  }
};

export const createClassAssignment = async (data: {
  classId: string;
  firebaseIdToken: string;
  plan: AssignmentPlan;
  requestId: string;
  title: string;
}) => {
  try {
    const administrator = await authenticateCaller(data.firebaseIdToken);

    if (administrator.role !== "administrator") {
      return {
        createdCount: 0,
        error: "Only administrators can assign work to a class",
        success: false,
      };
    }

    const title = data.title.trim();
    const planData = validateAssignmentPlan(data.plan);
    const requestId = data.requestId.replaceAll("-", "").toLowerCase();

    if (title.length < 3 || title.length > 100) {
      return {
        createdCount: 0,
        error: "Assignment titles must be between 3 and 100 characters",
        success: false,
      };
    }

    if (!/^[a-f0-9]{32}$/.test(requestId)) {
      return {
        createdCount: 0,
        error: "This assignment request is invalid. Close the form and try again.",
        success: false,
      };
    }

    const schoolClass = await getSchoolClass(
      data.firebaseIdToken,
      data.classId,
    );

    if (!schoolClass.administratorIds.includes(administrator.uid)) {
      return {
        createdCount: 0,
        error: "You do not have permission to assign work to this class",
        success: false,
      };
    }

    const students = await Promise.all(
      schoolClass.studentUsernames.map((username) =>
        getProfile(data.firebaseIdToken, username),
      ),
    );

    if (students.length === 0 || students.some((student) => student.role !== "student")) {
      return {
        createdCount: 0,
        error: "This class does not contain a valid student roster",
        success: false,
      };
    }

    // The browser keeps this request ID stable while the form remains open.
    // A retry therefore targets the same Stream channels instead of creating
    // duplicates for students whose first request already succeeded.
    const batchId = requestId.slice(0, 12);
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 25) || "assignment";
    const results = await Promise.allSettled(
      students.map(async (student, index) => {
        const channel = serverClient.channel(
          "messaging",
          `individual-${slug}-${batchId}-${index + 1}`,
          {
            ...planData,
            assignment_title: title,
            assignment_type: "individual",
            class_id: schoolClass.id,
            class_name: schoolClass.name,
            created_by_id: administrator.uid,
            members: [administrator.uid, student.uid],
            name: `${title} · ${student.username}`,
            student_username: student.username,
          },
        );

        await channel.create();
      }),
    );
    const createdCount = results.filter(
      (result) => result.status === "fulfilled",
    ).length;

    if (createdCount !== students.length) {
      return {
        createdCount,
        error: `Created ${createdCount} of ${students.length} assignments. Retry only for students who are missing one.`,
        success: false,
      };
    }

    return { createdCount, error: null, success: true };
  } catch (error) {
    return {
      createdCount: 0,
      error:
        error instanceof Error
          ? error.message
          : "Unable to assign work to the class",
      success: false,
    };
  }
};

export const createAssignmentChannel = async (
  data: AssignmentChannelArgs,
) => {
  try {
    const creator = await authenticateCaller(data.firebaseIdToken);

    if (creator.role !== "administrator") {
      return {
        success: false,
        error: "Only administrators can create assignments and streaks",
        id: null,
      };
    }

    const title = data.title.trim();
    const planData = validateAssignmentPlan(data.plan);

    if (
      data.assignmentType !== "individual" &&
      data.assignmentType !== "group"
    ) {
      return {
        success: false,
        error: "Select a valid assignment type",
        id: null,
      };
    }

    if (title.length < 3 || title.length > 100) {
      return {
        success: false,
        error: "Assignment titles must be between 3 and 100 characters",
        id: null,
      };
    }

    const usernames = [...new Set(
      data.memberUsernames
        .map((username) => username.trim().toLowerCase())
        .filter(Boolean),
    )];

    if (usernames.includes(creator.username)) {
      return {
        success: false,
        error: "Do not include your own username; you are added automatically",
        id: null,
      };
    }

    if (data.assignmentType === "individual" && usernames.length !== 1) {
      return {
        success: false,
        error: "An individual assignment must include exactly one student",
        id: null,
      };
    }

    if (data.assignmentType === "group" && usernames.length < 2) {
      return {
        success: false,
        error: "A group project must include at least two additional members",
        id: null,
      };
    }

    const invitedProfiles = await Promise.all(
      usernames.map((username) => getProfile(data.firebaseIdToken, username)),
    );

    if (
      data.assignmentType === "individual" &&
      invitedProfiles[0]?.role !== "student"
    ) {
      return {
        success: false,
        error: "An individual assignment must be assigned to a student",
        id: null,
      };
    }

    if (
      data.assignmentType === "group" &&
      !invitedProfiles.some((profile) => profile.role === "student")
    ) {
      return {
        success: false,
        error: "A group project must include at least one student",
        id: null,
      };
    }

    const members = [...new Set([
      creator.uid,
      ...invitedProfiles.map((profile) => profile.uid),
    ])];

    if (data.assignmentType === "group" && members.length < 3) {
      return {
        success: false,
        error: "A group project must include at least three different people",
        id: null,
      };
    }
    const channelType =
      data.assignmentType === "individual" ? "messaging" : "livestream";
    const channel = serverClient.channel(
      channelType,
      generateAssignmentChannelId(data.assignmentType, title),
      {
        ...planData,
        assignment_title: title,
        assignment_type: data.assignmentType,
        created_by_id: creator.uid,
        members,
        name: title,
      },
    );

    await channel.create();

    return { success: true, error: null, id: channel.id };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to create the assignment",
      id: null,
    };
  }
};
