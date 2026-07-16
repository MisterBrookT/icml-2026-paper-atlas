import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";

const mapEndpoint = "https://api.alphaxiv.org/papers/v3/icml-map";
const feedEndpoint = "https://api.alphaxiv.org/papers/v3/icml-feed";
const mapUrl = new URL("../public/icml-map.json", import.meta.url);
const tempUrl = new URL("../public/icml-map.next.json", import.meta.url);
const cacheDir = new URL("../work/atlas-feed-cache/", import.meta.url);
const pageSize = 60;

await mkdir(cacheDir, { recursive: true });

async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function readCachedPage(page) {
  const cacheUrl = new URL(`page-${page}.json`, cacheDir);
  try {
    const info = await stat(cacheUrl);
    if (Date.now() - info.mtimeMs < 6 * 60 * 60 * 1000) return JSON.parse(await readFile(cacheUrl, "utf8"));
  } catch { /* fetch */ }
  const data = await fetchJson(`${feedEndpoint}?page=${page}&pageSize=${pageSize}`);
  if (!Array.isArray(data.feedPapers) || !Number.isInteger(data.page)) throw new Error(`Invalid feed page ${page}`);
  await writeFile(cacheUrl, JSON.stringify(data));
  return data;
}

const source = await fetchJson(mapEndpoint);
if (!Array.isArray(source.points) || source.points.length !== 6628) throw new Error(`Unexpected alphaXiv point count: ${source.points?.length ?? "missing"}`);

const feedPapers = [];
for (let page = 0; ; page += 1) {
  const data = await readCachedPage(page);
  feedPapers.push(...data.feedPapers);
  process.stdout.write(`\rFeed ${feedPapers.length} papers`);
  if (!data.hasMore) break;
  await new Promise(resolve => setTimeout(resolve, 90));
}
process.stdout.write("\n");

const feedById = new Map(feedPapers.map(paper => [paper.universal_paper_id ?? paper.universalId, paper]));
const existing = JSON.parse(await readFile(mapUrl, "utf8"));
const visualByKey = new Map(existing.points.map(point => [point.uid ?? point.url ?? point.t, point]));

function relevantRepository(url, point, feed) {
  if (!url) return false;
  const repo = url.split("/").filter(Boolean).at(-1)?.replace(/\.git$/i, "").toLowerCase() ?? "";
  if (!repo || /(academicpages|project-page|template|awesome-|awesome_)/i.test(repo)) return false;
  const tokens = repo.split(/[-_.]+/).filter(token => token.length >= 4 && !["official", "paper", "project", "github", "code"].includes(token));
  const content = `${point.t} ${point.b} ${feed?.abstract ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return tokens.some(token => content.includes(token));
}

const points = source.points.map(point => {
  const previous = visualByKey.get(point.uid ?? point.url ?? point.t);
  const feed = feedById.get(point.uid);
  const metrics = feed?.metrics;
  const githubUrl = relevantRepository(feed?.github_url, point, feed) ? feed.github_url : null;
  return {
    ...point,
    visits7d: metrics?.visits_count?.last_7_days ?? previous?.visits7d ?? 0,
    visitsAll: metrics?.visits_count?.all ?? previous?.visitsAll ?? 0,
    publicVotes: metrics?.public_total_votes ?? previous?.publicVotes ?? 0,
    attentionAvailable: Boolean(feed && metrics),
    githubUrl,
    githubStars: githubUrl ? (feed?.github_stars ?? previous?.githubStars ?? null) : null,
    githubStarsVerifiedAt: githubUrl ? previous?.githubStarsVerifiedAt : undefined,
    macroTopicId: previous?.macroTopicId,
    subtopicId: previous?.subtopicId,
    methodTags: previous?.methodTags ?? [],
    taskTags: previous?.taskTags ?? [],
    domainTags: previous?.domainTags ?? [],
    attentionPercentile: previous?.attentionPercentile ?? 0,
    labelPriority: previous?.labelPriority ?? 0,
    representativeScore: previous?.representativeScore ?? 0,
    vc: previous?.vc,
    vx: previous?.vx,
    vy: previous?.vy,
  };
});

await writeFile(tempUrl, JSON.stringify({
  topicTiers: source.topicTiers,
  keywords: source.keywords,
  points,
  visualTopics: existing.visualTopics,
  subtopics: existing.subtopics ?? [],
  taxonomyVersion: existing.taxonomyVersion,
  sourceUpdatedAt: new Date().toISOString(),
}));
await rename(tempUrl, mapUrl);
console.log(`Refreshed ${points.length} papers; matched ${points.filter(point => feedById.has(point.uid)).length} attention records.`);
