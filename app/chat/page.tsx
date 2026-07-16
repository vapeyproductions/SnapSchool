"use client";

import {
  Bell,
  BookOpen,
  Camera,
  Flame,
  LogOut,
  MessageCircleMore,
  Plus,
  School,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useContext, useState } from "react";

import AuthContext from "@/app/components/AuthContext";
import CreateGroupModal from "@/app/components/CreateGroupModal";
import CreateStreakModal from "@/app/components/CreateStreakModal";
import GroupChatPage from "@/app/components/GroupChatPage";
import ManageClassesModal from "@/app/components/ManageClassesModal";
import StreakPage from "@/app/components/StreakPage";
import StreakReminderModal from "@/app/components/StreakReminderModal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { clearCachedAccountRole } from "@/lib/auth-role-cache";
import { logoutUser } from "@/lib/server";

type ChatView = "individual" | "groups";

export default function ChatPage() {
  const { role, user } = useContext(AuthContext);
  const router = useRouter();
  const [view, setView] = useState<ChatView>("individual");
  const [openStreakModal, setOpenStreakModal] = useState(false);
  const [openGroupModal, setOpenGroupModal] = useState(false);
  const [openClassesModal, setOpenClassesModal] = useState(false);
  const [streakReminder, setStreakReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [dailyEstimatedMinutes, setDailyEstimatedMinutes] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
  const isAdministrator = role === "administrator";
  const initial = displayName.charAt(0).toUpperCase();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError("");
    const result = await logoutUser();

    if (result.code === "auth/success") {
      if (user) clearCachedAccountRole(user.uid);
      router.replace("/login");
      return;
    }

    setLogoutError(result.message);
    setIsLoggingOut(false);
  };

  return (
    <div className="snapschool-shell min-h-screen pb-24 text-[#171717] lg:pb-0">
      <header className="sticky top-0 z-40 border-b-2 border-black bg-[#fffc00]">
        <div className="mx-auto flex h-[4.5rem] max-w-[1540px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="relative flex size-11 items-center justify-center rounded-full border-2 border-black bg-white shadow-[3px_3px_0_#111]">
              <BookOpen className="size-5" strokeWidth={2.5} />
              <Flame className="absolute -right-1 -top-1 size-4 fill-[#ff5b35] text-[#ff5b35]" />
            </div>
            <div>
              <p className="text-xl font-black tracking-[-0.04em]">SnapSchool</p>
              <p className="hidden text-[10px] font-bold uppercase tracking-[0.16em] sm:block">
                Make progress visible
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-1 rounded-full border-2 border-black bg-white p-1 md:flex">
            <button
              className={`rounded-full px-5 py-2 text-sm font-extrabold transition ${
                view === "individual" ? "bg-black text-white" : "hover:bg-zinc-100"
              }`}
              onClick={() => setView("individual")}
              type="button"
            >
              Individual assignments
            </button>
            <button
              className={`rounded-full px-5 py-2 text-sm font-extrabold transition ${
                view === "groups" ? "bg-black text-white" : "hover:bg-zinc-100"
              }`}
              onClick={() => setView("groups")}
              type="button"
            >
              Group projects
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label="Notifications"
              className="hidden size-10 items-center justify-center rounded-full border-2 border-black bg-white transition hover:-translate-y-0.5 sm:flex"
              type="button"
            >
              <Bell className="size-5" />
            </button>
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-[#c7b7ff] text-sm font-black">
              {user?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="size-full object-cover" src={user.photoURL} alt="" />
              ) : (
                initial
              )}
            </div>
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
                {isAdministrator ? "Creator studio" : "Your study feed"}
              </span>
              <span className="text-xs font-bold text-zinc-500">{isAdministrator ? "Administrator" : "Student"}</span>
            </div>
            <h1 className="max-w-4xl text-3xl font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl">
              Hey, <span className="capitalize">{displayName}</span>. <span className="text-[#f24e2e]">Keep it moving.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-zinc-600 sm:text-base">
              {isAdministrator
                ? "Publish assignments, watch class momentum, and jump into the conversations that need you."
                : "Open a streak, finish today's step, and snap your progress before the day is over."}
            </p>
          </div>

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
        </section>

        <section className="social-workspace overflow-hidden border-2 border-black bg-white shadow-[7px_7px_0_#111]">
          {(isAdministrator || view === "groups") && (
          <div className="flex flex-col gap-3 border-b-2 border-black bg-[#f4f0e8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-black text-white">
                {view === "individual" ? <Flame className="size-5 fill-current" /> : <MessageCircleMore className="size-5" />}
              </span>
              <div>
                <h2 className="font-black tracking-tight">
                  {view === "individual" ? (isAdministrator ? "Assignment pulse" : "Assignment stories") : "Project circles"}
                </h2>
                <p className="text-xs font-medium text-zinc-500">
                  {view === "individual" ? "Ordered by what needs attention first" : "Shared work, messages, and progress"}
                </p>
              </div>
            </div>

            {isAdministrator && view === "individual" ? (
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
              </div>
            ) : isAdministrator && view === "groups" ? (
              <Dialog open={openGroupModal} onOpenChange={setOpenGroupModal}>
                <DialogTrigger render={<Button className="h-10 rounded-full border-2 border-black bg-[#fffc00] px-4 font-black text-black hover:bg-[#f3ef00]" />}>
                  <Plus /> Start group project
                </DialogTrigger>
                <CreateGroupModal setOpen={setOpenGroupModal} />
              </Dialog>
            ) : null}
          </div>
          )}

          <div className="p-2 sm:p-4">
            {view === "groups" ? (
              <GroupChatPage />
            ) : (
              <StreakPage
                onDailyMinutesChange={setDailyEstimatedMinutes}
                setReminderMessage={setReminderMessage}
                setStreakReminder={setStreakReminder}
              />
            )}
          </div>
        </section>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 border-t-2 border-black bg-white px-3 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
        <button className={`flex flex-col items-center gap-1 text-[10px] font-black ${view === "individual" ? "text-black" : "text-zinc-400"}`} onClick={() => setView("individual")} type="button">
          <Flame className={`size-5 ${view === "individual" ? "fill-[#ff5b35] text-[#ff5b35]" : ""}`} /> Streaks
        </button>
        <button className="mx-auto -mt-6 flex size-14 items-center justify-center rounded-full border-2 border-black bg-[#fffc00] shadow-[3px_3px_0_#111]" onClick={() => setView("individual")} type="button" aria-label="Open progress capture">
          <Camera className="size-6" />
        </button>
        <button className={`flex flex-col items-center gap-1 text-[10px] font-black ${view === "groups" ? "text-black" : "text-zinc-400"}`} onClick={() => setView("groups")} type="button">
          <MessageCircleMore className="size-5" /> Projects
        </button>
      </nav>

      <Dialog open={streakReminder} onOpenChange={setStreakReminder}>
        <StreakReminderModal reminderMessage={reminderMessage} />
      </Dialog>
    </div>
  );
}
