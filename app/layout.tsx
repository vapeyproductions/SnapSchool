import type { Metadata } from "next";
import "stream-chat-react/dist/css/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnapSchool",
  description: "Homework support, daily learning plans, and study streaks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
