import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { env, pipeline } from "@huggingface/transformers";
import { UMAP } from "umap-js";

const ROOT = new URL("../", import.meta.url);
const mapUrl = new URL("public/icml-map.json", ROOT);
const tempUrl = new URL("public/icml-map.next.json", ROOT);
const workUrl = new URL("work/", ROOT);
const cacheUrl = new URL("work/atlas-embeddings-v4.json", ROOT);
const cacheTempUrl = new URL("work/atlas-embeddings-v4.next.json", ROOT);
const MODEL = "Xenova/all-MiniLM-L6-v2";
const MODEL_REVISION = "quantized-q8-local";
const TAXONOMY_VERSION = "2026-07-embedding-v4";
const SEED = 20260715;

const groups = [
  { label: "Agents", mapLabel: "Agents", center: [.26, .20], radius: [.17, .115], labelAt: [.11, .075], anchor: "AI agents, agentic systems, planning, tool use, multi-agent collaboration, autonomous language agents" },
  { label: "Reasoning", mapLabel: "Reasoning", center: [.59, .20], radius: [.16, .11], labelAt: [.73, .10], anchor: "reasoning, mathematical problem solving, theorem proving, verification, test-time compute and deliberation" },
  { label: "Multimodal & Generative", mapLabel: "Multimodal", center: [.18, .45], radius: [.145, .15], labelAt: [.10, .39], anchor: "multimodal learning, computer vision, audio, video, diffusion models, image and media generation" },
  { label: "Robotics", mapLabel: "Robotics", center: [.79, .43], radius: [.14, .15], labelAt: [.89, .37], anchor: "robotics, embodied intelligence, control, navigation, manipulation and autonomous systems" },
  { label: "RL", mapLabel: "RL", center: [.18, .72], radius: [.14, .13], labelAt: [.08, .71], anchor: "reinforcement learning, policy optimization, reward learning, exploration, Markov decision processes" },
  { label: "Theory & Causality", mapLabel: "Theory / Causal", center: [.41, .73], radius: [.13, .14], labelAt: [.39, .90], anchor: "learning theory, generalization, mathematical optimization, causal inference, identifiability and guarantees" },
  { label: "Efficiency & Systems", mapLabel: "Efficiency / Systems", center: [.62, .72], radius: [.13, .14], labelAt: [.63, .90], anchor: "efficient machine learning, compression, inference, training systems, distributed systems, memory and latency" },
  { label: "Science & Applications", mapLabel: "Science / Applied", center: [.83, .72], radius: [.13, .14], labelAt: [.88, .89], anchor: "machine learning for biology, medicine, physics, climate science, chemistry, time series and applications" },
];

