import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("ships the Atlas product and social metadata", async () => {
  const [atlas, page, layout, css, packageJson] = await Promise.all([
    read("app/paper-atlas.tsx"),
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("app/atlas.css"),
    read("package.json"),
  ]);

  assert.match(layout, /ICML 2026 Paper Atlas/);
  assert.match(layout, /og\.png/);
  assert.match(page, /PaperAtlas/);
  assert.match(atlas, /ICML 2026 PAPER ATLAS/);
  assert.match(atlas, /SEMANTIC TOPOGRAPHIC MAP OF 6,628 PAPERS/);
  for (const label of ["LANDSCAPE", "ATTENTION", "GITHUB", "RANKINGS", "MATRIX"]) {
    assert.match(atlas, new RegExp(label));
  }
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(atlas, /OPEN PLAYABLE PAPER|ATTENTION NOW/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|drizzle|cloudflare/i);
});

test("keeps evidence, interaction, and source boundaries explicit", async () => {
  const [atlas, detailRoute, dataText, buildScript] = await Promise.all([
    read("app/paper-atlas.tsx"),
    read("app/api/papers/[uid]/route.ts"),
    read("public/icml-map.json"),
    read("scripts/build-atlas-layout.mjs"),
  ]);

  const map = JSON.parse(dataText);
  assert.equal(map.points.length, 6628);
  assert.equal(new Set(map.points.map(point => point.uid ?? point.url)).size, 6628);
  assert.deepEqual(
    map.visualTopics.map(topic => topic.label),
    ["Agents", "Reasoning", "Multimodal & Generative", "Robotics", "RL", "Theory & Causality", "Efficiency & Systems", "Science & Applications"],
  );
  assert.equal(map.visualTopics.reduce((total, topic) => total + topic.count, 0), 6628);
  assert.ok(map.topicTiers[0].length >= 8);
  assert.ok(map.keywords.length > 100);
  assert.ok(map.subtopics.length >= 24);
  assert.equal(map.taxonomyVersion, "2026-07-embedding-v4");
  assert.equal(map.embeddingModel, "Xenova/all-MiniLM-L6-v2");
  assert.ok(map.embeddingRevision);

  assert.ok(map.points.every(point =>
    Number.isFinite(point.vx)
    && Number.isFinite(point.vy)
    && Number.isInteger(point.vc)
    && Number.isInteger(point.macroTopicId)
    && point.subtopicId
    && typeof point.labelPriority === "number"
    && typeof point.representativeScore === "number"
    && typeof point.macroTopicConfidence === "number"
    && Array.isArray(point.taxonomyAuditFlags)
    && point.semanticNeighbors?.length === 12
  ));
  assert.ok(map.points.some(point => point.attentionAvailable && point.visits7d > 0));
  assert.ok(map.points.some(point => point.githubStars > 0 && point.githubUrl));
  assert.ok(map.points.some(point => point.b.length > 300));

  assert.match(atlas, /const MAX_ZOOM = 10/);
  assert.match(atlas, /RELATION_WEIGHTS = \{ semantic: \.55, method: \.25, task: \.20 \}/);
  assert.match(atlas, /RELATION_LIMIT = 10/);
  assert.match(atlas, /DISCOVERY SIGNAL/);
  assert.match(atlas, /ranking-stack/);
  assert.match(atlas, /CONNECTED VIEW/);
  assert.match(atlas, /CONNECTED_POSITIONS/);
  assert.match(atlas, /CROSS-TOPIC BRIDGE/);
  assert.match(atlas, /connectionHistory/);
  assert.match(atlas, /recordHistory/);
  assert.match(atlas, /BACK TO ATLAS/);
  assert.match(atlas, /https:\/\/github\.com\/MisterBrookT\/icml-2026-paper-atlas/);
  assert.match(atlas, /reader-connections/);
  assert.doesNotMatch(atlas, /focusScaleRef|focusTarget|focusPositionedWidthRef/);
  assert.doesNotMatch(atlas, /<section className="neighbor-list connection-cards"/);
  assert.match(atlas, /SHOW FULL ABSTRACT/);
  assert.match(atlas, /useState\(true\)/);
  assert.match(atlas, /\/api\/papers\//);
  assert.match(atlas, /ATTENTION · NOT QUALITY/);
  assert.doesNotMatch(atlas, /api\.alphaxiv\.org/i);

  assert.match(buildScript, /Xenova\/all-MiniLM-L6-v2/);
  assert.match(buildScript, /nNeighbors: Math\.min\(20/);
  assert.match(buildScript, /minDist: \.12/);
  assert.match(buildScript, /semanticNeighbors/);
  assert.doesNotMatch(buildScript, /2511\.20639|LatentMAS/);
  assert.match(detailRoute, /api\.alphaxiv\.org\/papers\/v3/);
  assert.match(detailRoute, /params: Promise/);

  for (const asset of ["public/og.png", "public/atlas-logo.png", "public/icml-map.json"]) {
    await access(new URL(asset, root));
  }
});
