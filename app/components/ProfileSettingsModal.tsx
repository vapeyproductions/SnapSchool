"use client";

import { BellRing, Check, ChevronDown, Clock3, KeyRound, Loader2, Mail, ShieldCheck, Sparkles, UserRound, UserRoundPlus, X } from "lucide-react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  getProfileSettings,
  removeFamilyConnection,
  requestParentConnection,
  respondToParentConnection,
  saveParentEmailPreferences,
  type FamilyConnection,
  type ParentEmailPreferences,
} from "@/actions/profile";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAvatarChoices } from "@/lib/avatar-options";
import { changeAvatar, changeDisplayName, changeUsername } from "@/lib/server";

import AuthContext from "./AuthContext";

const defaultParentEmailPreferences: ParentEmailPreferences = {
  enabled: false,
  mode: "due_only",
  timeZone: "America/New_York",
  urgentThresholdHours: 1.5,
};

const authErrorMessage = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "That email address is already connected to another account.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "The current password is incorrect.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/requires-recent-login":
      return "Please log out, sign in again, and retry this security change.";
    case "auth/too-many-requests":
      return "Too many attempts were made. Wait a few minutes and try again.";
    case "auth/weak-password":
      return "Choose a stronger password that meets Firebase’s password requirements.";
    default:
      return error instanceof Error ? error.message : "Unable to update sign-in settings.";
  }
};

function SettingsDisclosure({
  children,
  className,
  description,
  icon,
  title,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  description: string;
  icon: ReactNode;
  title: string;
  tone?: "blue" | "cream" | "peach" | "purple" | "yellow" | "neutral";
}) {
  return (
    <details
      className={`settings-disclosure group overflow-hidden rounded-2xl border-2 border-black ${className ?? ""}`}
      data-setting-tone={tone}
      data-settings-disclosure
    >
      <summary className="settings-disclosure-summary flex cursor-pointer list-none items-center gap-3 p-4 outline-none transition focus-visible:ring-4 focus-visible:ring-[#7b61ff] [&::-webkit-details-marker]:hidden">
        <span className="settings-disclosure-icon flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-black bg-white">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-black">{title}</span>
          <span className="settings-disclosure-description mt-0.5 block text-xs leading-5 text-zinc-600">{description}</span>
        </span>
        <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="settings-disclosure-content border-t-2 border-black p-4">{children}</div>
    </details>
  );
}

