"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cacheAccountRole } from "@/lib/auth-role-cache";
import { registerUser } from "@/lib/server";

type AccountType = "student" | "administrator" | "parent";

export default function RegisterPage() {
  const [buttonClicked, setButtonClicked] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("student");
  const [studentMode, setStudentMode] = useState<"independent" | "school">("school");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/chat");
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setButtonClicked(true);
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    let isNavigating = false;

    try {
      const result = await registerUser(formData);

      if (result.status === 200 && result.user) {
        cacheAccountRole(result.user.uid, accountType);
        isNavigating = true;
        router.replace("/chat");
        return;
      }

      setErrorMessage(result.message);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create account",
      );
    } finally {
      if (!isNavigating) setButtonClicked(false);
    }
  };

  return (
    <section className="w-full max-w-md rounded-[2rem] border-2 border-black bg-white p-6 shadow-[7px_7px_0_#111] sm:p-8">
      <div className="mb-6">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#f24e2e]">
          Start a new momentum streak
        </p>
        <h1 className="text-3xl font-black tracking-[-0.04em] text-zinc-950">
          Join SnapSchool
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Choose your role and make progress feel social.
        </p>
      </div>

      <div
        className="mb-6 grid grid-cols-3 rounded-full border-2 border-black bg-[#f4f0e8] p-1"
        aria-label="Account type"
      >
        <button
          type="button"
          aria-pressed={accountType === "student"}
          onClick={() => setAccountType("student")}
          className={`rounded-full px-3 py-2 text-sm font-bold transition-colors ${
            accountType === "student"
              ? "bg-black text-white"
              : "text-zinc-600 hover:text-zinc-950"
          }`}
        >
          Student
        </button>
        <button
          type="button"
          aria-pressed={accountType === "administrator"}
          onClick={() => setAccountType("administrator")}
          className={`rounded-full px-3 py-2 text-sm font-bold transition-colors ${
            accountType === "administrator"
              ? "bg-black text-white"
              : "text-zinc-600 hover:text-zinc-950"
          }`}
        >
          Administrator
        </button>
        <button
          type="button"
          aria-pressed={accountType === "parent"}
          onClick={() => setAccountType("parent")}
          className={`rounded-full px-3 py-2 text-sm font-bold transition-colors ${
            accountType === "parent"
              ? "bg-black text-white"
              : "text-zinc-600 hover:text-zinc-950"
          }`}
        >
          Parent
        </button>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <input type="hidden" name="role" value={accountType} />
        {accountType === "student" && <input type="hidden" name="studentMode" value={studentMode} />}

        {accountType === "student" && (
          <fieldset className="space-y-3 rounded-2xl border-2 border-black bg-[#fffbd5] p-4">
            <legend className="px-1 text-sm font-black">How will you use SnapSchool?</legend>
            <button className={`w-full rounded-xl border-2 border-black p-3 text-left ${studentMode === "school" ? "bg-black text-white" : "bg-white"}`} onClick={() => setStudentMode("school")} type="button">
              <strong className="block">Connected to my school</strong>
              <span className={`mt-1 block text-xs ${studentMode === "school" ? "text-zinc-300" : "text-zinc-500"}`}>Teachers and administrators publish my assignments.</span>
            </button>
            <button className={`w-full rounded-xl border-2 border-black p-3 text-left ${studentMode === "independent" ? "bg-black text-white" : "bg-white"}`} onClick={() => setStudentMode("independent")} type="button">
              <strong className="block">I&apos;m using SnapSchool independently</strong>
              <span className={`mt-1 block text-xs ${studentMode === "independent" ? "text-zinc-300" : "text-zinc-500"}`}>I can upload my own work and let AI create my streak plans.</span>
            </button>
          </fieldset>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="username">
            Username
          </label>
          <input
            required
            autoComplete="username"
            type="text"
            id="username"
            name="username"
            className="w-full rounded-2xl border-2 border-black px-3 py-2.5 outline-none transition focus:shadow-[2px_2px_0_#111]"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="email">
            Email address
          </label>
          <input
            required
            autoComplete="email"
            type="email"
            id="email"
            name="email"
            className="w-full rounded-2xl border-2 border-black px-3 py-2.5 outline-none transition focus:shadow-[2px_2px_0_#111]"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            required
            minLength={8}
            autoComplete="new-password"
            type="password"
            id="password"
            name="password"
            className="w-full rounded-2xl border-2 border-black px-3 py-2.5 outline-none transition focus:shadow-[2px_2px_0_#111]"
          />
          <p className="text-xs text-zinc-500">Use at least 8 characters.</p>
        </div>

        <button
          className="w-full rounded-full border-2 border-black bg-[#fffc00] px-4 py-3 font-black text-black shadow-[3px_3px_0_#111] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={buttonClicked}
        >
          {buttonClicked
            ? "Registering..."
            : `Create ${
                accountType
              } account`}
        </button>

        {errorMessage && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {errorMessage}
          </p>
        )}

        <p className="text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <Link
            className="font-medium text-zinc-950 underline-offset-4 hover:underline"
            href="/login"
          >
            Sign in
          </Link>
        </p>
      </form>
    </section>
  );
}
