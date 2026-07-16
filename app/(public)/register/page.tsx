"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { registerUser } from "@/lib/server";

type AccountType = "student" | "administrator";

export default function RegisterPage() {
  const [buttonClicked, setButtonClicked] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("student");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setButtonClicked(true);
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);

    try {
      const result = await registerUser(formData);

      if (result.status === 200) {
        router.replace("/chat");
        router.refresh();
        return;
      }

      setErrorMessage(result.message);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create account",
      );
    } finally {
      setButtonClicked(false);
    }
  };

  return (
    <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-zinc-500">
          Snapchat Clone
        </p>
        <h1 className="text-2xl font-semibold text-zinc-950">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Select the type of account you want to create.
        </p>
      </div>

      <div
        className="mb-6 grid grid-cols-2 rounded-lg bg-zinc-100 p-1"
        aria-label="Account type"
      >
        <button
          type="button"
          aria-pressed={accountType === "student"}
          onClick={() => setAccountType("student")}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            accountType === "student"
              ? "bg-white text-zinc-950 shadow-sm"
              : "text-zinc-600 hover:text-zinc-950"
          }`}
        >
          Student
        </button>
        <button
          type="button"
          aria-pressed={accountType === "administrator"}
          onClick={() => setAccountType("administrator")}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            accountType === "administrator"
              ? "bg-white text-zinc-950 shadow-sm"
              : "text-zinc-600 hover:text-zinc-950"
          }`}
        >
          Administrator
        </button>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <input type="hidden" name="role" value={accountType} />

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
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10"
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
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10"
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
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10"
          />
          <p className="text-xs text-zinc-500">Use at least 8 characters.</p>
        </div>

        <button
          className="w-full rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={buttonClicked}
        >
          {buttonClicked
            ? "Registering..."
            : `Create ${
                accountType === "student" ? "student" : "administrator"
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
