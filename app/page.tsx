import type { Metadata } from "next";
import { PaperAtlas } from "./paper-atlas";

export const metadata: Metadata = {
  title: "ICML 2026 Paper Atlas",
  description: "探索 6,628 篇 ICML 2026 论文的位置、热点与关系。",
};

export default function Home() {
  return <PaperAtlas />;
}
