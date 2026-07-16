import type { Metadata, Viewport } from "next";
import "stream-chat-react/dist/css/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnapSchool",
  description: "Homework support, daily learning plans, and study streaks.",
  applicationName: "SnapSchool",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SnapSchool",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: "/snapschool-icon-192.png",
    icon: "/snapschool-icon-192.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  initialScale: 1,
  themeColor: "#fffc00",
  viewportFit: "cover",
  width: "device-width",
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
