"use client";

import {
  BookOpen,
  Flame,
  LogOut,
  MessageCircleMore,
  Plus,
  School,
  Sparkles,
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
      router.replace("/login");
      return;
    }

    setLogoutError(result.message);
    setIsLoggingOut(false);
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
              <BookOpen className="size-5" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">SchoolSnap</p>
              <p className="text-xs font-medium text-slate-500">Learn a little every day</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold capitalize">{displayName}</p>
              <p className="text-xs capitalize text-slate-500">{role ? `${role} account` : "SchoolSnap account"}</p>
            </div>
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              {user?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="size-full object-cover" src={user.photoURL} alt="" />
              ) : (
                initial
              )}
            </div>
            <Button
              className="h-10 rounded-xl border-slate-200 px-3 text-slate-700 hover:bg-slate-100 sm:px-4"
              variant="outline"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <LogOut />
              <span className="hidden sm:inline">{isLoggingOut ? "Logging out…" : "Log out"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {logoutError && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {logoutError}
          </p>
        )}

        <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-6 py-7 text-white shadow-lg shadow-indigo-950/10 sm:px-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-100">
                <Sparkles className="size-4" /> Your learning space
              </p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Welcome back, <span className="capitalize">{displayName}</span>!
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100 sm:text-base">
                {isAdministrator
                  ? "Create assignments, support student progress, and keep learning goals manageable."
                  : "View your assignments, share homework progress, and keep each learning streak going."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-2xl bg-white/10 px-5 py-4 backdrop-blur-sm">
              <div className="flex size-11 items-center justify-center rounded-xl bg-orange-400 text-white">
                <Flame className="size-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-100">Today&apos;s goal</p>
                <p className="font-semibold">Send a progress update</p>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${
                  view === "individual" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-950"
                }`}
                onClick={() => setView("individual")}
              >
                <Flame className="size-4" /> Individual assignments
              </button>
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${
                  view === "groups" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-950"
                }`}
                onClick={() => setView("groups")}
              >
                <MessageCircleMore className="size-4" /> Group projects
              </button>
            </div>

            {isAdministrator && view === "individual" ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Dialog open={openClassesModal} onOpenChange={setOpenClassesModal}>
                  <DialogTrigger
                    render={
                      <Button
                        className="h-10 rounded-xl border-slate-200 px-4 text-slate-700 hover:bg-slate-100"
                        variant="outline"
                      />
                    }
                  >
                    <School /> Manage classes
                  </DialogTrigger>
                  <ManageClassesModal />
                </Dialog>

                <Dialog open={openStreakModal} onOpenChange={setOpenStreakModal}>
                  <DialogTrigger render={<Button className="h-10 rounded-xl bg-indigo-600 px-4 hover:bg-indigo-700" />}>
                    <Plus /> New individual assignment
                  </DialogTrigger>
                  <CreateStreakModal setOpen={setOpenStreakModal} />
                </Dialog>
              </div>
            ) : isAdministrator && view === "groups" ? (
              <Dialog open={openGroupModal} onOpenChange={setOpenGroupModal}>
                <DialogTrigger render={<Button className="h-10 rounded-xl bg-indigo-600 px-4 hover:bg-indigo-700" />}>
                  <Plus /> New group project
                </DialogTrigger>
                <CreateGroupModal setOpen={setOpenGroupModal} />
              </Dialog>
            ) : (
              <p className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600">
                Administrators create and assign new work.
              </p>
            )}
          </div>

          <div className="p-3 sm:p-5">
            {view === "groups" ? (
              <GroupChatPage />
            ) : (
              <StreakPage setReminderMessage={setReminderMessage} setStreakReminder={setStreakReminder} />
            )}
          </div>
        </section>
      </main>

      <Dialog open={streakReminder} onOpenChange={setStreakReminder}>
        <StreakReminderModal reminderMessage={reminderMessage} />
      </Dialog>
    </div>
  );
}