const tagLexicons = {
  methodTags: [
    ["Diffusion", ["diffusion", "score-based", "flow matching"]], ["Transformer", ["transformer", "attention"]],
    ["Reinforcement Learning", ["reinforcement learning", "policy optimization", "reward model"]], ["Distillation", ["distillation", "teacher-student", "self-distilled"]],
    ["Retrieval", ["retrieval", "rag", "retrieval-augmented"]], ["Quantization", ["quantization", "low-bit", "4-bit", "8-bit"]],
    ["Pruning", ["pruning", "sparsification", "sparse model"]], ["Graph Neural Network", ["graph neural", "message passing", "gnn"]],
    ["Causal Learning", ["causal", "counterfactual"]], ["Contrastive Learning", ["contrastive", "contrastive learning"]],
    ["Bayesian Learning", ["bayesian", "posterior", "variational inference"]], ["Mixture of Experts", ["mixture of experts", "moe"]],
    ["Test-time Scaling", ["test-time", "inference-time scaling", "deliberation"]], ["Representation Learning", ["representation learning", "self-supervised"]],
    ["Optimization", ["optimization", "gradient descent"]], ["Generative Modeling", ["generative model", "generation"]],
  ],
  taskTags: [
    ["Reasoning", ["reasoning", "mathematical", "proof"]], ["Code Generation", ["code generation", "program synthesis", "software engineering"]],
    ["Image Generation", ["image generation", "text-to-image"]], ["Video Generation", ["video generation", "text-to-video"]],
    ["Classification", ["classification", "classifier"]], ["Segmentation", ["segmentation"]], ["Detection", ["detection", "localization"]],
    ["Forecasting", ["forecasting", "prediction"]], ["Planning", ["planning", "planner"]], ["Control", ["control", "policy learning"]],
    ["Navigation", ["navigation"]], ["Manipulation", ["manipulation", "grasping"]], ["Alignment", ["alignment", "preference learning", "rlhf"]],
    ["Evaluation", ["evaluation", "benchmark"]],
  ],
  domainTags: [
    ["Language", ["language model", "nlp", "text"]], ["Vision", ["computer vision", "image", "visual"]],
    ["Multimodal", ["multimodal", "vision-language"]], ["Robotics", ["robot", "embodied"]], ["Graphs", ["graph", "network"]],
    ["Healthcare", ["medical", "clinical", "health"]], ["Life Science", ["protein", "molecule", "drug", "biology"]],
    ["Physical Science", ["physics", "chemistry", "climate"]], ["Time Series", ["time series", "temporal"]], ["Recommenders", ["recommendation", "recommender"]],
  ],
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function dot(a, b) { let value = 0; for (let i = 0; i < a.length; i += 1) value += a[i] * b[i]; return value; }
function normalize(values) { const norm = Math.sqrt(dot(values, values)) || 1; return values.map(value => value / norm); }
function quantile(values, ratio) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) * ratio)] ?? 0; }
function extractTags(text, lexicon) { return lexicon.filter(([, terms]) => terms.some(term => text.includes(term))).map(([label]) => label).slice(0, 6); }
function hashText(value) { return createHash("sha256").update(value).digest("hex"); }
function seededRandom(seed) { let state = seed >>> 0; return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function stableHash(value) { return Number.parseInt(hashText(value).slice(0, 8), 16); }
function percentileRank(sorted, value) { let low = 0, high = sorted.length; while (low < high) { const middle = (low + high) >> 1; if (sorted[middle] <= value) low = middle + 1; else high = middle; } return sorted.length ? low / sorted.length : 0; }

async function atomicJson(url, temp, value) { await writeFile(temp, JSON.stringify(value)); await rename(temp, url); }

await mkdir(workUrl, { recursive: true });
const map = JSON.parse(await readFile(mapUrl, "utf8"));
let cache = { model: MODEL, revision: MODEL_REVISION, dimensions: 384, entries: {} };
try {
  const parsed = JSON.parse(await readFile(cacheUrl, "utf8"));
  if (parsed.model === MODEL && parsed.revision === MODEL_REVISION) cache = parsed;
} catch {}

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("work/models/", ROOT).pathname;
console.log(`Loading ${MODEL} (${MODEL_REVISION})…`);
const extractor = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
const texts = map.points.map(point => {
  const keywords = point.k.map(id => map.keywords[id] ?? "").join(" ");
  return `${point.t}. Keywords: ${keywords}. Abstract: ${point.b}`.replace(/\s+/g, " ").slice(0, 2400);
});

async function saveCache() { await atomicJson(cacheUrl, cacheTempUrl, cache); }
for (let start = 0; start < texts.length; start += 24) {
  const indexes = Array.from({ length: Math.min(24, texts.length - start) }, (_, offset) => start + offset)
    .filter(index => cache.entries[map.points[index].uid ?? `index-${index}`]?.hash !== hashText(texts[index]));
  if (!indexes.length) continue;
  const output = await extractor(indexes.map(index => texts[index]), { pooling: "mean", normalize: true });
  const data = Array.from(output.data);
  indexes.forEach((index, batchIndex) => {
    const key = map.points[index].uid ?? `index-${index}`;
    cache.entries[key] = { hash: hashText(texts[index]), vector: data.slice(batchIndex * 384, (batchIndex + 1) * 384) };
  });
  await saveCache();
  console.log(`Embeddings ${Math.min(start + 24, texts.length)}/${texts.length}`);
}

const vectors = map.points.map((point, index) => {
  const entry = cache.entries[point.uid ?? `index-${index}`];
  if (!entry?.vector || entry.hash !== hashText(texts[index])) throw new Error(`Missing current embedding for paper ${index}`);
  return entry.vector;
});
const anchorOutput = await extractor(groups.map(group => group.anchor), { pooling: "mean", normalize: true });
const anchorData = Array.from(anchorOutput.data);
const anchors = groups.map((_, index) => anchorData.slice(index * 384, (index + 1) * 384));

const assignments = [];
const margins = [];
vectors.forEach(vector => {
  const scores = anchors.map(anchor => dot(vector, anchor));
  const ordered = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score || a.index - b.index);
  assignments.push(ordered[0].index);
  margins.push(ordered[0].score - ordered[1].score);
});
const confidenceThreshold = quantile(margins, .10);
const globalKeywordCounts = new Map();
map.points.forEach(point => point.k.forEach(id => globalKeywordCounts.set(id, (globalKeywordCounts.get(id) ?? 0) + 1)));

