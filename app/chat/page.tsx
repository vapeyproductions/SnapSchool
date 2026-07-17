"use client";

import {
  BookOpen,
  CalendarDays,
  Flame,
  ListChecks,
  LogOut,
  MoonStar,
  Plus,
  School,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useState } from "react";

import AuthContext from "@/app/components/AuthContext";
import CreateGroupModal from "@/app/components/CreateGroupModal";
import CreateIndependentAssignmentModal from "@/app/components/CreateIndependentAssignmentModal";
import CreateStreakModal from "@/app/components/CreateStreakModal";
import InstallAppButton from "@/app/components/InstallAppButton";
import ManageClassesModal from "@/app/components/ManageClassesModal";
import NotificationCenter from "@/app/components/NotificationCenter";
import ProfileSettingsModal from "@/app/components/ProfileSettingsModal";
import StreakPage from "@/app/components/StreakPage";
import StreakReminderModal from "@/app/components/StreakReminderModal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { clearCachedAccountRole } from "@/lib/auth-role-cache";
import { logoutUser } from "@/lib/server";

export default function ChatPage() {
  const { role, user } = useContext(AuthContext);
  const router = useRouter();
  const [openStreakModal, setOpenStreakModal] = useState(false);
  const [openGroupModal, setOpenGroupModal] = useState(false);
  const [openIndependentModal, setOpenIndependentModal] = useState(false);
  const [openClassesModal, setOpenClassesModal] = useState(false);
  const [openProfileSettings, setOpenProfileSettings] = useState(false);
  const [streakReminder, setStreakReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [dailyEstimatedMinutes, setDailyEstimatedMinutes] = useState(0);
  const [dashboardView, setDashboardView] = useState<"assignments" | "calendar">("assignments");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [adultMode, setAdultMode] = useState(false);

  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
  const isAdministrator = role === "administrator";
  const isParent = role === "parent";
  const isStudent = role === "student";
  const canCreatePersonalAssignment = isParent || isStudent;
  const canUseAdultMode = isAdministrator || isParent;
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    const loadPreference = window.setTimeout(() => {
      setAdultMode(
        Boolean(
          user &&
          canUseAdultMode &&
          window.localStorage.getItem(`snapschool:adult-mode:${user.uid}`) === "true",
        ),
      );
    }, 0);
    return () => window.clearTimeout(loadPreference);
  }, [canUseAdultMode, user]);

  useEffect(() => {
    const enabled = canUseAdultMode && adultMode;
    document.documentElement.classList.toggle("adult-mode-enabled", enabled);
    return () => document.documentElement.classList.remove("adult-mode-enabled");
  }, [adultMode, canUseAdultMode]);

  const toggleAdultMode = () => {
    if (!user || !canUseAdultMode) return;
    const nextMode = !adultMode;
    setAdultMode(nextMode);
    window.localStorage.setItem(
      `snapschool:adult-mode:${user.uid}`,
      String(nextMode),
    );
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError("");
    const result = await logoutUser();

    if (result.code === "auth/success") {
      if (user) {
        clearCachedAccountRole(user.uid);
        const notificationPrefix = `snapschool:notifications-shown:${user.uid}:`;
        Object.keys(window.sessionStorage)
          .filter((key) => key.startsWith(notificationPrefix))
          .forEach((key) => window.sessionStorage.removeItem(key));
      }
      router.replace("/login");
      return;
    }

    setLogoutError(result.message);
    setIsLoggingOut(false);
  };

  return (
    <div className={`snapschool-shell min-h-screen text-[#171717] ${adultMode && canUseAdultMode ? "adult-mode" : ""}`}>
      <header className="sticky top-0 z-40 border-b-2 border-black bg-[#fffc00]">
        <div className="mx-auto flex min-h-[4.5rem] max-w-[1540px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="relative flex size-11 items-center justify-center rounded-full border-2 border-black bg-white shadow-[3px_3px_0_#111]">
              <BookOpen className="size-5" strokeWidth={2.5} />
              <Flame className="absolute -right-1 -top-1 size-4 fill-[#ff5b35] text-[#ff5b35]" />
            </div>
            <div className="hidden min-[430px]:block">
              <p className="text-xl font-black tracking-[-0.04em]">SnapSchool</p>
              <p className="hidden text-[10px] font-bold uppercase tracking-[0.16em] sm:block">
                Make progress visible
              </p>
            </div>
          </div>

          {!isAdministrator && (
            <div className="order-3 mx-auto flex w-full items-center justify-center rounded-full border-2 border-black bg-white p-1 shadow-[2px_2px_0_#111] md:order-none md:mx-0 md:w-auto">
              <button
                aria-pressed={dashboardView === "assignments"}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-black transition sm:px-4 sm:text-sm ${dashboardView === "assignments" ? "bg-black text-white" : "hover:bg-zinc-100"}`}
                onClick={() => setDashboardView("assignments")}
                type="button"
              >
                <ListChecks className="size-3.5 sm:size-4" />
                <span>Assignments</span>
              </button>
              <button
                aria-pressed={dashboardView === "calendar"}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-black transition sm:px-4 sm:text-sm ${dashboardView === "calendar" ? "bg-[#fffc00] text-black" : "hover:bg-zinc-100"}`}
                onClick={() => setDashboardView("calendar")}
                type="button"
              >
                <CalendarDays className="size-3.5 sm:size-4" />
                <span>Calendar</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {canUseAdultMode && (
              <button
                aria-label="Toggle Adult mode"
                aria-pressed={adultMode}
                className={`flex h-10 items-center gap-2 rounded-full border-2 border-black px-2.5 text-xs font-black transition sm:px-3 ${adultMode ? "bg-slate-700 text-white" : "bg-white text-black hover:bg-slate-100"}`}
                onClick={toggleAdultMode}
                type="button"
              >
                <MoonStar className="size-4" />
                <span className="hidden lg:inline">Adult mode</span>
                <span className={`relative h-5 w-9 rounded-full border border-current ${adultMode ? "bg-slate-500" : "bg-slate-200"}`} aria-hidden="true">
                  <span className={`absolute top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform ${adultMode ? "translate-x-[1.05rem]" : "translate-x-0.5"}`} />
                </span>
              </button>
            )}
            {!isAdministrator && <InstallAppButton />}
            {!isAdministrator && user && role && (
              <NotificationCenter role={role} user={user} />
            )}
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-[#c7b7ff] text-sm font-black">
              {user?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="size-full object-cover" src={user.photoURL} alt="" />
              ) : (
                initial
              )}
            </div>
            <Dialog open={openProfileSettings} onOpenChange={setOpenProfileSettings}>
              <DialogTrigger render={<button aria-label="Profile settings" className="flex size-10 items-center justify-center rounded-full border-2 border-black bg-white transition hover:-translate-y-0.5" type="button" />}>
                <Settings className="size-4" />
              </DialogTrigger>
              <ProfileSettingsModal />
            </Dialog>
            <button
              aria-label={isLoggingOut ? "Logging out" : "Log out"}
              className="flex size-10 items-center justify-center rounded-full border-2 border-black bg-white transition hover:bg-black hover:text-white disabled:opacity-50"
              disabled={isLoggingOut}
              onClick={handleLogout}
              type="button"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1540px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        {logoutError && (
          <p className="mb-4 rounded-2xl border-2 border-red-600 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
            {logoutError}
          </p>
        )}

        <section className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-black px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                {isAdministrator ? "Creator studio" : isParent ? "Family dashboard" : "Your study feed"}
              </span>
              <span className="text-xs font-bold capitalize text-zinc-500">{role}</span>
            </div>
            <h1 className="max-w-4xl text-3xl font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl">
              Hey, <span className="capitalize">{displayName}</span>.
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-zinc-600 sm:text-base">
              {isAdministrator
                ? "Publish assignments, watch class momentum, and jump into the conversations that need you."
                : isParent
                  ? "Keep up with approved students’ progress and add outside-school work when they need everything in one plan."
                  : "Open a streak, finish today's step, and snap your progress before the day is over."}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {canCreatePersonalAssignment && (
            <Dialog open={openIndependentModal} onOpenChange={setOpenIndependentModal}>
              <DialogTrigger render={<Button className="h-12 rounded-full border-2 border-black bg-[#c7b7ff] px-5 font-black text-black shadow-[3px_3px_0_#111] hover:bg-[#b7a4ff]" />}>
                <Plus /> Add personal work
              </DialogTrigger>
              <CreateIndependentAssignmentModal setOpen={setOpenIndependentModal} />
            </Dialog>
          )}
          {isStudent && (
          <div className="flex items-center gap-3 rounded-[1.75rem] border-2 border-black bg-[#fffc00] px-4 py-3 shadow-[5px_5px_0_#111] sm:min-w-72">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#ff5b35] text-white">
              <Flame className="size-7 fill-current" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em]">
                {isAdministrator
                  ? "Daily mission"
                  : `Est. ${dailyEstimatedMinutes} minutes`}
              </p>
              <p className="text-sm font-extrabold">
                {isAdministrator
                  ? "Show what your students worked on"
                  : "Recommended work across today's assignments"}
              </p>
            </div>
          </div>
          )}
          </div>
        </section>

        <section className="social-workspace overflow-hidden border-2 border-black bg-white shadow-[7px_7px_0_#111]">
          {isAdministrator && (
          <div className="flex flex-col gap-3 border-b-2 border-black bg-[#f4f0e8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-black text-white">
                <School className="size-5" />
              </span>
              <div>
                <h2 className="font-black tracking-tight">
                  {isAdministrator ? "Classes" : "Project circles"}
                </h2>
                <p className="text-xs font-medium text-zinc-500">
                  Assignments, class progress, and teacher requests
                </p>
              </div>
            </div>

            {isAdministrator ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Dialog open={openClassesModal} onOpenChange={setOpenClassesModal}>
                  <DialogTrigger render={<Button className="h-10 rounded-full border-2 border-black bg-white px-4 font-bold text-black hover:bg-zinc-100" />}>
                    <School /> Classes
                  </DialogTrigger>
                  <ManageClassesModal />
                </Dialog>
                <Dialog open={openStreakModal} onOpenChange={setOpenStreakModal}>
                  <DialogTrigger render={<Button className="h-10 rounded-full border-2 border-black bg-[#fffc00] px-4 font-black text-black hover:bg-[#f3ef00]" />}>
                    <Plus /> Post assignment
                  </DialogTrigger>
                  <CreateStreakModal setOpen={setOpenStreakModal} />
                </Dialog>
                <Dialog open={openGroupModal} onOpenChange={setOpenGroupModal}>
                  <DialogTrigger render={<Button className="h-10 rounded-full border-2 border-black bg-[#c7b7ff] px-4 font-black text-black hover:bg-[#b7a4ff]" />}>
                    <Plus /> Group assignment
                  </DialogTrigger>
                  <CreateGroupModal setOpen={setOpenGroupModal} />
                </Dialog>
              </div>
            ) : null}
          </div>
          )}

          <div className="p-2 sm:p-4">
            <StreakPage
              dashboardView={dashboardView}
              onDashboardViewChange={setDashboardView}
              onDailyMinutesChange={setDailyEstimatedMinutes}
              setReminderMessage={setReminderMessage}
              setStreakReminder={setStreakReminder}
            />
          </div>
        </section>
      </main>

      <Dialog open={streakReminder} onOpenChange={setStreakReminder}>
        <StreakReminderModal reminderMessage={reminderMessage} />
      </Dialog>
    </div>
  );
}
