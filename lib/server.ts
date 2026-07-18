import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import type { ChannelMemberResponse } from "stream-chat";

import { isAvatarChoice } from "./avatar-options";
import db, { auth } from "./firebase";

export type AccountRole = "student" | "administrator" | "parent";
export type StudentMode = "independent" | "school";

export const registerUser = async (form: FormData) => {
  let createdUser: typeof auth.currentUser = null;

  try {
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    const username = String(form.get("username") ?? "")
      .trim()
      .toLowerCase();
    const displayName = String(form.get("displayName") ?? "")
      .trim()
      .replace(/\s+/g, " ");
    const roleValue = form.get("role");
    const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_URL;

    if (!email || !password || !username || !displayName) {
      throw new Error("Display name, email, password, and username are required");
    }

    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
      throw new Error(
        "Username must be 3-30 characters and use only letters, numbers, dots, underscores, or hyphens",
      );
    }

    if (displayName.length > 60) {
      throw new Error("Display name must be 60 characters or fewer");
    }

    if (password.length < 8) {
      throw new Error("Password must contain at least 8 characters");
    }

    if (roleValue !== "student" && roleValue !== "administrator" && roleValue !== "parent") {
      throw new Error("Select a valid account type");
    }

    if (!imageBaseUrl) {
      throw new Error("User image configuration is missing");
    }

    const role: AccountRole = roleValue;
    // Keep a single compatibility value for existing Firestore profiles and
    // rules. Student capabilities no longer depend on this legacy field.
    const studentMode: StudentMode | null = role === "student" ? "school" : null;
    const photoURL = `${imageBaseUrl}${encodeURIComponent(username)}`;
    const userRef = doc(db, "users", username);

    const { user } = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    createdUser = user;

    await updateProfile(user, {
      displayName: username,
      photoURL,
    });

    await runTransaction(db, async (transaction) => {
      const usernameRecord = await transaction.get(userRef);

      // Recheck inside the transaction to prevent simultaneous registrations
      // from claiming the same username.
      if (usernameRecord.exists()) {
        throw new Error("That username is already taken");
      }

      const profileData = {
        uid: user.uid,
        username,
        displayName,
        email: user.email,
        photoURL,
        role,
        ...(studentMode ? { studentMode } : {}),
        createdAt: serverTimestamp(),
      };
      transaction.set(userRef, profileData);
      transaction.set(doc(db, "profiles", user.uid), {
        ...profileData,
        email: null,
      });
    });

    return {
      code: "auth/success" as const,
      status: 200,
      user,
      message: "Account created successfully! 🎉",
    };
  } catch (error: unknown) {
    // Avoid leaving an Auth account without its matching Firestore profile.
    if (createdUser) {
      await deleteUser(createdUser).catch(() => undefined);
    }

    return {
      code: "auth/failed" as const,
      status: 500,
      user: null,
      message:
        error instanceof Error ? error.message : "Unable to create account",
      error,
    };
  }
};

export const changeDisplayName = async (displayNameValue: string) => {
  const user = auth.currentUser;
  const displayName = displayNameValue.trim().replace(/\s+/g, " ");

  try {
    if (!user) throw new Error("You must be signed in");
    if (!displayName) throw new Error("Enter a display name");
    if (displayName.length > 60) {
      throw new Error("Display name must be 60 characters or fewer");
    }

    const profileRef = doc(db, "profiles", user.uid);
    const profile = await getDoc(profileRef);
    const username = profile.data()?.username?.trim().toLowerCase();
    if (!profile.exists() || !username || profile.data()?.uid !== user.uid) {
      throw new Error("Your profile could not be verified");
    }

    const usernameRef = doc(db, "users", username);
    await runTransaction(db, async (transaction) => {
      const [stableProfile, usernameProfile] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(usernameRef),
      ]);
      if (
        stableProfile.data()?.uid !== user.uid ||
        usernameProfile.data()?.uid !== user.uid
      ) {
        throw new Error("Your profile could not be verified");
      }
      const update = { displayName, updatedAt: serverTimestamp() };
      const stableProfileData = stableProfile.data();
      const usernameProfileData = usernameProfile.data();
      const stableProfileNeedsStudentMode =
        stableProfileData?.role === "student" &&
        !Object.prototype.hasOwnProperty.call(stableProfileData, "studentMode");
      const usernameProfileNeedsStudentMode =
        usernameProfileData?.role === "student" &&
        !Object.prototype.hasOwnProperty.call(usernameProfileData, "studentMode");
      transaction.set(
        profileRef,
        {
          ...update,
          ...(stableProfileNeedsStudentMode ? { studentMode: "school" } : {}),
        },
        { merge: true },
      );
      transaction.set(
        usernameRef,
        {
          ...update,
          ...(usernameProfileNeedsStudentMode ? { studentMode: "school" } : {}),
        },
        { merge: true },
      );
    });

    return { success: true, message: "Display name updated successfully" };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Unable to update display name",
    };
  }
};