function kMeans(indexes, k) {
  const ordered = [...indexes].sort((a, b) => stableHash(map.points[a].uid ?? String(a)) - stableHash(map.points[b].uid ?? String(b)));
  let centers = Array.from({ length: k }, (_, i) => [...vectors[ordered[Math.floor((i + .5) * ordered.length / k)]]]);
  let labels = new Array(indexes.length).fill(0);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const next = indexes.map(index => centers.reduce((best, center, cluster) => {
      const score = dot(vectors[index], center);
      return score > best.score ? { cluster, score } : best;
    }, { cluster: 0, score: -Infinity }).cluster);
    const changed = next.some((value, index) => value !== labels[index]);
    labels = next;
    centers = centers.map((center, cluster) => {
      const sum = new Array(384).fill(0); let count = 0;
      indexes.forEach((index, local) => { if (labels[local] !== cluster) return; count += 1; const vector = vectors[index]; for (let d = 0; d < 384; d += 1) sum[d] += vector[d]; });
      return count ? normalize(sum) : center;
    });
    if (!changed && iteration > 0) break;
  }
  const sizes = centers.map((_, cluster) => labels.filter(label => label === cluster).length);
  const valid = Math.min(...sizes) >= 20;
  const silhouette = indexes.reduce((total, index, local) => {
    const own = 1 - dot(vectors[index], centers[labels[local]]);
    const other = Math.min(...centers.map((center, cluster) => cluster === labels[local] ? Infinity : 1 - dot(vectors[index], center)));
    return total + (other - own) / Math.max(other, own, 1e-8);
  }, 0) / Math.max(indexes.length, 1);
  return { labels, centers, silhouette, valid };
}

