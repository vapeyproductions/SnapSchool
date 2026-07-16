import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Camera, Flame, MessageCircleMore } from "lucide-react";

export const metadata: Metadata = {
  title: "Join SnapSchool",
  description: "Turn schoolwork into small daily wins.",
};

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="grid min-h-screen w-full bg-[#f4f0e8] lg:grid-cols-[1.05fr_.95fr]">
      <aside className="relative hidden min-h-screen overflow-hidden border-r-2 border-black bg-[#fffc00] p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-20 top-24 size-72 rounded-full border-2 border-black bg-[#c7b7ff]" />
        <div className="absolute -bottom-24 -left-20 size-80 rounded-full border-2 border-black bg-[#ff5b35]" />

        <Link href="/" className="relative z-10 flex items-center gap-3 text-2xl font-black tracking-[-0.05em]">
          <span className="relative flex size-12 items-center justify-center rounded-full border-2 border-black bg-white shadow-[3px_3px_0_#111]">
            <BookOpen className="size-5" />
            <Flame className="absolute -right-1 -top-1 size-4 fill-[#ff5b35] text-[#ff5b35]" />
          </span>
          SnapSchool
        </Link>

        <section className="relative z-10 max-w-xl py-12">
          <p className="mb-4 inline-flex rounded-full border-2 border-black bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] shadow-[2px_2px_0_#111]">
            Study like you socialize
          </p>
          <h1 className="text-6xl font-black leading-[.9] tracking-[-0.065em] xl:text-7xl">
            Small snaps.<br />Real progress.<br />Strong streaks.
          </h1>
          <p className="mt-6 max-w-md text-base font-semibold leading-7">
            Break big assignments into daily missions, share your progress, and get support before deadlines become emergencies.
          </p>
        </section>

        <div className="relative z-10 grid max-w-xl grid-cols-3 gap-3">
          {[
            { icon: Camera, label: "Snap progress" },
            { icon: Flame, label: "Keep streaks" },
            { icon: MessageCircleMore, label: "Ask teachers" },
          ].map(({ icon: Icon, label }) => (
            <div className="rounded-2xl border-2 border-black bg-white p-3 shadow-[3px_3px_0_#111]" key={label}>
              <Icon className="mb-2 size-5" />
              <p className="text-xs font-black">{label}</p>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col px-4 py-5 sm:px-8 lg:items-center lg:justify-center lg:py-10">
        <Link href="/" className="mb-8 flex items-center gap-2 text-xl font-black tracking-tight lg:hidden">
          <span className="flex size-9 items-center justify-center rounded-full border-2 border-black bg-[#fffc00]"><BookOpen className="size-4" /></span>
          SnapSchool
        </Link>
        {children}
      </div>
    </main>
  );
}
