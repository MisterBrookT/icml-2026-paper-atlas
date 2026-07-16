import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./atlas.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "探索 6,628 篇 ICML 2026 论文的位置、热点与关系。";

  return {
    title: "ICML 2026 Paper Atlas",
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "ICML 2026 Paper Atlas",
      description,
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1280, height: 720, alt: "ICML 2026 Paper Atlas" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ICML 2026 Paper Atlas",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
