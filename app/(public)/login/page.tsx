"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cacheAccountRole } from "@/lib/auth-role-cache";
import { loginUser } from "@/lib/server";

type LoginMode = "student" | "administrator" | "parent";

export default function LoginPage() {
  const [buttonClicked, setButtonClicked] = useState(false);
  const [mode, setMode] = useState<LoginMode>("student");
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
      const result = await loginUser(formData);

      if (
        result.status === 200 &&
        result.user &&
        (result.role === "student" || result.role === "administrator" || result.role === "parent")
      ) {
        cacheAccountRole(result.user.uid, result.role);
        isNavigating = true;
        router.replace("/chat");
        return;
      }

      setErrorMessage(result.message);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in",
      );
    } finally {
      if (!isNavigating) setButtonClicked(false);
    }
  };

  return (
    <section className="w-full max-w-md rounded-[2rem] border-2 border-black bg-white p-6 shadow-[7px_7px_0_#111] sm:p-8">
      <div className="mb-6">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#f24e2e]">
          Your streaks are waiting
        </p>
        <h1 className="text-3xl font-black tracking-[-0.04em] text-zinc-950">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Pick your space, then get back to today&apos;s progress.
        </p>
      </div>

      <div
        className="mb-6 grid grid-cols-3 rounded-full border-2 border-black bg-[#f4f0e8] p-1"
        aria-label="Account type"
      >
        <button
          type="button"
          aria-pressed={mode === "student"}
          onClick={() => setMode("student")}
          className={`rounded-full px-3 py-2 text-sm font-bold transition-colors ${
            mode === "student"
              ? "bg-black text-white"
              : "text-zinc-600 hover:text-zinc-950"
          }`}
        >
          Student
        </button>
        <button
          type="button"
          aria-pressed={mode === "administrator"}
          onClick={() => setMode("administrator")}
          className={`rounded-full px-3 py-2 text-sm font-bold transition-colors ${
            mode === "administrator"
              ? "bg-black text-white"
              : "text-zinc-600 hover:text-zinc-950"
          }`}
        >
          Administrator
        </button>
        <button
          type="button"
          aria-pressed={mode === "parent"}
          onClick={() => setMode("parent")}
          className={`rounded-full px-3 py-2 text-sm font-bold transition-colors ${
            mode === "parent"
              ? "bg-black text-white"
              : "text-zinc-600 hover:text-zinc-950"
          }`}
        >
          Parent
        </button>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <input type="hidden" name="role" value={mode} />

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
            autoComplete="current-password"
            type="password"
            id="password"
            name="password"
            className="w-full rounded-2xl border-2 border-black px-3 py-2.5 outline-none transition focus:shadow-[2px_2px_0_#111]"
          />
        </div>

        <button
          className="w-full rounded-full border-2 border-black bg-[#fffc00] px-4 py-3 font-black text-black shadow-[3px_3px_0_#111] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={buttonClicked}
        >
          {buttonClicked
            ? "Signing in..."
            : `Sign in as ${mode}`}
        </button>

        {errorMessage && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {errorMessage}
          </p>
        )}

        <p className="text-center text-sm text-zinc-600">
          Don&apos;t have an account?{" "}
          <Link
            className="font-medium text-zinc-950 underline-offset-4 hover:underline"
            href="/register"
          >
            Create one
          </Link>
        </p>
      </form>
    </section>
  );
}