export const loginUser = async (form: FormData) => {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  let authenticatedThisAttempt = false;

  try {
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const { user } = await signInWithEmailAndPassword(auth, email, password);
    authenticatedThisAttempt = true;

    if (!user.displayName) {
      await signOut(auth);
      return {
        code: "auth/profile-missing" as const,
        status: 403,
        user: null,
        message: "This account does not have a user profile",
      };
    }

    let profile;
    try {
      profile = await getDoc(doc(db, "profiles", user.uid));
    } catch {
      // Existing Firebase projects may not have deployed the UID-profile
      // rules yet, so retain the username-keyed profile as a safe fallback.
      profile = await getDoc(doc(db, "users", user.displayName));
    }
    if (!profile.exists()) {
      profile = await getDoc(doc(db, "users", user.displayName));
    }
    const storedRole = profile.data()?.role;
    if (storedRole !== "student" && storedRole !== "administrator" && storedRole !== "parent") {
      await signOut(auth);
      return {
        code: "auth/profile-missing" as const,
        status: 403,
        user: null,
        message: "This account does not have a valid SnapSchool role",
      };
    }

    return {
      code: "auth/success" as const,
      status: 200,
      user,
      role: storedRole as AccountRole,
      message: "Logged in successfully! 🎉",
    };
  } catch (error: unknown) {
    if (authenticatedThisAttempt) {
      await signOut(auth).catch(() => undefined);
    }

    return {
      code: "auth/failed" as const,
      status: 500,
      user: null,
      message:
        error instanceof Error ? error.message : "Failed to login user",
      error,
    };
  }
};

