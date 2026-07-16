import { AuthProvider } from "@/app/components/AuthContext";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Streaks & Group Chats | SchoolSnap",
  description:
    "Connect through homework streaks, student support, and group chats.",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <main>{children}</main>
    </AuthProvider>
  );
}
