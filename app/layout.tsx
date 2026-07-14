import type { Metadata } from "next";
import { headers } from "next/headers";
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "拖动关键变量，90 秒看懂 ICML 2026 论文如何工作。";

  return {
    title: "Paper Wind Tunnel · ICML 2026",
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Paper Wind Tunnel · ICML 2026",
      description,
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1280, height: 720, alt: "Paper Wind Tunnel ICML 2026" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Paper Wind Tunnel · ICML 2026",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
