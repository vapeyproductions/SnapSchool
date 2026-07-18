"use client";

import { BellRing, Check, Clock3, Loader2, Mail, ShieldCheck, Sparkles, UserRoundPlus, X } from "lucide-react";
import { useContext, useEffect, useMemo, useState } from "react";

import {
  getProfileSettings,
  defaultParentEmailPreferences,
  removeFamilyConnection,
  requestParentConnection,
  respondToParentConnection,
  saveParentEmailPreferences,
  type FamilyConnection,
  type ParentEmailPreferences,
} from "@/actions/profile";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAvatarChoices } from "@/lib/avatar-options";
import { changeAvatar, changeUsername } from "@/lib/server";

import AuthContext from "./AuthContext";

export default function ProfileSettingsModal() {
  const { role, user } = useContext(AuthContext);
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
    <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[2rem] border-2 border-black sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Profile settings</DialogTitle>
        <DialogDescription>
          Manage your public account name and approved family supervision.
        </DialogDescription>
      </DialogHeader>

      <section className="rounded-2xl border-2 border-black bg-[#f4f0e8] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black capitalize">{user?.displayName}</p>
            <p className="text-xs font-semibold capitalize text-zinc-500">
              {role} account
            </p>
          </div>
          <span className="rounded-full bg-black px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">Account</span>
        </div>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={updateUsername}>
          <input className="min-w-0 flex-1 rounded-xl border-2 border-black bg-white px-3 py-2.5" defaultValue={user?.displayName ?? ""} minLength={3} maxLength={30} name="username" required />
          <button className="rounded-xl border-2 border-black bg-[#fffc00] px-4 py-2.5 font-black disabled:opacity-60" disabled={busyId === "username"} type="submit">
            {busyId === "username" ? "Updating…" : "Change username"}
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-500">Usernames use letters, numbers, dots, underscores, or hyphens.</p>
      </section>

      <section className="rounded-2xl border-2 border-black bg-white p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5" />
          <div>
            <h3 className="font-black">Choose your character</h3>
            <p className="text-xs text-zinc-500">Pick any avatar now and change it whenever you like.</p>
          </div>
        </div>
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
      </section>

      {role === "parent" && (
        <section className="rounded-2xl border-2 border-black bg-[#fffbd5] p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-black bg-white"><Mail className="size-5" /></span>
            <div>
              <h3 className="font-black">Student progress emails</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-600">
                Updates go to <strong>{user?.email}</strong> and include only students who approved your supervision request.
              </p>
            </div>
          </div>

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
        </section>
      )}

      {role === "parent" && (
        <section className="rounded-2xl border-2 border-black bg-[#c7b7ff] p-4">
          <div className="flex items-center gap-2"><UserRoundPlus className="size-5" /><h3 className="font-black">Connect to a student</h3></div>
          <p className="mt-1 text-xs leading-5 text-zinc-700">Enter your child&apos;s exact username. They must approve the request before any assignment progress becomes visible.</p>
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
                <span><strong className="block capitalize">{connection.studentUsername}</strong><span className="text-xs capitalize text-zinc-500">{connection.status}</span></span>
                <button className="rounded-full border border-black px-2 py-1 text-[10px] font-black disabled:opacity-50" disabled={busyId === connection.id} onClick={() => void removeConnection(connection.id)} type="button">{connection.status === "pending" ? "Cancel" : "Remove"}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {role === "student" && (
        <section className="rounded-2xl border-2 border-black bg-[#fffbd5] p-4">
          <div className="flex items-center gap-2"><ShieldCheck className="size-5" /><h3 className="font-black">Parent supervision</h3></div>
          <p className="mt-1 text-xs leading-5 text-zinc-600">Only approve a parent or guardian you recognize. Approval gives them read-only access to your assignment progress.</p>
          <div className="mt-4 grid gap-2">
            {pendingRequests.map((connection) => (
              <div className="rounded-xl border-2 border-black bg-white p-3" key={connection.id}>
                <p className="font-black capitalize">{connection.parentUsername}</p>
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
            <div className="mt-4"><p className="text-xs font-black uppercase tracking-wider">Approved supervisors</p>{approvedConnections.map((connection) => <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-100 p-3" key={connection.id}><span className="text-sm font-bold capitalize">{connection.parentUsername}</span><button className="rounded-full border border-emerald-900 px-2 py-1 text-[10px] font-black text-emerald-900 disabled:opacity-50" disabled={busyId === connection.id} onClick={() => void removeConnection(connection.id)} type="button">Revoke access</button></div>)}</div>
          )}
        </section>
      )}

      {isLoading && <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="size-4 animate-spin" /> Loading connections…</p>}
      {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p>}
      {errorMessage && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{errorMessage}</p>}
    </DialogContent>
  );
}