export const changeUsername = async (newUsernameValue: string) => {
  const user = auth.currentUser;
  const newUsername = newUsernameValue.trim().toLowerCase();

  try {
    if (!user) throw new Error("You must be signed in");
    if (!/^[a-z0-9_.-]{3,30}$/.test(newUsername)) {
      throw new Error("Username must be 3-30 characters and use only letters, numbers, dots, underscores, or hyphens");
    }

    const profileRef = doc(db, "profiles", user.uid);
    const stableProfile = await getDoc(profileRef);
    const stableProfileData = stableProfile.data();
    const storedUsername =
      stableProfile.exists() &&
      stableProfileData?.uid === user.uid &&
      typeof stableProfileData.username === "string"
        ? stableProfileData.username.trim().toLowerCase()
        : "";
    const authUsername = user.displayName?.trim().toLowerCase() ?? "";
    const currentUsername = storedUsername || authUsername;

    if (!currentUsername) throw new Error("Your existing profile could not be verified");

    const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_URL;
    if (!imageBaseUrl) throw new Error("User image configuration is missing");
    const generatedPhotoURL = `${imageBaseUrl}${encodeURIComponent(newUsername)}`;
    const previousPhotoURL =
      typeof stableProfileData?.photoURL === "string"
        ? stableProfileData.photoURL
        : user.photoURL;
    const photoURL = previousPhotoURL || generatedPhotoURL;

    if (newUsername === currentUsername) {
      if (authUsername !== currentUsername || user.photoURL !== photoURL) {
        await updateProfile(user, { displayName: currentUsername, photoURL });
      }
      return { success: true, message: "Your username is already up to date" };
    }

    const currentRef = doc(db, "users", currentUsername);
    const nextRef = doc(db, "users", newUsername);

    await updateProfile(user, { displayName: newUsername, photoURL });
    try {
      await runTransaction(db, async (transaction) => {
        const [currentProfile, nextProfile, currentStableProfile] = await Promise.all([
          transaction.get(currentRef),
          transaction.get(nextRef),
          transaction.get(profileRef),
        ]);

        const transactionUsername = currentStableProfile
          .data()
          ?.username?.trim()
          .toLowerCase();
        if (
          currentStableProfile.exists() &&
          transactionUsername &&
          transactionUsername !== currentUsername
        ) {
          throw new Error("Your profile changed while saving. Please try again");
        }

        const currentProfileData = currentProfile.exists()
          ? currentProfile.data()
          : null;
        const nextProfileData = nextProfile.exists() ? nextProfile.data() : null;
        if (currentProfileData?.uid !== user.uid && nextProfileData?.uid !== user.uid) {
          throw new Error("Your existing profile could not be verified");
        }
        if (nextProfile.exists() && nextProfileData?.uid !== user.uid) {
          throw new Error("That username is already taken");
        }

        const sourceProfile = currentProfileData ?? nextProfileData;
        if (!sourceProfile) throw new Error("Your existing profile could not be verified");

        const updatedProfile = {
          ...sourceProfile,
          username: newUsername,
          photoURL,
          ...(sourceProfile.role === "student"
            ? {
                studentMode:
                  sourceProfile.studentMode === "independent"
                    ? "independent"
                    : "school",
              }
            : {}),
          updatedAt: serverTimestamp(),
        };
        transaction.set(nextRef, updatedProfile);
        transaction.set(profileRef, {
          uid: user.uid,
          username: newUsername,
          photoURL,
          role: sourceProfile.role,
          ...(sourceProfile.role === "student"
            ? {
                studentMode:
                  sourceProfile.studentMode === "independent"
                    ? "independent"
                    : "school",
              }
            : {}),
          createdAt: sourceProfile.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        if (currentProfile.exists()) transaction.delete(currentRef);
      });
    } catch (error) {
      await updateProfile(user, {
        displayName: currentUsername,
        photoURL: previousPhotoURL,
      }).catch(() => undefined);
      throw error;
    }

    return { success: true, message: "Username updated successfully" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to update username",
    };
  }
};

export const changeAvatar = async (photoURLValue: string) => {
  const user = auth.currentUser;

  try {
    if (!user) throw new Error("You must be signed in");
    const username = user.displayName?.trim().toLowerCase();
    if (!username) throw new Error("Your profile could not be verified");

    const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_URL;
    if (!imageBaseUrl) throw new Error("User image configuration is missing");
    const photoURL = photoURLValue.trim();
    if (!isAvatarChoice(imageBaseUrl, photoURL)) {
      throw new Error("Choose one of the available SnapSchool avatars");
    }

    const profileRef = doc(db, "profiles", user.uid);
    const usernameRef = doc(db, "users", username);
    const previousPhotoURL = user.photoURL;

    await updateProfile(user, { photoURL });
    try {
      await runTransaction(db, async (transaction) => {
        const [profile, usernameProfile] = await Promise.all([
          transaction.get(profileRef),
          transaction.get(usernameRef),
        ]);
        const profileData = profile.data();
        const usernameData = usernameProfile.data();

        if (
          (profile.exists() && profileData?.uid !== user.uid) ||
          (usernameProfile.exists() && usernameData?.uid !== user.uid)
        ) {
          throw new Error("Your profile could not be verified");
        }
        if (!profile.exists() && !usernameProfile.exists()) {
          throw new Error("Your profile could not be found");
        }

        if (profile.exists()) {
          transaction.set(
            profileRef,
            {
              photoURL,
              updatedAt: serverTimestamp(),
              ...(profileData?.role === "student" && !profileData.studentMode
                ? { studentMode: "school" }
                : {}),
            },
            { merge: true },
          );
        }
        if (usernameProfile.exists()) {
          transaction.set(
            usernameRef,
            {
              photoURL,
              updatedAt: serverTimestamp(),
              ...(usernameData?.role === "student" && !usernameData.studentMode
                ? { studentMode: "school" }
                : {}),
            },
            { merge: true },
          );
        }
      });
    } catch (error) {
      await updateProfile(user, { photoURL: previousPhotoURL }).catch(() => undefined);
      throw error;
    }

    return { success: true, message: "Avatar updated successfully" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to update avatar",
    };
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);

    return {
      code: "auth/success" as const,
      status: 200,
      user: null,
      message: "Logged out successfully! 🎉",
    };
  } catch (error: unknown) {
    return {
      code: "auth/failed" as const,
      status: 500,
      user: null,
      message: "Failed to logout user",
      error,
    };
  }
};

// Get Firebase user IDs from SchoolSnap usernames.
export const getUserIDsByUsernames = async (
  usernames: string[],
): Promise<string[]> => {
  const memberIDs = new Set<string>();

  for (const name of usernames) {
    const username = name.trim().toLowerCase();

    if (!username) continue;

    const userRef = doc(db, "users", username);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const uid = userDoc.data().uid;

      if (typeof uid === "string" && uid) {
        memberIDs.add(uid);
      }
    }
  }

  return [...memberIDs];
};

