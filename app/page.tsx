import type { Metadata } from "next";
import { PaperWindTunnel } from "./paper-wind-tunnel";

export const metadata: Metadata = {
  title: "Paper Wind Tunnel · ICML 2026",
  description: "拖动关键变量，90 秒看懂 ICML 2026 论文如何工作。",
};

export default function Home() {
  return <PaperWindTunnel />;
}
