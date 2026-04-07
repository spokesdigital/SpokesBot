import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "SpokesBot — AI Analytics Dashboard",
    template: "%s | SpokesBot",
  },
  description:
    "AI-powered analytics dashboard for your organisation. Upload CSV data and query it with natural language via a LangGraph agent.",
  keywords: ["analytics", "AI", "dashboard", "data", "chatbot", "CSV"],
  authors: [{ name: "SpokesBot" }],
  robots: {
    index: false,   // private SaaS — keep out of search engines
    follow: false,
  },
  openGraph: {
    type: "website",
    siteName: "SpokesBot",
    title: "SpokesBot — AI Analytics Dashboard",
    description: "Query your organisation's data with natural language.",
  },
  twitter: {
    card: "summary",
    title: "SpokesBot — AI Analytics Dashboard",
    description: "Query your organisation's data with natural language.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="app-shell min-h-full flex flex-col text-slate-900">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