const subtopics = [];
for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
  const group = groups[groupIndex];
  const indexes = assignments.map((value, index) => value === groupIndex ? index : -1).filter(index => index >= 0);
  const candidates = [];
  for (let k = 3; k <= Math.min(9, Math.floor(indexes.length / 20)); k += 1) candidates.push({ k, ...kMeans(indexes, k) });
  const chosen = candidates.filter(candidate => candidate.valid).sort((a, b) => b.silhouette - a.silhouette || a.k - b.k)[0] ?? candidates.sort((a, b) => b.silhouette - a.silhouette)[0];
  if (!chosen) throw new Error(`Unable to cluster ${group.label}`);
  console.log(`${group.label}: ${indexes.length} papers · k=${chosen.k} · silhouette=${chosen.silhouette.toFixed(3)}`);

  const umap = new UMAP({ nComponents: 2, nNeighbors: Math.min(20, indexes.length - 1), minDist: .12, random: seededRandom(SEED + groupIndex) });
  const projection = umap.fit(indexes.map(index => vectors[index]));
  const x0 = quantile(projection.map(([x]) => x), .02), x1 = quantile(projection.map(([x]) => x), .98);
  const y0 = quantile(projection.map(([, y]) => y), .02), y1 = quantile(projection.map(([, y]) => y), .98);

  indexes.forEach((pointIndex, local) => {
    const point = map.points[pointIndex];
    const [px, py] = projection[local];
    point.macroTopicId = groupIndex;
    point.vc = groupIndex;
    point.macroTopicConfidence = Math.round(margins[pointIndex] * 1e6) / 1e6;
    point.taxonomyAuditFlags = margins[pointIndex] <= confidenceThreshold ? ["LOW_CONFIDENCE"] : [];
    point.methodTags = extractTags(texts[pointIndex].toLowerCase(), tagLexicons.methodTags);
    point.taskTags = extractTags(texts[pointIndex].toLowerCase(), tagLexicons.taskTags);
    point.domainTags = extractTags(texts[pointIndex].toLowerCase(), tagLexicons.domainTags);
    point.vx = group.center[0] + clamp((px - x0) / Math.max(x1 - x0, 1e-8) * 2 - 1, -1.05, 1.05) * group.radius[0] * .82;
    point.vy = group.center[1] + clamp((py - y0) / Math.max(y1 - y0, 1e-8) * 2 - 1, -1.05, 1.05) * group.radius[1] * .82;
    point.subtopicId = `${groupIndex}-${chosen.labels[local]}`;
    point.representativeScore = Math.round(dot(vectors[pointIndex], chosen.centers[chosen.labels[local]]) * 1e6) / 1e6;
    point.labelPriority = Math.round(point.representativeScore * 100000) / 100;
  });

  for (let cluster = 0; cluster < chosen.k; cluster += 1) {
    const members = indexes.filter((_, local) => chosen.labels[local] === cluster);
    const keywordCounts = new Map();
    members.forEach(index => map.points[index].k.forEach(id => keywordCounts.set(id, (keywordCounts.get(id) ?? 0) + 1)));
    const names = [...keywordCounts.entries()].map(([id, count]) => ({ id, score: count * Math.log((map.points.length + 1) / ((globalKeywordCounts.get(id) ?? 0) + 1)) }))
      .filter(item => (map.keywords[item.id] ?? "").length >= 3).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 2).map(item => map.keywords[item.id]);
    subtopics.push({
      id: `${groupIndex}-${cluster}`, macroTopicId: groupIndex, label: names.join(" · ") || `${group.label} ${cluster + 1}`, count: members.length,
      x: members.reduce((sum, index) => sum + map.points[index].vx, 0) / Math.max(members.length, 1),
      y: members.reduce((sum, index) => sum + map.points[index].vy, 0) / Math.max(members.length, 1),
    });
  }
}

const bySubtopic = new Map();
map.points.forEach((point, index) => { const items = bySubtopic.get(point.subtopicId) ?? []; items.push(index); bySubtopic.set(point.subtopicId, items); });
map.points.forEach((point, index) => {
  const candidates = bySubtopic.get(point.subtopicId) ?? [];
  point.semanticNeighbors = candidates.filter(other => other !== index).map(other => ({ index: other, score: dot(vectors[index], vectors[other]) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 12).map(item => ({ index: item.index, score: Math.round(item.score * 1e5) / 1e5 }));
});

const rankedAttention = map.points.filter(point => point.attentionAvailable ?? Boolean(point.visitsAll || point.visits7d || point.publicVotes)).map(point => point.visits7d ?? 0).sort((a, b) => a - b);
map.points.forEach(point => {
  point.attentionAvailable = point.attentionAvailable ?? Boolean(point.visitsAll || point.visits7d || point.publicVotes);
  point.attentionPercentile = point.attentionAvailable ? percentileRank(rankedAttention, point.visits7d ?? 0) : null;
});
map.visualTopics = groups.map((group, index) => ({ label: group.label, mapLabel: group.mapLabel, count: assignments.filter(value => value === index).length, c: index, x: group.center[0], y: group.center[1], rx: group.radius[0], ry: group.radius[1], labelX: group.labelAt[0], labelY: group.labelAt[1] }));
map.subtopics = subtopics;
map.embeddingModel = MODEL;
map.embeddingRevision = MODEL_REVISION;
map.taxonomyVersion = TAXONOMY_VERSION;
map.taxonomyConfidenceThreshold = confidenceThreshold;

await atomicJson(mapUrl, tempUrl, map);
console.log(`Wrote ${map.points.length} papers across ${groups.length} embedding-derived islands.`);