// Get a Stream member's display name from their Firebase user ID.
export const getUsernameById = (
  members: Record<string, ChannelMemberResponse>,
  userId: string,
): string | null => {
  for (const member of Object.values(members)) {
    if (member.user_id === userId) {
      return member.user?.name ?? null;
    }
  }

  return null;
};

// Compare two dates using UTC calendar boundaries.
export const isSameUTCDate = (date: Date, today: Date): boolean => {
  return (
    date.getUTCFullYear() === today.getUTCFullYear() &&
    date.getUTCMonth() === today.getUTCMonth() &&
    date.getUTCDate() === today.getUTCDate()
  );
};

// Count at most one streak day per channel and UTC calendar date.
export async function updateChatStreak(
  channelId: string,
  today: Date,
  targetDays?: number,
): Promise<void> {
  if (!channelId.trim()) {
    throw new Error("A channel ID is required to update a streak");
  }

  if (Number.isNaN(today.getTime())) {
    throw new Error("A valid date is required to update a streak");
  }

  if (
    targetDays !== undefined &&
    (!Number.isInteger(targetDays) || targetDays < 1 || targetDays > 60)
  ) {
    throw new Error("A streak target must be between 1 and 60 days");
  }

  const todayString = today.toISOString().split("T")[0];
  const streakRef = doc(db, "channels", channelId);

  await runTransaction(db, async (transaction) => {
    const streakSnap = await transaction.get(streakRef);
    const streakData = streakSnap.exists() ? streakSnap.data() : {};
    const currentStreak =
      typeof streakData.currentStreak === "number"
        ? streakData.currentStreak
        : 0;
    const lastStreakDate =
      typeof streakData.lastStreakDate === "string"
        ? streakData.lastStreakDate
        : null;

    if (targetDays !== undefined && currentStreak >= targetDays) return;

    let newStreak = 1;

    if (lastStreakDate) {
      const dayDiff = differenceInCalendarDays(
        parseISO(todayString),
        parseISO(lastStreakDate),
      );

      // Today was already counted, or the stored date is unexpectedly newer.
      if (dayDiff <= 0) return;

      newStreak = dayDiff === 1 ? currentStreak + 1 : 1;
    }

    if (targetDays !== undefined) newStreak = Math.min(newStreak, targetDays);

    transaction.set(
      streakRef,
      {
        currentStreak: newStreak,
        lastStreakDate: todayString,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}
