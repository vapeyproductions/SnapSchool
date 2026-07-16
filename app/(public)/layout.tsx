import type { Metadata } from "next";
import Link from "next/link";
import { MoveRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Authentication | Snapchat Clone",
  description: "Sign in or register to access SnapWeb",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-screen w-full bg-zinc-50">
      <aside className="relative hidden min-h-screen w-1/4 bg-yellow-400 p-8 md:block">
        <section className="absolute right-8 bottom-20 left-8 flex flex-col px-2 text-zinc-950">
          <Link href="/" className="text-2xl font-bold">
            SnapWeb
          </Link>
          <p className="mt-2 max-w-xs text-sm leading-6 text-zinc-800">
            Connect as a student or manage your community as an administrator.
            <MoveRight
              aria-hidden="true"
              className="ml-1 inline-block"
              size={18}
            />
          </p>
        </section>
      </aside>

      <div className="flex min-h-screen flex-1 items-center justify-center px-4 py-10 sm:px-8">
        {children}
      </div>
    </main>
  );
}
