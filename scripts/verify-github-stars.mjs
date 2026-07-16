import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const mapUrl = new URL("../public/icml-map.json", import.meta.url);
const tempUrl = new URL("../public/icml-map.next.json", import.meta.url);
const cacheUrl = new URL("../work/github-stars-cache.json", import.meta.url);
const limit = Math.max(1, Number(process.argv[2] ?? 50));
const map = JSON.parse(await readFile(mapUrl, "utf8"));
let cache = {};
try { cache = JSON.parse(await readFile(cacheUrl, "utf8")); } catch { /* first run */ }

const token = process.env.GITHUB_TOKEN ?? execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const candidates = [...map.points]
  .filter(point => point.githubUrl && point.githubStars != null)
  .sort((a, b) => b.githubStars - a.githubStars)
  .slice(0, limit);
let verified = 0;
const failures = [];

for (const [index, point] of candidates.entries()) {
  const match = point.githubUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/#]+?)(?:\.git)?$/i);
  if (!match) continue;
  const repo = match[1];
  const cached = cache[repo];
  if (cached && Date.now() - new Date(cached.checkedAt).getTime() < 6 * 60 * 60 * 1000) {
    point.githubStars = cached.stars;
    point.githubStarsVerifiedAt = cached.checkedAt;
    verified += 1;
    continue;
  }
  const response = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2026-03-10",
      "user-agent": "icml-paper-atlas",
    },
  });
  if (!response.ok) {
    failures.push(`${repo}: ${response.status}`);
    continue;
  }
  const data = await response.json();
  const checkedAt = new Date().toISOString();
  point.githubStars = data.stargazers_count;
  point.githubStarsVerifiedAt = checkedAt;
  cache[repo] = { stars: data.stargazers_count, checkedAt };
  verified += 1;
  process.stdout.write(`\rVerified ${verified}/${candidates.length} · checked ${index + 1}`);
  await new Promise(resolve => setTimeout(resolve, 80));
}

await mkdir(new URL("../work/", import.meta.url), { recursive: true });
await writeFile(cacheUrl, JSON.stringify(cache));
await writeFile(tempUrl, JSON.stringify(map));
await rename(tempUrl, mapUrl);
process.stdout.write(`\nVerified ${verified}/${candidates.length} GitHub repositories.`);
if (failures.length) process.stdout.write(` Failed ${failures.length}: ${failures.join(", ")}`);
process.stdout.write("\n");
