import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders Paper Wind Tunnel with social metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Paper Wind Tunnel · ICML 2026<\/title>/i);
  assert.match(html, /PAPER/);
  assert.match(html, /WIND TUNNEL/);
  assert.match(html, /LatentMAS/);
  assert.match(html, /ThinkPRM/);
  assert.match(html, /PaperBanana/);
  assert.match(html, /Pixel MeanFlow/);
  assert.match(html, /property="og:image" content="http:\/\/localhost(?::3000)?\/og\.png"/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps evidence, interaction, and source boundaries explicit", async () => {
  const [component, page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/paper-wind-tunnel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const label of ["问题", "招式", "证据", "边界"]) assert.match(component, new RegExp(label));
  for (const id of ["2511.20639", "2504.16828", "2601.23265", "2601.22158"]) assert.match(component, new RegExp(id));
  assert.match(component, /type="range"/);
  assert.match(component, /原文证据层/);
  assert.match(component, /不把滑杆状态伪装成实验测量/);
  assert.match(layout, /og\.png/);
  assert.match(page, /PaperWindTunnel/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(component, /api\.alphaxiv\.org|alphaxiv.*summary/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
});