export default function ProfileSettingsModal({ open }: { open: boolean }) {
  const { displayName, role, user, username } = useContext(AuthContext);
  const contentRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<FamilyConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [emailPreferences, setEmailPreferences] =
    useState<ParentEmailPreferences>(defaultParentEmailPreferences);
  const avatarChoices = useMemo(
    () => getAvatarChoices(process.env.NEXT_PUBLIC_IMAGE_URL ?? ""),
    [],
  );
  const [selectedAvatar, setSelectedAvatar] = useState(user?.photoURL ?? "");

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const content = contentRef.current;
      content
        ?.querySelectorAll<HTMLDetailsElement>("details[data-settings-disclosure]")
        .forEach((section) => {
          section.open = false;
        });
      content?.scrollTo({ behavior: "auto", top: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const loadSettings = async () => {
    if (!user) return;
    const firebaseIdToken = await user.getIdToken();
    setIsLoading(true);
    setErrorMessage("");
    const result = await getProfileSettings(firebaseIdToken);
    if (result.success) {
      setConnections(result.connections);
      if (result.emailPreferences) {
        setEmailPreferences(result.emailPreferences);
      }
    }
    else setErrorMessage(result.error ?? "Unable to load settings");
    setIsLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    let active = true;
    user.getIdToken()
      .then((firebaseIdToken) => getProfileSettings(firebaseIdToken))
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setConnections(result.connections);
          if (result.emailPreferences) {
            setEmailPreferences(result.emailPreferences);
          }
        }
        else setErrorMessage(result.error ?? "Unable to load settings");
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setErrorMessage("Unable to load profile settings");
        setIsLoading(false);
      });
    return () => { active = false; };
  }, [user]);

  const updateUsername = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId("username");
    setErrorMessage("");
    setMessage("");
    const username = String(new FormData(event.currentTarget).get("username") ?? "");
    const result = await changeUsername(username);
    if (!result.success) {
      setErrorMessage(result.message);
      setBusyId("");
      return;
    }
    setMessage(result.message);
    await user?.reload();
    window.location.reload();
  };

  const updateDisplayName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId("display-name");
    setErrorMessage("");
    setMessage("");
    const nextDisplayName = String(
      new FormData(event.currentTarget).get("displayName") ?? "",
    );
    const result = await changeDisplayName(nextDisplayName);
    if (!result.success) {
      setErrorMessage(result.message);
      setBusyId("");
      return;
    }
    setMessage(result.message);
    window.location.reload();
  };

  const updateAvatar = async () => {
    if (!user || !selectedAvatar) return;
    setBusyId("avatar");
    setErrorMessage("");
    setMessage("");
    const result = await changeAvatar(selectedAvatar);
    if (!result.success) {
      setErrorMessage(result.message);
      setBusyId("");
      return;
    }
    setMessage(result.message);
    await user.reload();
    window.location.reload();
  };

  const confirmCurrentPassword = async (currentPassword: string) => {
    if (!user?.email) throw new Error("This account does not have an email sign-in address.");
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, currentPassword),
    );
  };

  const updateSignInEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const nextEmail = String(data.get("newEmail") ?? "").trim().toLowerCase();
    setBusyId("sign-in-email");
    setErrorMessage("");
    setMessage("");
    try {
      if (nextEmail === user.email?.toLowerCase()) {
        throw new Error("Enter a different email address.");
      }
      await confirmCurrentPassword(currentPassword);
      await verifyBeforeUpdateEmail(user, nextEmail);
      setMessage(
        `Verification sent to ${nextEmail}. Open that email to finish changing your sign-in address.`,
      );
      form.reset();
    } catch (error) {
      setErrorMessage(authErrorMessage(error));
    } finally {
      setBusyId("");
    }
  };

  const updateSignInPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const nextPassword = String(data.get("newPassword") ?? "");
    const confirmedPassword = String(data.get("confirmPassword") ?? "");
    setBusyId("sign-in-password");
    setErrorMessage("");
    setMessage("");
    try {
      if (nextPassword !== confirmedPassword) {
        throw new Error("The new passwords do not match.");
      }
      if (nextPassword === currentPassword) {
        throw new Error("Choose a new password that differs from the current password.");
      }
      await confirmCurrentPassword(currentPassword);
      await updatePassword(user, nextPassword);
      setMessage("Password updated successfully.");
      form.reset();
    } catch (error) {
      setErrorMessage(authErrorMessage(error));
    } finally {
      setBusyId("");
    }
  };

  const requestStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    setBusyId("request");
    setErrorMessage("");
    setMessage("");
    const studentUsername = String(new FormData(form).get("studentUsername") ?? "");
    const result = await requestParentConnection({
      firebaseIdToken: await user.getIdToken(),
      studentUsername,
    });
    if (!result.success) setErrorMessage(result.error ?? "Unable to send request");
    else {
      setMessage("Request sent. The student must approve it from Profile Settings.");
      form.reset();
      await loadSettings();
    }
    setBusyId("");
  };

  const respond = async (connectionId: string, approved: boolean) => {
    if (!user) return;
    setBusyId(connectionId);
    setErrorMessage("");
    setMessage("");
    const result = await respondToParentConnection({
      approved,
      connectionId,
      firebaseIdToken: await user.getIdToken(),
    });
    if (!result.success) setErrorMessage(result.error ?? "Unable to save response");
    else {
      setMessage(approved ? "Parent access approved." : "Request declined.");
      await loadSettings();
    }
    setBusyId("");
  };

  const removeConnection = async (connectionId: string) => {
    if (!user) return;
    setBusyId(connectionId);
    setErrorMessage("");
    setMessage("");
    const result = await removeFamilyConnection({
      connectionId,
      firebaseIdToken: await user.getIdToken(),
    });
    if (!result.success) setErrorMessage(result.error ?? "Unable to remove connection");
    else {
      setMessage(role === "student" ? "Parent access revoked." : "Connection removed.");
      await loadSettings();
    }
    setBusyId("");
  };

  const updateEmailPreferences = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!user || role !== "parent") return;
    setBusyId("email-preferences");
    setErrorMessage("");
    setMessage("");
    const result = await saveParentEmailPreferences({
      ...emailPreferences,
      firebaseIdToken: await user.getIdToken(),
      timeZone:
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        emailPreferences.timeZone,
    });
    if (!result.success || !result.preferences) {
      setErrorMessage(
        result.error ?? "Unable to save email notification preferences",
      );
    } else {
      setEmailPreferences(result.preferences);
      setMessage("Parent email preferences saved.");
    }
    setBusyId("");
  };

  const pendingRequests = connections.filter((connection) => connection.status === "pending");
  const approvedConnections = connections.filter((connection) => connection.status === "approved");

  return (
    <DialogContent ref={contentRef} className="max-h-[90vh] overflow-y-auto rounded-[2rem] border-2 border-black sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Profile settings</DialogTitle>
        <DialogDescription>
          Manage your profile, sign-in security, and approved family supervision.
        </DialogDescription>
      </DialogHeader>

      <SettingsDisclosure
        className={role === "parent" ? "order-3" : role === "student" ? "order-2" : "order-1"}
        description={`${displayName || username} · @${username}`}
        icon={<UserRound className="size-5" />}
        title="Profile names"
        tone="cream"
      >
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={updateDisplayName}>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-black uppercase tracking-wider">Display name</span>
            <input className="w-full rounded-xl border-2 border-black bg-white px-3 py-2.5" defaultValue={displayName || username} maxLength={60} name="displayName" required />
          </label>
          <button className="w-full self-end rounded-xl border-2 border-black bg-[#fffc00] px-4 py-2.5 font-black disabled:opacity-60 sm:w-52" disabled={busyId === "display-name"} type="submit">
            {busyId === "display-name" ? "Updating…" : "Change display name"}
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-500">This is the friendly name shown on dashboards. It does not need to be unique.</p>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={updateUsername}>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-black uppercase tracking-wider">Unique username</span>
            <input className="w-full rounded-xl border-2 border-black bg-white px-3 py-2.5" defaultValue={username} minLength={3} maxLength={30} name="username" required />
          </label>
          <button className="w-full self-end rounded-xl border-2 border-black bg-[#fffc00] px-4 py-2.5 font-black disabled:opacity-60 sm:w-52" disabled={busyId === "username"} type="submit">
            {busyId === "username" ? "Updating…" : "Change username"}
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-500">Usernames use letters, numbers, dots, underscores, or hyphens.</p>
      </SettingsDisclosure>

      <SettingsDisclosure
        className={role === "parent" ? "order-4" : role === "student" ? "order-3" : "order-2"}
        description="Change your email address or password"
        icon={<KeyRound className="size-5" />}
        title="Sign-in & security"
        tone="blue"
      >
        <form className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-[#f4f0e8] p-3" onSubmit={updateSignInEmail}>
          <div>
            <p className="text-sm font-black">Change email address</p>
            <p className="text-xs text-zinc-500">Current email: {user?.email ?? "Not available"}</p>
          </div>
          <label className="block text-xs font-bold">New email<input autoComplete="email" className="mt-1 w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-sm font-normal" maxLength={254} name="newEmail" required type="email" /></label>
          <label className="block text-xs font-bold">Current password<input autoComplete="current-password" className="mt-1 w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-sm font-normal" maxLength={128} minLength={6} name="currentPassword" required type="password" /></label>
          <button className="w-full rounded-xl border-2 border-black bg-white px-4 py-2.5 font-black disabled:opacity-50" disabled={busyId === "sign-in-email"} type="submit">{busyId === "sign-in-email" ? "Sending verification…" : "Send verification to new email"}</button>
          <p className="text-xs leading-5 text-zinc-500">Your current email remains active until you open the verification link sent to the new address.</p>
        </form>

        <form className="mt-3 space-y-3 rounded-xl border border-zinc-200 bg-[#f4f0e8] p-3" onSubmit={updateSignInPassword}>
          <p className="text-sm font-black">Change password</p>
          <label className="block text-xs font-bold">Current password<input autoComplete="current-password" className="mt-1 w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-sm font-normal" maxLength={128} minLength={6} name="currentPassword" required type="password" /></label>
          <label className="block text-xs font-bold">New password<input autoComplete="new-password" className="mt-1 w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-sm font-normal" maxLength={128} minLength={8} name="newPassword" required type="password" /></label>
          <label className="block text-xs font-bold">Confirm new password<input autoComplete="new-password" className="mt-1 w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-sm font-normal" maxLength={128} minLength={8} name="confirmPassword" required type="password" /></label>
          <button className="w-full rounded-xl border-2 border-black bg-black px-4 py-2.5 font-black text-white disabled:opacity-50" disabled={busyId === "sign-in-password"} type="submit">{busyId === "sign-in-password" ? "Updating password…" : "Change password"}</button>
        </form>
      </SettingsDisclosure>

      <SettingsDisclosure
        className={role === "parent" ? "order-5" : role === "student" ? "order-4" : "order-3"}
        description="Choose or change your profile character"
        icon={<Sparkles className="size-5" />}
        title="Profile avatar"
        tone="peach"
      >
        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-5">
          {avatarChoices.map((avatar) => {
            const selected = selectedAvatar === avatar.url;
            return (
              <button
                aria-label={`Choose ${avatar.label} avatar`}
                aria-pressed={selected}
                className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-[#f4f0e8] p-1 transition hover:-translate-y-0.5 hover:border-black ${selected ? "border-black ring-4 ring-[#fffc00]" : "border-zinc-200"}`}
                key={avatar.id}
                onClick={() => setSelectedAvatar(avatar.url)}
                type="button"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" className="size-full rounded-lg object-cover" src={avatar.url} />
                {selected && (
                  <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black text-white">
                    <Check className="size-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          className="mt-4 w-full rounded-xl border-2 border-black bg-[#fffc00] px-4 py-2.5 font-black disabled:opacity-50"
          disabled={busyId === "avatar" || !selectedAvatar || selectedAvatar === user?.photoURL}
          onClick={() => void updateAvatar()}
          type="button"
        >
          {busyId === "avatar" ? "Saving avatar…" : "Save avatar"}
        </button>
      </SettingsDisclosure>

      {role === "parent" && (
        <SettingsDisclosure
          className="order-2"
          description={`Choose progress updates sent to ${user?.email ?? "your email"}`}
          icon={<Mail className="size-5" />}
          title="Student progress emails"
          tone="yellow"
        >
          <form className="mt-4 space-y-3" onSubmit={updateEmailPreferences}>
            <label className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-white p-3">
              <span><strong className="block text-sm">Receive progress emails</strong><span className="text-xs text-zinc-500">Turn this off at any time.</span></span>
              <input
                checked={emailPreferences.enabled}
                className="size-5 accent-black"
                onChange={(event) => setEmailPreferences((current) => ({ ...current, enabled: event.target.checked }))}
                type="checkbox"
              />
            </label>

            <fieldset className="space-y-2" disabled={!emailPreferences.enabled}>
              <legend className="mb-2 text-xs font-black uppercase tracking-[0.12em]">Choose one update schedule</legend>
              {([
                ["due_only", "Due and overdue only", "On the due date—and while overdue—receive progress and remaining-work summaries."],
                ["due_or_urgent", "Due, overdue, or urgently behind", "Also email the day before a deadline when the remaining workload exceeds your threshold."],
                ["daily_summary", "Daily family summary", "Daily completion, deadlines, remaining work, future workload, and overdue status."],
              ] as const).map(([mode, title, description]) => (
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${emailPreferences.mode === mode ? "border-black bg-[#e9e3ff]" : "border-zinc-300 bg-white"}`} key={mode}>
                  <input
                    checked={emailPreferences.mode === mode}
                    className="mt-1 size-4 accent-black"
                    name="emailMode"
                    onChange={() => setEmailPreferences((current) => ({ ...current, mode }))}
                    type="radio"
                    value={mode}
                  />
                  <span><strong className="block text-sm">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-zinc-600">{description}</span></span>
                </label>
              ))}
            </fieldset>

            {emailPreferences.enabled && emailPreferences.mode === "due_or_urgent" && (
              <label className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-white p-3 text-sm font-bold">
                <span className="flex items-center gap-2"><Clock3 className="size-4" /> Urgent when more than</span>
                <span className="flex items-center gap-2">
                  <input
                    className="w-20 rounded-lg border-2 border-black px-2 py-1.5 text-right"
                    max={24}
                    min={0.5}
                    onChange={(event) => setEmailPreferences((current) => ({ ...current, urgentThresholdHours: Number(event.target.value) }))}
                    step={0.5}
                    type="number"
                    value={emailPreferences.urgentThresholdHours}
                  />
                  hours remain
                </span>
              </label>
            )}

            <p className="flex items-center gap-2 text-xs text-zinc-500"><BellRing className="size-4" /> Summaries use your current time zone: {emailPreferences.timeZone.replaceAll("_", " ")}.</p>
            <button className="w-full rounded-xl border-2 border-black bg-black px-4 py-2.5 font-black text-white disabled:opacity-50" disabled={busyId === "email-preferences"} type="submit">
              {busyId === "email-preferences" ? "Saving email settings…" : "Save email settings"}
            </button>
          </form>
        </SettingsDisclosure>
      )}

      {role === "parent" && (
        <SettingsDisclosure
          className="order-1"
          description="Request access or manage connected students"
          icon={<UserRoundPlus className="size-5" />}
          title="Connect to a student"
          tone="purple"
        >
          <p className="text-xs leading-5 text-zinc-700">Enter your child&apos;s exact username. They must approve the request before any assignment progress becomes visible.</p>
          <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={requestStudent}>
            <input className="min-w-0 flex-1 rounded-xl border-2 border-black bg-white px-3 py-2.5" name="studentUsername" placeholder="student username" required />
            <button className="rounded-xl border-2 border-black bg-white px-4 py-2.5 font-black disabled:opacity-60" disabled={busyId === "request"} type="submit">
              {busyId === "request" ? "Sending…" : "Request access"}
            </button>
          </form>
          <div className="mt-4 grid gap-2">
            {connections.length === 0 && !isLoading && <p className="rounded-xl bg-white/70 p-3 text-sm">No student connections yet.</p>}
            {connections.map((connection) => (
              <div className="flex items-center justify-between rounded-xl border border-black/20 bg-white p-3" key={connection.id}>
                <span><strong className="block">{connection.studentDisplayName}</strong><span className="text-xs text-zinc-500">@{connection.studentUsername} · <span className="capitalize">{connection.status}</span></span></span>
                <button className="rounded-full border border-black px-2 py-1 text-[10px] font-black disabled:opacity-50" disabled={busyId === connection.id} onClick={() => void removeConnection(connection.id)} type="button">{connection.status === "pending" ? "Cancel" : "Remove"}</button>
              </div>
            ))}
          </div>
        </SettingsDisclosure>
      )}

      {role === "student" && (
        <SettingsDisclosure
          className="order-1"
          description={pendingRequests.length > 0 ? `${pendingRequests.length} request${pendingRequests.length === 1 ? "" : "s"} waiting` : "Approve or manage parent access"}
          icon={<ShieldCheck className="size-5" />}
          title="Parent supervision"
          tone="yellow"
        >
          <p className="text-xs leading-5 text-zinc-600">Only approve a parent or guardian you recognize. Approval gives them read-only access to your assignment progress.</p>
          <div className="mt-4 grid gap-2">
            {pendingRequests.map((connection) => (
              <div className="rounded-xl border-2 border-black bg-white p-3" key={connection.id}>
                <p className="font-black">{connection.parentDisplayName}</p>
                <p className="text-xs text-zinc-500">@{connection.parentUsername}</p>
                <p className="text-xs text-zinc-500">Requests permission to supervise assignment progress.</p>
                <div className="mt-3 flex gap-2">
                  <button className="flex items-center gap-1 rounded-full border-2 border-black bg-emerald-200 px-3 py-1.5 text-xs font-black disabled:opacity-60" disabled={busyId === connection.id} onClick={() => void respond(connection.id, true)} type="button"><Check className="size-4" /> Approve</button>
                  <button className="flex items-center gap-1 rounded-full border-2 border-black bg-white px-3 py-1.5 text-xs font-black disabled:opacity-60" disabled={busyId === connection.id} onClick={() => void respond(connection.id, false)} type="button"><X className="size-4" /> Decline</button>
                </div>
              </div>
            ))}
            {pendingRequests.length === 0 && !isLoading && <p className="rounded-xl bg-white p-3 text-sm text-zinc-500">No pending parent requests.</p>}
          </div>
          {approvedConnections.length > 0 && (
            <div className="mt-4"><p className="text-xs font-black uppercase tracking-wider">Approved supervisors</p>{approvedConnections.map((connection) => <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-100 p-3" key={connection.id}><span><strong className="block text-sm">{connection.parentDisplayName}</strong><span className="text-xs text-emerald-900/70">@{connection.parentUsername}</span></span><button className="rounded-full border border-emerald-900 px-2 py-1 text-[10px] font-black text-emerald-900 disabled:opacity-50" disabled={busyId === connection.id} onClick={() => void removeConnection(connection.id)} type="button">Revoke access</button></div>)}</div>
          )}
        </SettingsDisclosure>
      )}

      {isLoading && <p className="order-6 flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="size-4 animate-spin" /> Loading connections…</p>}
      {message && <p className="order-6 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p>}
      {errorMessage && <p className="order-6 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{errorMessage}</p>}
    </DialogContent>
  );
}
