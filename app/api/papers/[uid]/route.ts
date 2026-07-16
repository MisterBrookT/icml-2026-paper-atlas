import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

type AlphaXivPaper = {
  universalId?: string;
  title?: string;
  abstract?: string;
  sourceUrl?: string;
  resources?: unknown[];
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_DIR = join(process.cwd(), "work", "paper-detail-cache");

async function readCache(uid: string) {
  const path = join(CACHE_DIR, `${uid}.json`);
  try {
    const info = await stat(path);
    if (Date.now() - info.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function writeCache(uid: string, value: unknown) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const path = join(CACHE_DIR, `${uid}.json`);
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(value));
    await rename(temp, path);
  } catch {
    // Read-only runtimes still return live alphaXiv data.
  }
}

async function fetchPaper(uid: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.alphaxiv.org/papers/v3/${encodeURIComponent(uid)}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`alphaXiv ${response.status}`);
      return await response.json() as AlphaXivPaper;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function GET(_request: Request, context: { params: Promise<{ uid: string }> }) {
  const { uid } = await context.params;
  if (!/^\d{4}\.\d{4,6}$/.test(uid)) return Response.json({ error: "Invalid paper id" }, { status: 400 });

  const cached = await readCache(uid);
  if (cached) return Response.json(cached, { headers: { "cache-control": "public, max-age=3600" } });

  try {
    const paper = await fetchPaper(uid);
    if (!paper.abstract) throw new Error("Missing abstract");
    const detail = {
      uid: paper.universalId ?? uid,
      fullAbstract: paper.abstract,
      sourceUrl: paper.sourceUrl ?? null,
      resources: Array.isArray(paper.resources) ? paper.resources : [],
      loadedAt: new Date().toISOString(),
    };
    await writeCache(uid, detail);
    return Response.json(detail, { headers: { "cache-control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "Paper detail unavailable" }, { status: 502 });
  }
}
