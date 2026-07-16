"use client";

import {
  ArrowLeft,
  ArrowSquareOut,
  CaretLeft,
  CaretRight,
  Code,
  GithubLogo,
  MapTrifold,
  MagnifyingGlass,
  Minus,
  Plus,
  Pulse,
  Question,
  Sparkle,
  SquaresFour,
  X,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MapPoint = {
  x: number;
  y: number;
  c: number;
  t: string;
  au: string[];
  b: string;
  se: string;
  sc: string;
  uid: string | null;
  url: string;
  k: number[];
  macroTopicId?: number;
  subtopicId?: string;
  methodTags?: string[];
  taskTags?: string[];
  domainTags?: string[];
  visits7d?: number;
  visitsAll?: number;
  publicVotes?: number;
  githubUrl?: string | null;
  githubStars?: number | null;
  attentionAvailable?: boolean;
  attentionPercentile?: number;
  labelPriority?: number;
  representativeScore?: number;
  macroTopicConfidence?: number;
  taxonomyAuditFlags?: string[];
  semanticNeighbors?: { index: number; score: number }[];
  vc?: number;
  vx?: number;
  vy?: number;
};

type TopicLabel = { label: string; x: number; y: number; count: number };
type VisualTopic = TopicLabel & { c: number; rx: number; ry: number; labelX: number; labelY: number; mapLabel?: string };
type Subtopic = { id: string; macroTopicId: number; label: string; count: number; x: number; y: number };
type MapData = { keywords: string[]; points: MapPoint[]; topicTiers: TopicLabel[][]; visualTopics: VisualTopic[]; subtopics?: Subtopic[]; sourceUpdatedAt?: string; taxonomyVersion?: string; embeddingModel?: string; embeddingRevision?: string };
type PaperDetail = { uid: string; fullAbstract: string; sourceUrl: string | null; resources: unknown[]; loadedAt: string };
type MapMode = "landscape" | "pulse" | "code";
type Surface = "atlas" | "rankings" | "matrix";
type MatrixMetric = "count" | "attention";
type View = { scale: number; x: number; y: number };
type ZoomTier = "overview" | "subtopics" | "papers" | "metadata" | "deep";
type LabelBox = { x: number; y: number; width: number; height: number };
type Relationship = {
  index: number;
  score: number;
  semantic: number;
  method: number;
  task: number;
  strength: "strong" | "medium" | "weak";
  sharedMethods: string[];
  sharedTasks: string[];
  reason: string;
};
type DiscoverySignal = { visits: number; votes: number; stars: number; score: number; coverage: number };
type ConnectedNode = Relationship & { x: number; y: number; ring: "closest" | "bridge"; order: number };
type FocusOrigin = { x: number; y: number };

const CLUSTER_COLORS = [
  "#356df1",
  "#2ca88c",
  "#8f70ef",
  "#ff8b4f",
  "#1f9bb4",
  "#ef6855",
  "#e4aa24",
  "#5b9df4",
];

const MAX_ZOOM = 10;
const RELATION_THRESHOLD = .18;
const RELATION_LIMIT = 10;
const RELATION_WEIGHTS = { semantic: .55, method: .25, task: .20 } as const;
const REPOSITORY_URL = "https://github.com/MisterBrookT/icml-2026-paper-atlas";
const CONNECTED_ANGLES = { closest: [-90, -5, 85, 175], bridge: [-140, -50, 40, 130] } as const;

const SPOTLIGHTS: Record<string, {
  label: string;
  contribution: string;
  metrics: { value: string; label: string }[];
}> = {
  "2511.20639": {
    label: "LatentMAS",
    contribution: "Agents exchange continuous latent states instead of text, reducing communication overhead while preserving richer internal information.",
    metrics: [
      { value: "−70.8-83.7%", label: "TOKEN" },
      { value: "4-4.3×", label: "SPEED" },
      { value: "+14.6%", label: "ACCURACY" },
    ],
  },
  "2504.16828": {
    label: "ThinkPRM",
    contribution: "A process reward model generates an explicit verification chain instead of returning only a scalar score.",
    metrics: [
      { value: "1%", label: "LABELS" },
      { value: "+8 pts", label: "GPQA" },
      { value: "+7.2%", label: "SAME BUDGET" },
    ],
  },
  "2601.23265": {
    label: "PaperBanana",
    contribution: "Specialized agents retrieve references, plan content, render figures, and critique the result for academic illustration.",
    metrics: [
      { value: "292", label: "CASES" },
      { value: "4", label: "STAGES" },
      { value: "4 AXES", label: "EVALUATION" },
    ],
  },
  "2601.22158": {
    label: "Pixel MeanFlow",
    contribution: "Mean-flow consistency enables one-step, latent-free image generation directly in pixel space.",
    metrics: [
      { value: "1", label: "STEP" },
      { value: "2.22", label: "FID · 256²" },
      { value: "2.48", label: "FID · 512²" },
    ],
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function tagSimilarity(a: string[] = [], b: string[] = []) {
  if (!a.length || !b.length) return 0;
  const left = new Set(a), right = new Set(b);
  const shared = [...left].filter(value => right.has(value)).length;
  return shared / new Set([...left, ...right]).size;
}

function zoomTier(scale: number): ZoomTier {
  if (scale < 1.15) return "overview";
  if (scale < 1.75) return "subtopics";
  if (scale < 2.45) return "papers";
  if (scale < 4) return "metadata";
  return "deep";
}

function boxOverlaps(left: LabelBox, right: LabelBox, gap = 5) {
  return !(left.x + left.width + gap < right.x || right.x + right.width + gap < left.x || left.y + left.height + gap < right.y || right.y + right.height + gap < left.y);
}

function canPlaceLabel(box: LabelBox, occupied: LabelBox[], width: number, height: number) {
  if (box.x < 8 || box.y < 8 || box.x + box.width > width - 8 || box.y + box.height > height - 8) return false;
  return !occupied.some(other => boxOverlaps(box, other));
}

function shorten(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function abstractSentences(value: string) {
  return value.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
}

function extractContribution(value: string) {
  const sentences = abstractSentences(value);
  const cue = /\b(we|this (paper|work|study))\s+(introduce|propose|present|develop|show|provide|design|establish)\b/i;
  const sentence = sentences.find(item => cue.test(item)) ?? sentences[1] ?? sentences[0] ?? value;
  return shorten(sentence, 360);
}

function rankRelationships(points: MapPoint[], selected: number): Relationship[] {
  const target = points[selected];
  if (!target) return [];
  const semanticScores = new Map((target.semanticNeighbors ?? []).map(item => [item.index, item.score]));
  const tagCandidates = points
    .map((point, index) => ({
      index,
      method: index === selected ? 0 : tagSimilarity(target.methodTags, point.methodTags),
      task: index === selected ? 0 : tagSimilarity(target.taskTags, point.taskTags),
    }))
    .filter(item => item.index !== selected);
  const candidateIndexes = new Set<number>([...(target.semanticNeighbors ?? []).map(item => item.index)]);
  tagCandidates.slice().sort((a, b) => b.method - a.method || a.index - b.index).slice(0, 8).forEach(item => candidateIndexes.add(item.index));
  tagCandidates.slice().sort((a, b) => b.task - a.task || a.index - b.index).slice(0, 8).forEach(item => candidateIndexes.add(item.index));

  const scored = [...candidateIndexes].map(index => {
    const point = points[index];
    const semantic = semanticScores.get(index) ?? 0;
    const method = tagSimilarity(target.methodTags, point.methodTags);
    const task = tagSimilarity(target.taskTags, point.taskTags);
    const score = semantic * RELATION_WEIGHTS.semantic + method * RELATION_WEIGHTS.method + task * RELATION_WEIGHTS.task;
    const sharedMethods = (target.methodTags ?? []).filter(tag => point.methodTags?.includes(tag));
    const sharedTasks = (target.taskTags ?? []).filter(tag => point.taskTags?.includes(tag));
    const reason = sharedMethods.length && sharedTasks.length
      ? `Shared ${sharedMethods[0]} method and ${sharedTasks[0]} task`
      : sharedMethods.length ? `Shared ${sharedMethods[0]} method`
      : sharedTasks.length ? `Shared ${sharedTasks[0]} task`
      : "High semantic similarity";
    return {
      index,
      score,
      semantic,
      method,
      task,
      strength: score >= .65 ? "strong" as const : score >= .50 ? "medium" as const : "weak" as const,
      sharedMethods,
      sharedTasks,
      reason,
    };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const aboveThreshold = scored.filter(item => item.score >= RELATION_THRESHOLD);
  return (aboveThreshold.length >= 3 ? aboveThreshold : scored.slice(0, 3)).slice(0, RELATION_LIMIT);
}

function percentileSeries(points: MapPoint[], read: (point: MapPoint) => number | null): number[] {
  const values = points.map(read);
  const sorted = values.filter((value): value is number => value != null).sort((a, b) => a - b);
  if (!sorted.length) return values.map(() => 0);
  const percentiles = new Map<number, number>();
  for (let start = 0; start < sorted.length;) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[start]) end += 1;
    percentiles.set(sorted[start], sorted.length === 1 ? 100 : ((start + end) / 2) / (sorted.length - 1) * 100);
    start = end + 1;
  }
  return values.map(value => value == null ? 0 : percentiles.get(value) ?? 0);
}

function discoverySignals(points: MapPoint[]): DiscoverySignal[] {
  const visits = percentileSeries(points, point => point.attentionAvailable && point.visits7d != null ? point.visits7d : null);
  const votes = percentileSeries(points, point => point.attentionAvailable && point.publicVotes != null ? point.publicVotes : null);
  const stars = percentileSeries(points, point => point.githubStars != null ? point.githubStars : null);
  return points.map((point, index) => {
    const coverage = Number(Boolean(point.attentionAvailable && point.visits7d != null)) + Number(Boolean(point.attentionAvailable && point.publicVotes != null)) + Number(point.githubStars != null);
    return { visits: visits[index], votes: votes[index], stars: stars[index], score: visits[index] + votes[index] + stars[index], coverage };
  });
}

function AtlasLogo() {
  return <Image className="atlas-logo" src="/atlas-logo.png" width={40} height={34} alt="" priority unoptimized />;
}

function ConnectedView({
  data,
  selected,
  selectedIndex,
  relationships,
  contribution,
  topic,
  subtopic,
  origin,
  highlighted,
  historyCount,
  onBack,
  onExit,
  onSelect,
  onHighlight,
}: {
  data: MapData;
  selected: MapPoint;
  selectedIndex: number;
  relationships: Relationship[];
  contribution: string;
  topic?: VisualTopic;
  subtopic?: Subtopic;
  origin: FocusOrigin;
  highlighted: number | null;
  historyCount: number;
  onBack: () => void;
  onExit: () => void;
  onSelect: (index: number) => void;
  onHighlight: (index: number | null) => void;
}) {
  const selectedTopicIndex = selected.macroTopicId ?? selected.vc ?? selected.c;
  const closest = relationships.slice(0, 4);
  const closestIndexes = new Set(closest.map(item => item.index));
  const bridgePool = relationships.filter(item => !closestIndexes.has(item.index));
  const crossTopic = bridgePool.filter(item => {
    const point = data.points[item.index];
    return (point.macroTopicId ?? point.vc ?? point.c) !== selectedTopicIndex;
  });
  const bridge = [...crossTopic, ...bridgePool.filter(item => !crossTopic.includes(item))].slice(0, 4);
  const positionNode = (item: Relationship, ring: "closest" | "bridge", order: number): ConnectedNode => {
    const angle = CONNECTED_ANGLES[ring][order] * Math.PI / 180;
    const radiusX = ring === "closest" ? 32 + (1 - item.score) * 8 : 42 + (1 - item.score) * 6;
    const radiusY = ring === "closest" ? 31 + (1 - item.score) * 7 : 40 + (1 - item.score) * 5;
    return { ...item, x: 50 + Math.cos(angle) * radiusX, y: 50 + Math.sin(angle) * radiusY, ring, order };
  };
  const nodes: ConnectedNode[] = [
    ...closest.map((item, order) => positionNode(item, "closest", order)),
    ...bridge.map((item, order) => positionNode(item, "bridge", order)),
  ];

  return <div
    className="connected-view"
    style={{ "--origin-x": `${origin.x}%`, "--origin-y": `${origin.y}%` } as React.CSSProperties}
    onPointerDown={event => event.stopPropagation()}
    onPointerUp={event => event.stopPropagation()}
    onClick={event => { if (event.target === event.currentTarget) onExit(); }}
  >
    <div className="connected-toolbar">
      <button onClick={historyCount ? onBack : onExit}><ArrowLeft size={15} /> {historyCount ? "PREVIOUS PAPER" : "BACK TO ATLAS"}</button>
      <span>CONNECTED VIEW <b>PAPER {(selectedIndex + 1).toLocaleString()} · {nodes.length} LINKS</b></span>
      <button onClick={onExit}>OVERVIEW <kbd>ESC</kbd></button>
    </div>
    <div className="connected-breadcrumb"><span>ATLAS</span><i />{topic && <><span style={{ color: CLUSTER_COLORS[selectedTopicIndex] }}>{topic.label.toUpperCase()}</span><i /></>}{subtopic && <span>{subtopic.label.toUpperCase()}</span>}</div>
    <div className="connected-legend"><span><i className="closest" />CLOSEST</span><span><i className="bridge" />CROSS-TOPIC BRIDGE</span><small>LINE WEIGHT = COMBINED RELATION</small></div>
    <svg className="connected-lines" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
      {nodes.map(node => {
        const point = data.points[node.index];
        const color = CLUSTER_COLORS[point.macroTopicId ?? point.vc ?? point.c];
        const endX = node.x * 10, endY = node.y * 7;
        const controlX = 500 + (endX - 500) * .48;
        const controlY = 350 + (endY - 350) * .22 + (node.order - 1.5) * 8;
        return <path
          key={point.uid ?? `${point.t}-${node.index}`}
          pathLength="1"
          d={`M 500 350 Q ${controlX} ${controlY} ${endX} ${endY}`}
          stroke={color}
          strokeWidth={highlighted === node.index ? 5 : 1.2 + node.score * 4.2}
          opacity={highlighted === null || highlighted === node.index ? (node.ring === "closest" ? .78 : .48) : .16}
        />;
      })}
    </svg>

    <article className="connected-hero" style={{ "--topic-color": CLUSTER_COLORS[selectedTopicIndex] } as React.CSSProperties}>
      <div><span>CENTER PAPER</span><b>{Math.round((selected.attentionPercentile ?? 0) * 100)}<small>ATTN PCTL</small></b></div>
      <h2>{selected.t}</h2>
      <p className="connected-authors">{selected.au.slice(0, 4).join(", ")}{selected.au.length > 4 ? ", et al." : ""}</p>
      <section className="connected-contribution"><span>KEY CONTRIBUTION</span><p>{contribution}</p></section>
      <div className="connected-facts">
        <p><span>CORE METHOD</span><strong>{selected.methodTags?.slice(0, 2).join(" · ") || "Not tagged"}</strong></p>
        <p><span>TASK</span><strong>{selected.taskTags?.slice(0, 2).join(" · ") || "General research"}</strong></p>
        <p><span>DOMAIN</span><strong>{selected.domainTags?.slice(0, 2).join(" · ") || topic?.label || "Machine learning"}</strong></p>
      </div>
      <div className="connected-signals" aria-label="Attention signals, not paper quality">
        <p><strong>{selected.visits7d == null ? "N/A" : selected.visits7d.toLocaleString()}</strong><span>VISITS · 7D</span></p>
        <p><strong>{selected.publicVotes == null ? "N/A" : selected.publicVotes.toLocaleString()}</strong><span>AX VOTES</span></p>
        <p><strong>{selected.githubStars == null ? "N/A" : selected.githubStars.toLocaleString()}</strong><span>GH STARS</span></p>
      </div>
      <footer>
        <span>{topic?.label ?? "ICML 2026"}</span>
        {selected.methodTags?.[0] && <span>{selected.methodTags[0]}</span>}
        {selected.githubStars != null && <span>GH {selected.githubStars.toLocaleString()}</span>}
      </footer>
    </article>

    {nodes.map(node => {
      const point = data.points[node.index];
      const topicIndex = point.macroTopicId ?? point.vc ?? point.c;
      return <button
        className={`connected-node connected-node-${node.ring} ${highlighted === node.index ? "is-highlighted" : ""}`}
        key={point.uid ?? `${point.t}-${node.index}`}
        style={{ left: `${node.x}%`, top: `${node.y}%`, "--node-color": CLUSTER_COLORS[topicIndex], "--node-delay": `${150 + node.order * 55 + (node.ring === "bridge" ? 170 : 0)}ms` } as React.CSSProperties}
        onMouseEnter={() => onHighlight(node.index)}
        onMouseLeave={() => onHighlight(null)}
        onFocus={() => onHighlight(node.index)}
        onBlur={() => onHighlight(null)}
        onClick={() => onSelect(node.index)}
      >
        <span><i />{node.ring === "closest" ? `CLOSEST ${node.order + 1}` : `BRIDGE ${node.order + 1}`}<b>{Math.round(node.score * 100)}</b></span>
        <strong>{point.t}</strong>
        <em>{node.reason}</em>
        <div className="connected-node-signals"><small>SIM {Math.round(node.semantic * 100)}</small><small>DIST {(1 - node.semantic).toFixed(2)}</small></div>
        <small>{data.visualTopics[topicIndex]?.label ?? "ICML 2026"}</small>
      </button>;
    })}
  </div>;
}

function Filters({ data, topic, method, task, onTopic, onMethod, onTask }: {
  data: MapData; topic: string; method: string; task: string;
  onTopic: (value: string) => void; onMethod: (value: string) => void; onTask: (value: string) => void;
}) {
  const methods = [...new Set(data.points.flatMap(point => point.methodTags ?? []))].sort();
  const tasks = [...new Set(data.points.flatMap(point => point.taskTags ?? []))].sort();
  return <div className="filter-bar">
    <label>TOPIC<select value={topic} onChange={event => onTopic(event.target.value)}><option value="">ALL TOPICS</option>{data.visualTopics.map((item, index) => <option key={item.label} value={String(index)}>{item.label}</option>)}</select></label>
    <label>METHOD<select value={method} onChange={event => onMethod(event.target.value)}><option value="">ALL METHODS</option>{methods.map(value => <option key={value}>{value}</option>)}</select></label>
    <label>TASK<select value={task} onChange={event => onTask(event.target.value)}><option value="">ALL TASKS</option>{tasks.map(value => <option key={value}>{value}</option>)}</select></label>
    {(topic || method || task) && <button onClick={() => { onTopic(""); onMethod(""); onTask(""); }}>CLEAR FILTERS</button>}
  </div>;
}

function matchesFilters(point: MapPoint, topic: string, method: string, task: string) {
  if (topic && String(point.macroTopicId ?? point.vc ?? point.c) !== topic) return false;
  if (method && !point.methodTags?.includes(method)) return false;
  if (task && !point.taskTags?.includes(task)) return false;
  return true;
}

function RankingsSurface({ data, topic, method, task, setTopic, setMethod, setTask, onOpenPaper }: {
  data: MapData;
  topic: string; method: string; task: string; setTopic: (value: string) => void; setMethod: (value: string) => void; setTask: (value: string) => void;
  onOpenPaper: (index: number) => void;
}) {
  const signals = useMemo(() => discoverySignals(data.points), [data.points]);
  const filtered = data.points.map((point, index) => ({ point, index })).filter(({ point }) => matchesFilters(point, topic, method, task));
  const ranked = filtered.filter(({ index }) => signals[index].coverage > 0).sort((a, b) => signals[b.index].score - signals[a.index].score || a.index - b.index);
  const topicRanking = data.visualTopics.map((item, index) => {
    const candidateIndexes = data.points.map((point, pointIndex) => ({ point, pointIndex })).filter(({ point }) => (point.macroTopicId ?? point.vc ?? point.c) === index).map(({ pointIndex }) => pointIndex);
    const values = candidateIndexes.filter(pointIndex => signals[pointIndex].coverage > 0).map(pointIndex => signals[pointIndex].score).sort((a, b) => a - b);
    const median = values.length ? values[Math.floor(values.length / 2)] : null;
    const coverage = candidateIndexes.reduce((total, pointIndex) => total + signals[pointIndex].coverage, 0);
    return { item, index, median, coverage, total: candidateIndexes.length * 3 };
  }).sort((a, b) => (b.median ?? -1) - (a.median ?? -1));
  return <section className="data-surface rankings-surface">
    <div className="surface-heading"><div><span>01 / RANKINGS</span><h1>Discovery signal.</h1><p>Three normalized signals combined: 7-day attention, alphaXiv votes, and GitHub adoption. Not paper quality, citations, or academic impact.</p></div><strong>{ranked.length.toLocaleString()} / {filtered.length.toLocaleString()} WITH SIGNALS</strong></div>
    <div className="discovery-legend"><span><i className="visits" />7-DAY VISITS</span><span><i className="votes" />PUBLIC VOTES</span><span><i className="stars" />GITHUB STARS</span><strong>SUM OF THREE PERCENTILES · MAX 300</strong></div>
    <Filters data={data} topic={topic} method={method} task={task} onTopic={setTopic} onMethod={setMethod} onTask={setTask} />
    <div className="rankings-grid">
      <div className="paper-ranking"><div className="ranking-caption"><span>TOP PAPERS</span><strong>DISCOVERY SIGNAL · NOT QUALITY</strong></div>{ranked.slice(0, 40).map(({ point, index }, rank) => {
        const signal = signals[index];
        const topicIndex = point.macroTopicId ?? point.vc ?? point.c;
        return <button className="ranking-row" key={point.uid ?? index} onClick={() => onOpenPaper(index)}>
          <b>{String(rank + 1).padStart(2, "0")}</b><i style={{ background: CLUSTER_COLORS[topicIndex] }} /><span className="ranking-title"><strong>{point.t}</strong><small>{data.visualTopics[topicIndex]?.label ?? "ICML 2026"}</small></span>
          <span className="ranking-bar ranking-stack"><i className="visits" style={{ width: `${signal.visits / 3}%` }} /><i className="votes" style={{ width: `${signal.votes / 3}%` }} /><i className="stars" style={{ width: `${signal.stars / 3}%` }} /></span>
          <span className="ranking-values"><small>7D {point.visits7d == null ? "N/A" : point.visits7d.toLocaleString()}</small><small>VOTES {point.publicVotes == null ? "N/A" : point.publicVotes.toLocaleString()}</small><small>GH {point.githubStars == null ? "N/A" : point.githubStars.toLocaleString()}</small></span><em>{Math.round(signal.score)}<small>{signal.coverage}/3</small></em>
        </button>;
      })}{ranked.length === 0 && <p className="empty-state">NO PAPERS WITH THIS SIGNAL AND FILTER SET.</p>}</div>
      <aside className="topic-ranking"><div className="ranking-caption"><span>TOPIC DISCOVERY</span><strong>MEDIAN SCORE · SIGNAL COVERAGE</strong></div>{topicRanking.map(({ item, index, median, coverage, total }, rank) => <button key={item.label} onClick={() => setTopic(String(index))}><b>{rank + 1}</b><i style={{ background: CLUSTER_COLORS[index] }} /><span><strong>{item.label}</strong><small>{coverage.toLocaleString()} / {total.toLocaleString()} SIGNALS</small></span><em>{median == null ? "N/A" : Math.round(median)}</em></button>)}</aside>
    </div>
  </section>;
}

function MatrixSurface({ data, metric, setMetric, onCell }: { data: MapData; metric: MatrixMetric; setMetric: (metric: MatrixMetric) => void; onCell: (topic: string, method: string) => void }) {
  const methodCounts = new Map<string, number>();
  data.points.forEach(point => point.methodTags?.forEach(tag => methodCounts.set(tag, (methodCounts.get(tag) ?? 0) + 1)));
  const methods = [...methodCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([label]) => label);
  const cells = data.visualTopics.flatMap((_, topic) => methods.map(method => {
    const papers = data.points.filter(point => (point.macroTopicId ?? point.vc ?? point.c) === topic && point.methodTags?.includes(method));
    const attention = papers.map(point => point.attentionPercentile).filter((value): value is number => value != null).sort((a, b) => a - b);
    return { topic, method, count: papers.length, attention: attention.length ? attention[Math.floor(attention.length / 2)] : null, n: attention.length };
  }));
  const maximum = Math.max(...cells.map(cell => cell.count), 1);
  return <section className="data-surface matrix-surface">
    <div className="surface-heading"><div><span>02 / MATRIX</span><h1>Methods moving through fields.</h1><p>Rows are the eight stable Macro Topics. Columns are the 12 most common Method tags in this dataset.</p></div><div className="matrix-toggle"><button className={metric === "count" ? "active" : ""} onClick={() => setMetric("count")}>COUNT</button><button className={metric === "attention" ? "active" : ""} onClick={() => setMetric("attention")}>ATTENTION</button></div></div>
    <div className="matrix-note">{metric === "count" ? "COLOR = PAPER COUNT · CELL = EXACT COUNT" : "COLOR = MEDIAN ATTENTION PERCENTILE · TOOLTIP/CELL = SAMPLE SIZE"}</div>
    <div className="matrix-grid" style={{ gridTemplateColumns: `190px repeat(${methods.length}, minmax(76px, 1fr))` }}>
      <div className="matrix-corner">TOPIC × METHOD</div>{methods.map(method => <div className="matrix-method" key={method}><span>{method}</span><small>{methodCounts.get(method)?.toLocaleString()}</small></div>)}
      {data.visualTopics.map((topic, topicIndex) => <div className="matrix-row" key={topic.label} style={{ display: "contents" }}><button className="matrix-topic" onClick={() => onCell(String(topicIndex), "")}><i style={{ background: CLUSTER_COLORS[topicIndex] }} /><span>{topic.label}</span><small>{topic.count.toLocaleString()}</small></button>{methods.map(method => {
        const cell = cells.find(item => item.topic === topicIndex && item.method === method)!;
        const strength = metric === "count" ? cell.count / maximum : cell.attention ?? 0;
        const missing = metric === "attention" && cell.attention == null;
        return <button key={method} className={`matrix-cell ${missing ? "missing" : ""}`} style={{ background: missing ? undefined : `color-mix(in srgb, ${CLUSTER_COLORS[topicIndex]} ${Math.round(8 + strength * 82)}%, white)` }} onClick={() => onCell(String(topicIndex), method)} title={`${topic.label} × ${method}: ${cell.count} papers; ${cell.n} with attention data`}><strong>{metric === "count" ? cell.count : cell.attention == null ? "N/A" : `P${Math.round(cell.attention * 100)}`}</strong><small>{metric === "attention" ? `n=${cell.n}` : "papers"}</small></button>;
      })}</div>)}
    </div>
  </section>;
}

export function PaperAtlas() {
  const [data, setData] = useState<MapData | null>(null);
  const [surface, setSurface] = useState<Surface>("atlas");
  const [matrixMetric, setMatrixMetric] = useState<MatrixMetric>("count");
  const [topicFilter, setTopicFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [taskFilter, setTaskFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>("pulse");
  const [guideVisible, setGuideVisible] = useState(true);
  const [focused, setFocused] = useState(false);
  const [focusOrigin, setFocusOrigin] = useState<FocusOrigin>({ x: 50, y: 50 });
  const [connectionHistory, setConnectionHistory] = useState<number[]>([]);
  const [highlightedNeighbor, setHighlightedNeighbor] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [preFocusView, setPreFocusView] = useState<View | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 720 });
  const [loadError, setLoadError] = useState(false);
  const [paperDetailCache, setPaperDetailCache] = useState<Record<string, PaperDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const detailRequestRef = useRef<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number; viewX: number; viewY: number; moved: boolean } | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/icml-map.json")
      .then(response => {
        if (!response.ok) throw new Error("Map data unavailable");
        return response.json() as Promise<MapData>;
      })
      .then(next => {
        if (!active) return;
        setData(next);
      })
      .catch(() => active && setLoadError(true));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const nextSurface = params.get("surface");
      const nextMatrix = params.get("matrixMetric");
      if (nextSurface === "atlas" || nextSurface === "rankings" || nextSurface === "matrix") setSurface(nextSurface);
      if (nextMatrix === "count" || nextMatrix === "attention") setMatrixMetric(nextMatrix);
      setTopicFilter(params.get("topic") ?? "");
      setMethodFilter(params.get("method") ?? "");
      setTaskFilter(params.get("task") ?? "");
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("surface", surface);
    params.delete("rankingMetric");
    if (surface === "matrix") params.set("matrixMetric", matrixMetric); else params.delete("matrixMetric");
    if (topicFilter) params.set("topic", topicFilter); else params.delete("topic");
    if (methodFilter) params.set("method", methodFilter); else params.delete("method");
    if (taskFilter) params.set("task", taskFilter); else params.delete("task");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [matrixMetric, methodFilter, surface, taskFilter, topicFilter]);

  useEffect(() => {
    if (!mapRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, [surface]);

  const toScreen = useCallback((point: Pick<MapPoint, "x" | "y"> & Partial<Pick<MapPoint, "vx" | "vy">>) => {
    const pad = 18;
    const visualX = point.vx ?? point.x;
    const visualY = point.vy ?? point.y;
    const rawX = pad + visualX * (size.width - pad * 2);
    const rawY = pad + visualY * (size.height - pad * 2);
    return {
      x: size.width / 2 + (rawX - size.width / 2) * view.scale + view.x,
      y: size.height / 2 + (rawY - size.height / 2) * view.scale + view.y,
    };
  }, [size, view]);

  const animateView = useCallback((target: View, duration = 350) => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    const start = performance.now(), origin = view;
    const tick = (now: number) => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      setView({
        scale: origin.scale + (target.scale - origin.scale) * eased,
        x: origin.x + (target.x - origin.x) * eased,
        y: origin.y + (target.y - origin.y) * eased,
      });
      if (progress < 1) animationRef.current = requestAnimationFrame(tick);
      else animationRef.current = null;
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [view]);

  const relationships = useMemo(() => {
    if (!data || selectedIndex === null) return [];
    return rankRelationships(data.points, selectedIndex);
  }, [data, selectedIndex]);
  const neighbors = useMemo(() => relationships.map(item => item.index), [relationships]);

  const signalBounds = useMemo(() => {
    if (!data) return { visits: 1, stars: 1 };
    const visits = data.points.map(point => point.visits7d ?? 0).sort((a, b) => a - b);
    return {
      visits: Math.max(...visits, 1),
      stars: Math.max(...data.points.map(point => point.githubStars ?? 0), 1),
    };
  }, [data]);

  const searchResults = useMemo(() => {
    if (!data || query.trim().length < 2) return [];
    const needle = query.trim().toLowerCase();
    return data.points.filter(point => {
      if (point.t.toLowerCase().includes(needle)) return true;
      if (point.au.some(author => author.toLowerCase().includes(needle))) return true;
      return point.k.some(id => data.keywords[id]?.toLowerCase().includes(needle));
    }).slice(0, 7);
  }, [data, query]);

  const selected = data && selectedIndex !== null ? data.points[selectedIndex] : null;
  const hoveredPaper = data && hovered ? data.points[hovered.index] : null;
  const hoveredTopic = hoveredPaper && data ? data.visualTopics[hoveredPaper.vc ?? hoveredPaper.c] : null;
  const spotlight = selected ? SPOTLIGHTS[selected.uid ?? ""] : null;
  const selectedTopic = selected && data ? data.visualTopics[selected.vc ?? selected.c] : null;
  const selectedSubtopic = selected && data ? data.subtopics?.find(item => item.id === selected.subtopicId) : null;
  const currentZoomTier = zoomTier(view.scale);
  const experienceMode = focused ? "focus" : currentZoomTier === "overview" ? "overview" : "explore";
  const selectedDetail = selected?.uid ? paperDetailCache[selected.uid] : null;
  const readableAbstract = selectedDetail?.fullAbstract || selected?.b || "";
  const contribution = spotlight?.contribution ?? extractContribution(readableAbstract);

  useEffect(() => {
    if (!selected?.uid || paperDetailCache[selected.uid]) return;
    const controller = new AbortController();
    const requestedUid = selected.uid;
    detailRequestRef.current = requestedUid;
    fetch(`/api/papers/${encodeURIComponent(selected.uid)}`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Paper detail unavailable");
        return response.json() as Promise<PaperDetail>;
      })
      .then(detail => setPaperDetailCache(current => ({ ...current, [detail.uid]: detail })))
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (detailRequestRef.current === requestedUid) setDetailError(true);
      })
      .finally(() => {
        if (detailRequestRef.current === requestedUid) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [paperDetailCache, selected?.uid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.width, size.height);
    if (focused) return;

    data.visualTopics.forEach((topic, cluster) => {
      ctx.save();
      ctx.fillStyle = `${CLUSTER_COLORS[cluster]}0d`;
      ctx.strokeStyle = `${CLUSTER_COLORS[cluster]}29`;
      for (let ring = 0; ring < 3; ring += 1) {
        ctx.beginPath();
        for (let step = 0; step <= 96; step += 1) {
          const angle = (step / 96) * Math.PI * 2;
          const wave = 1 + .12 * Math.sin(angle * 3 + cluster) + .055 * Math.sin(angle * 7 + cluster * .7);
          const expansion = ring * .012;
          const point = toScreen({
            x: topic.x + Math.cos(angle) * (topic.rx + expansion) * wave,
            y: topic.y + Math.sin(angle) * (topic.ry + expansion) * wave,
          });
          if (step === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
        }
        ctx.closePath();
        ctx.lineWidth = ring === 0 ? 1 : .7;
        if (ring === 0) ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    });

    data.points.forEach((point, index) => {
      const screen = toScreen(point);
      if (screen.x < -8 || screen.y < -8 || screen.x > size.width + 8 || screen.y > size.height + 8) return;
      const active = index === selectedIndex || neighbors.includes(index);
      const isNeighbor = neighbors.includes(index);
      const visitScore = Math.log1p(point.visits7d ?? 0) / Math.log1p(signalBounds.visits);
      const starScore = Math.log1p(point.githubStars ?? 0) / Math.log1p(signalBounds.stars);
      let radius = clamp(.92 * view.scale, .82, 2.35);
      if (mapMode === "pulse") radius = .75 + visitScore * 4.6;
      if (mapMode === "code") radius = point.githubUrl ? 1.25 : .7;
      if (index === selectedIndex) radius = 5.6;
      else if (isNeighbor && focused) radius = 3.2;
      const focusOpacity = focused && !active ? .28 : 1;
      const modeOpacity = mapMode === "pulse" ? (point.visits7d != null ? .9 : .18) : mapMode === "code" ? (point.githubUrl ? .92 : .18) : 1;
      ctx.globalAlpha = focusOpacity * modeOpacity;
      if (!active) {
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius * 2.35, 0, Math.PI * 2);
        ctx.fillStyle = `${CLUSTER_COLORS[point.vc ?? point.c]}20`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = active ? "#2f63f2" : CLUSTER_COLORS[point.vc ?? point.c];
      if (((mapMode === "code" && !point.githubUrl) || (mapMode === "pulse" && point.visits7d == null)) && !active) {
        ctx.strokeStyle = `${CLUSTER_COLORS[point.vc ?? point.c]}70`;
        ctx.lineWidth = .75;
        ctx.stroke();
      } else ctx.fill();
      if (mapMode === "code" && point.githubUrl && !active) {
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 3 + starScore * 7, 0, Math.PI * 2);
        ctx.strokeStyle = `${CLUSTER_COLORS[point.vc ?? point.c]}b8`;
        ctx.lineWidth = .85 + starScore * 1.5;
        ctx.stroke();
      }
      if (index === selectedIndex) {
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 10.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(47,99,242,.45)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });

    const occupied: LabelBox[] = [];
    data.visualTopics.forEach((topic, index) => {
      const point = toScreen({ x: topic.labelX, y: topic.labelY });
      if (point.x < 30 || point.x > size.width - 30 || point.y < 30 || point.y > size.height - 30) return;
      const label = (topic.mapLabel ?? topic.label).toUpperCase();
      const fontSize = clamp(27 * view.scale, 20, 34);
      ctx.textAlign = "center";
      ctx.globalAlpha = focused ? .42 : 1;
      ctx.font = `700 ${fontSize}px "Arial Narrow", "Helvetica Neue", sans-serif`;
      const measuredWidth = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(246,248,247,.82)";
      ctx.fillRect(point.x - measuredWidth / 2 - 6, point.y - fontSize + 3, measuredWidth + 12, fontSize + 23);
      ctx.fillStyle = CLUSTER_COLORS[index];
      ctx.fillText(label, point.x, point.y);
      ctx.fillStyle = "rgba(16,22,21,.55)";
      ctx.font = `500 ${clamp(10 * view.scale, 8, 13)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillText(`${topic.count.toLocaleString()} papers`, point.x, point.y + 17);
      ctx.globalAlpha = 1;
      const width = Math.min(260, Math.max(72, measuredWidth));
      occupied.push({ x: point.x - width / 2, y: point.y - fontSize, width, height: fontSize + 23 });
    });

    if (!focused && currentZoomTier !== "overview") {
      [...(data.subtopics ?? [])].sort((a, b) => b.count - a.count).forEach(subtopic => {
        const point = toScreen({ x: subtopic.x, y: subtopic.y });
        if (point.x < 50 || point.x > size.width - 50 || point.y < 40 || point.y > size.height - 40) return;
        const label = shorten(subtopic.label.toUpperCase(), 34);
        const width = Math.min(184, Math.max(76, label.length * 5.2));
        const box = { x: point.x - width / 2, y: point.y - 10, width, height: 18 };
        if (!canPlaceLabel(box, occupied, size.width, size.height)) return;
        occupied.push(box);
        ctx.fillStyle = focused ? "rgba(16,22,21,.28)" : "rgba(246,248,247,.84)";
        ctx.fillRect(box.x - 4, box.y - 2, box.width + 8, box.height + 4);
        ctx.fillStyle = focused ? "rgba(16,22,21,.36)" : "rgba(16,22,21,.67)";
        ctx.textAlign = "center";
        ctx.font = "600 8px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(label, point.x, point.y + 3);
      });
    }

    if (!focused && (currentZoomTier === "papers" || currentZoomTier === "metadata" || currentZoomTier === "deep")) {
      const limit = currentZoomTier === "papers" ? 10 : currentZoomTier === "metadata" ? 24 : 40;
      const candidates = data.points
        .map((point, index) => ({ point, index, screen: toScreen(point) }))
        .filter(item => item.screen.x > 35 && item.screen.x < size.width - 35 && item.screen.y > 35 && item.screen.y < size.height - 35)
        .sort((a, b) => (b.point.representativeScore ?? b.point.labelPriority ?? 0) - (a.point.representativeScore ?? a.point.labelPriority ?? 0));
      let placed = 0;
      for (const item of candidates) {
        if (placed >= limit) break;
        const detailed = currentZoomTier === "metadata" || currentZoomTier === "deep";
        const deep = currentZoomTier === "deep";
        const width = deep ? 220 : detailed ? 198 : 166;
        const height = deep ? 58 : detailed ? 44 : 28;
        const box = { x: item.screen.x + 8, y: item.screen.y - height / 2, width, height };
        if (!canPlaceLabel(box, occupied, size.width, size.height)) continue;
        occupied.push(box);
        placed += 1;
        const color = CLUSTER_COLORS[item.point.vc ?? item.point.c];
        ctx.fillStyle = "rgba(250,252,249,.94)";
        ctx.strokeStyle = `${color}8c`;
        ctx.lineWidth = .8;
        ctx.fillRect(box.x, box.y, box.width, box.height);
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        ctx.fillStyle = "#101615";
        ctx.textAlign = "left";
        ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(shorten(item.point.t, deep ? 42 : detailed ? 38 : 30), box.x + 8, box.y + 15);
        if (detailed) {
          const signals = [
            mapMode === "pulse" && item.point.attentionAvailable ? `${(item.point.visits7d ?? 0).toLocaleString()} VISITS · 7D` : null,
            mapMode === "code" && item.point.githubStars != null ? `GH ${item.point.githubStars.toLocaleString()}` : null,
            item.point.methodTags?.[0] ?? item.point.taskTags?.[0] ?? null,
          ].filter(Boolean).join(" · ");
          ctx.fillStyle = "rgba(16,22,21,.58)";
          ctx.font = "500 7px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.fillText(shorten(signals || "PAPER METADATA", 46), box.x + 8, box.y + 31);
          if (deep) {
            const context = [item.point.taskTags?.[0], item.point.domainTags?.[0], `CONF ${((item.point.macroTopicConfidence ?? 0) * 100).toFixed(1)}`].filter(Boolean).join(" · ");
            ctx.fillText(shorten(context, 50), box.x + 8, box.y + 46);
          }
        }
      }
    }

    if (focused && selectedIndex !== null && selected) {
      const origin = toScreen(selected);
      const visibleRelationships = relationships.slice(0, 3);
      relationships.forEach((relationship, order) => {
        const index = relationship.index;
        const neighbor = data.points[index];
        const destination = toScreen(neighbor);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.quadraticCurveTo(
          (origin.x + destination.x) / 2,
          (origin.y + destination.y) / 2 + (order - (relationships.length - 1) / 2) * 3,
          destination.x,
          destination.y,
        );
        const opacity = relationship.strength === "strong" ? .82 : relationship.strength === "medium" ? .52 : .28;
        ctx.strokeStyle = highlightedNeighbor === index ? "rgba(47,99,242,.98)" : `rgba(47,99,242,${opacity})`;
        ctx.lineWidth = relationship.strength === "strong" ? 2.6 : relationship.strength === "medium" ? 1.65 : .9;
        if (relationship.strength === "weak") ctx.setLineDash([4, 5]);
        ctx.stroke();
        ctx.restore();
      });

      const focusBoxes: LabelBox[] = [];
      visibleRelationships.forEach((relationship, order) => {
        const index = relationship.index;
        const neighbor = data.points[index];
        const destination = toScreen(neighbor);
        const detailed = currentZoomTier === "papers" || currentZoomTier === "metadata" || currentZoomTier === "deep";
        const labelWidth = detailed ? 210 : 180;
        const labelHeight = detailed ? 49 : 36;
        const preferredX = order % 2 === 0 ? destination.x + 13 : destination.x - labelWidth - 13;
        const preferredY = destination.y - labelHeight / 2 + (order - 1) * 15;
        let box = { x: clamp(preferredX, 10, size.width - labelWidth - 10), y: clamp(preferredY, 10, size.height - labelHeight - 10), width: labelWidth, height: labelHeight };
        if (!canPlaceLabel(box, focusBoxes, size.width, size.height)) box = { ...box, y: clamp(box.y + labelHeight + 9, 10, size.height - labelHeight - 10) };
        focusBoxes.push(box);
        ctx.fillStyle = "rgba(250,252,249,.96)";
        ctx.strokeStyle = "rgba(47,99,242,.58)";
        ctx.lineWidth = .9;
        ctx.fillRect(box.x, box.y, box.width, box.height);
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        ctx.fillStyle = "#101615";
        ctx.textAlign = "left";
        ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(shorten(neighbor.t, detailed ? 40 : 32), box.x + 9, box.y + 14);
        ctx.fillStyle = "rgba(16,22,21,.58)";
        ctx.font = "500 7px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(shorten(relationship.reason, 34), box.x + 9, box.y + 27);
        if (detailed) {
          const signal = neighbor.githubStars
            ? `ATTN P${Math.round((neighbor.attentionPercentile ?? 0) * 100)} · GH ${neighbor.githubStars.toLocaleString()}`
            : neighbor.attentionAvailable ? `ATTENTION P${Math.round((neighbor.attentionPercentile ?? 0) * 100)}` : "ATTENTION UNAVAILABLE";
          ctx.fillText(signal, box.x + 9, box.y + 40);
        }
      });

      const selectedDetailed = currentZoomTier === "papers" || currentZoomTier === "metadata" || currentZoomTier === "deep";
      const selectedWidth = selectedDetailed ? 252 : 224;
      const selectedHeight = selectedDetailed ? 62 : 46;
      const selectedLabelX = clamp(origin.x + 35, 10, size.width - selectedWidth - 10);
      const selectedLabelY = clamp(origin.y + 12, 10, size.height - selectedHeight - 10);
      ctx.save();
      ctx.fillStyle = "rgba(250,252,249,.98)";
      ctx.strokeStyle = "#2f63f2";
      ctx.lineWidth = 1.4;
      ctx.fillRect(selectedLabelX, selectedLabelY, selectedWidth, selectedHeight);
      ctx.strokeRect(selectedLabelX, selectedLabelY, selectedWidth, selectedHeight);
      ctx.fillStyle = "#2f63f2";
      ctx.textAlign = "left";
      ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(spotlight?.label ?? "SELECTED PAPER", selectedLabelX + 10, selectedLabelY + 15);
      ctx.fillStyle = "#101615";
      ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      const selectedTitle = shorten(selected.t, selectedDetailed ? 44 : 38);
      ctx.fillText(selectedTitle, selectedLabelX + 10, selectedLabelY + 31);
      if (selectedDetailed) {
        ctx.fillStyle = "rgba(16,22,21,.58)";
        ctx.font = "500 7px ui-monospace, SFMono-Regular, Menlo, monospace";
        const meta = [
          selected.attentionAvailable ? `ATTENTION P${Math.round((selected.attentionPercentile ?? 0) * 100)}` : "ATTENTION N/A",
          selected.githubStars ? `GH ${selected.githubStars.toLocaleString()}` : null,
          selected.methodTags?.[0] ?? selected.taskTags?.[0] ?? null,
        ].filter(Boolean).join(" · ");
        ctx.fillText(shorten(meta, 52), selectedLabelX + 10, selectedLabelY + 47);
      }
      ctx.restore();
    }
  }, [currentZoomTier, data, focused, highlightedNeighbor, mapMode, neighbors, relationships, selected, selectedIndex, signalBounds, size, spotlight, toScreen, view.scale]);

  const closestPoint = useCallback((clientX: number, clientY: number) => {
    if (!data || !canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    let best = -1, bestDistance = 14 * 14;
    data.points.forEach((point, index) => {
      const screen = toScreen(point);
      const dx = screen.x - x, dy = screen.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) { best = index; bestDistance = distance; }
    });
    return best >= 0 ? { index: best, x, y } : null;
  }, [data, toScreen]);

  const exitFocus = useCallback(() => {
    setFocused(false);
    setSelectedIndex(null);
    setHighlightedNeighbor(null);
    setConnectionHistory([]);
    animateView(preFocusView ?? { scale: 1, x: 0, y: 0 });
    setPreFocusView(null);
  }, [animateView, preFocusView]);

  const resetView = useCallback(() => {
    if (focused) {
      exitFocus();
      return;
    }
    animateView({ scale: 1, x: 0, y: 0 });
  }, [animateView, exitFocus, focused]);

  const zoomAroundVisiblePaper = useCallback((factor: number) => {
    setView(current => {
      const scale = clamp(current.scale * factor, .72, MAX_ZOOM);
      if (!data || scale === current.scale) return { ...current, scale };

      const centerX = size.width / 2;
      const centerY = size.height / 2;
      const targetX = centerX;
      const pad = 18;
      let anchor = data.points[0];
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const point of data.points) {
        const visualX = point.vx ?? point.x;
        const visualY = point.vy ?? point.y;
        const rawX = pad + visualX * (size.width - pad * 2);
        const rawY = pad + visualY * (size.height - pad * 2);
        const screenX = centerX + (rawX - centerX) * current.scale + current.x;
        const screenY = centerY + (rawY - centerY) * current.scale + current.y;
        const distance = (screenX - centerX) ** 2 + (screenY - centerY) ** 2;
        if (distance < nearestDistance) {
          anchor = point;
          nearestDistance = distance;
        }
      }

      const anchorX = pad + (anchor.vx ?? anchor.x) * (size.width - pad * 2);
      const anchorY = pad + (anchor.vy ?? anchor.y) * (size.height - pad * 2);
      return {
        scale,
        x: targetX - centerX - (anchorX - centerX) * scale,
        y: -(anchorY - centerY) * scale,
      };
    });
  }, [data, size]);

  const selectPoint = useCallback((index: number, options?: { recordHistory?: boolean }) => {
    if (!data || index < 0 || index >= data.points.length) return;
    if (focused && selectedIndex === index) return;
    if (!focused) {
      setPreFocusView(view);
      setConnectionHistory([]);
      const origin = surface === "atlas" ? toScreen(data.points[index]) : { x: size.width / 2, y: size.height / 2 };
      setFocusOrigin({ x: clamp(origin.x / Math.max(size.width, 1) * 100, 0, 100), y: clamp(origin.y / Math.max(size.height, 1) * 100, 0, 100) });
    } else if (selectedIndex !== null && options?.recordHistory !== false) {
      setConnectionHistory(current => [...current, selectedIndex].slice(-12));
      setFocusOrigin({ x: 50, y: 50 });
    }
    const uid = data.points[index].uid;
    setSurface("atlas");
    setSelectedIndex(index);
    setQuery("");
    setFocused(true);
    setDetailLoading(Boolean(uid && !paperDetailCache[uid]));
    setDetailError(false);
  }, [data, focused, paperDetailCache, selectedIndex, size, surface, toScreen, view]);

  const goBackConnection = useCallback(() => {
    const previous = connectionHistory.at(-1);
    if (previous == null) {
      exitFocus();
      return;
    }
    setConnectionHistory(current => current.slice(0, -1));
    selectPoint(previous, { recordHistory: false });
  }, [connectionHistory, exitFocus, selectPoint]);

  useEffect(() => {
    if (!focused) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitFocus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitFocus, focused]);

  return (
    <main className={`atlas-shell mode-${experienceMode} map-mode-${mapMode}`}>
      <header className="atlas-header">
        <a className="atlas-brand" href="#atlas"><AtlasLogo /><span><strong>ICML 2026 PAPER ATLAS</strong><small>A SEMANTIC TOPOGRAPHIC MAP OF 6,628 PAPERS</small></span></a>
        <div className="atlas-search-wrap">
          <MagnifyingGlass size={18} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, keyword, author, concept…" aria-label="搜索论文" />
          <kbd>⌘ K</kbd>
          {searchResults.length > 0 && (
            <div className="atlas-search-results">
              {searchResults.map(point => {
                const index = data?.points.indexOf(point) ?? -1;
                return <button key={point.uid ?? point.url ?? point.t} onClick={() => selectPoint(index)}><span style={{ background: CLUSTER_COLORS[point.vc ?? point.c] }} /><strong>{point.t}</strong><small>{point.au.slice(0, 3).join(", ")}{point.au.length > 3 ? ", et al." : ""}</small></button>;
              })}
            </div>
          )}
        </div>
        <div className="lens-switch surface-switch" aria-label="主要视图">
          <span>EXPLORE</span>
          <div>
            <button className={surface === "atlas" ? "active" : ""} onClick={() => setSurface("atlas")}><MapTrifold size={16} />ATLAS</button>
            <button className={surface === "rankings" ? "active" : ""} onClick={() => setSurface("rankings")}><Pulse size={16} />RANKINGS</button>
            <button className={surface === "matrix" ? "active" : ""} onClick={() => setSurface("matrix")}><SquaresFour size={16} />MATRIX</button>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" aria-label="Open source repository on GitHub"><GithubLogo size={16} />GITHUB</a>
          </div>
        </div>
        <div className="atlas-status"><i /><span>UPDATED 2026-07-15<strong>{data ? data.points.length.toLocaleString() : "N/A"} PAPERS</strong></span></div>
      </header>

      {surface === "atlas" && <section className={`atlas-workspace ${focused ? "is-focused" : ""}`} id="atlas">
        <div
          className="atlas-map"
          ref={mapRef}
          onPointerDown={event => {
            if (focused) return;
            dragRef.current = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            if (focused) return;
            const drag = dragRef.current;
            if (drag) {
              const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
              if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
              setView(current => ({ ...current, x: drag.viewX + dx, y: drag.viewY + dy }));
              setHovered(null);
            } else setHovered(closestPoint(event.clientX, event.clientY));
          }}
          onPointerLeave={() => { dragRef.current = null; setHovered(null); }}
          onPointerUp={event => {
            if (focused) {
              exitFocus();
              return;
            }
            const drag = dragRef.current;
            if (drag && !drag.moved) {
              const closest = closestPoint(event.clientX, event.clientY);
              if (closest) selectPoint(closest.index);
            }
            dragRef.current = null;
          }}
          onWheel={event => {
            if (focused) return;
            event.preventDefault();
            const delta = event.deltaY > 0 ? .88 : 1.13;
            const rect = event.currentTarget.getBoundingClientRect();
            const cursorX = event.clientX - rect.left;
            const cursorY = event.clientY - rect.top;
            setView(current => {
              const scale = clamp(current.scale * delta, .72, MAX_ZOOM);
              const ratio = scale / current.scale;
              return {
                scale,
                x: cursorX - size.width / 2 - (cursorX - size.width / 2 - current.x) * ratio,
                y: cursorY - size.height / 2 - (cursorY - size.height / 2 - current.y) * ratio,
              };
            });
          }}
        >
          <canvas ref={canvasRef} aria-label="ICML 2026 论文语义地图" />
          {focused && selected && data && selectedIndex !== null && <ConnectedView
            key={selected.uid ?? selectedIndex}
            data={data}
            selected={selected}
            selectedIndex={selectedIndex}
            relationships={relationships}
            contribution={contribution}
            topic={selectedTopic ?? undefined}
            subtopic={selectedSubtopic ?? undefined}
            origin={focusOrigin}
            highlighted={highlightedNeighbor}
            historyCount={connectionHistory.length}
            onBack={goBackConnection}
            onExit={exitFocus}
            onSelect={selectPoint}
            onHighlight={setHighlightedNeighbor}
          />}
          {!data && !loadError && <div className="map-loading"><Sparkle size={20} />ASSEMBLING 6,628 PAPERS…</div>}
          {loadError && <div className="map-loading error">MAP DATA UNAVAILABLE</div>}
          {hovered && hoveredPaper && (
            <div className="paper-tooltip" style={{ left: hovered.x, top: hovered.y }}>
              <small>{hoveredTopic?.label ?? "ICML 2026"}</small>
              <strong>{hoveredPaper.t}</strong>
              <span>{hoveredPaper.au.slice(0, 3).join(", ")}{hoveredPaper.au.length > 3 ? ", et al." : ""}</span>
              <div><span><b>{hoveredPaper.visits7d == null ? "N/A" : hoveredPaper.visits7d.toLocaleString()}</b>7D VISITS</span><span><b>{hoveredPaper.githubStars == null ? "N/A" : hoveredPaper.githubStars.toLocaleString()}</b>GITHUB STARS</span></div>
            </div>
          )}

          {!focused && <div className="zoom-control" onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}>
            <button onClick={() => zoomAroundVisiblePaper(1.25)} aria-label="放大"><Plus size={15} /></button>
            <span>{view.scale.toFixed(2)}×</span>
            <button onClick={() => zoomAroundVisiblePaper(1 / 1.25)} aria-label="缩小"><Minus size={15} /></button>
            <button onClick={resetView} aria-label="重置视图"><SquaresFour size={15} /></button>
          </div>}

          {!focused && <div className="map-mode-switch" onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}>
            <span>COLOR ALWAYS = MACRO TOPIC</span>
            <div>
              <button className={mapMode === "landscape" ? "active" : ""} onClick={() => setMapMode("landscape")}><strong>LANDSCAPE</strong><small>EQUAL DOTS</small></button>
              <button className={mapMode === "pulse" ? "active" : ""} onClick={() => setMapMode("pulse")}><strong>7-DAY HEAT</strong><small>SIZE = VISITS</small></button>
              <button className={mapMode === "code" ? "active" : ""} onClick={() => setMapMode("code")}><strong>GITHUB</strong><small>RING = STARS</small></button>
            </div>
          </div>}
          {!focused && (guideVisible ? <aside className={`map-reading-guide guide-${mapMode}`} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}>
            <button className="guide-close" onClick={() => setGuideVisible(false)} aria-label="关闭地图说明"><X size={13} /></button>
            <div><span>HOW TO READ</span><strong>{mapMode === "landscape" ? "SEMANTIC LANDSCAPE" : mapMode === "pulse" ? "CURRENT ATTENTION" : "OPEN-SOURCE ADOPTION"}</strong></div>
            {mapMode === "landscape" && <p><i className="guide-dot equal" />One dot = one paper. Equal size. Nearby papers are semantically similar. Color = Macro Topic.</p>}
            {mapMode === "pulse" && <><p><span className="guide-dots"><i className="guide-dot small" /><i className="guide-dot large" /></span>Larger dot = more alphaXiv visits during last 7 days. Hollow dot = missing visit data.</p><button onClick={() => setSurface("rankings")}>VIEW DISCOVERY RANKING</button></>}
            {mapMode === "code" && <><p><span className="guide-code-symbol"><i className="guide-dot equal" /><i /></span>Center dot = paper. Outer ring = repository Stars. Larger ring means more Stars. Hollow dot = no repository.</p><button onClick={() => setSurface("rankings")}>VIEW DISCOVERY RANKING</button></>}
            <small>Attention and Stars are signals, not paper quality or citations.</small>
          </aside> : <button className="map-guide-open" onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onClick={() => setGuideVisible(true)}><Question size={14} /> HOW TO READ</button>)}
          {!focused && <div className="density-legend"><span>DENSITY</span>{[.25,.38,.52,.68,.82,1].map(value => <i key={value} style={{ opacity: value }} />)}<small>LOW</small><small>HIGH</small></div>}
          {!focused && <div className="semantic-scale"><span>0</span><span>250</span><span>500</span><span>750</span><i /><small>µ-semantic units</small></div>}
        </div>

        {selected && data && (
          <aside className={`paper-inspector ${focused ? "focus-reader" : ""}`}>
            <div className="inspector-top"><span>FOCUS · PAPER {(selectedIndex ?? 0) + 1} OF {data.points.length.toLocaleString()}</span><div><button onClick={() => selectPoint(((selectedIndex ?? 0) - 1 + data.points.length) % data.points.length)} aria-label="上一篇"><CaretLeft size={16} /></button><button onClick={() => selectPoint(((selectedIndex ?? 0) + 1) % data.points.length)} aria-label="下一篇"><CaretRight size={16} /></button><button onClick={exitFocus} aria-label="关闭并返回全局"><X size={16} /></button></div></div>
            <section className="inspector-main">
              <p className="topic-label" style={{ color: CLUSTER_COLORS[selected.vc ?? selected.c] }}>{selectedTopic?.label ?? "ICML 2026"}</p>
              {selectedSubtopic && <p className="subtopic-label">{selectedSubtopic.label}</p>}
              <h1>{spotlight && !selected.t.toLowerCase().includes(spotlight.label.toLowerCase()) ? `${spotlight.label}: ${selected.t}` : selected.t}</h1>
              <p className="paper-authors">{selected.au.slice(0, 5).join(", ")}{selected.au.length > 5 ? ", et al." : ""}</p>
              <p className="paper-session">{selected.se} · {new Date(selected.sc).toLocaleDateString("en", { month: "short", day: "numeric" })}</p>

              <div className="inspector-section contribution-section"><span>KEY CONTRIBUTION</span><p>{contribution}</p><small>{spotlight ? "CURATED SUMMARY" : selectedDetail ? "EXTRACTED FROM FULL ABSTRACT" : "EXTRACTED FROM PREVIEW ABSTRACT"}</small></div>
              <div className="inspector-section connection-cards reader-connections">
                <div className="connections-heading"><span>RELATED PAPERS ({relationships.length})</span><small>COMBINED SIGNAL</small></div>{relationships.map(relationship => {
                const item = data.points[relationship.index];
                const sharedTags = [...relationship.sharedMethods, ...relationship.sharedTasks].slice(0, 4);
                return <button className={`relation-card relation-${relationship.strength}`} key={item.uid ?? item.url ?? `${item.t}-${relationship.index}`} onMouseEnter={() => setHighlightedNeighbor(relationship.index)} onMouseLeave={() => setHighlightedNeighbor(null)} onClick={() => selectPoint(relationship.index)}>
                  <span className="relation-card-title"><i style={{ background: CLUSTER_COLORS[item.vc ?? item.c] }} /><strong>{item.t}</strong><b>{Math.round(relationship.score * 100)}</b></span>
                  <em>{relationship.reason}</em>
                  <span className="relation-card-meta"><span>{sharedTags.map(tag => <i key={tag}>{tag}</i>)}</span><small>{relationship.strength.toUpperCase()}</small></span>
                  <span className="relation-card-bar"><i style={{ width: `${clamp(relationship.score * 100, 2, 100)}%` }} /></span>
                </button>;
              })}</div>
              <div className="inspector-section"><span>WHY IT MATTERS</span><div className="why-grid">
                {(selected.taskTags?.length ?? 0) > 0 && <p><span>TASK</span><strong>{selected.taskTags?.slice(0, 3).join(" · ")}</strong></p>}
                {(selected.methodTags?.length ?? 0) > 0 && <p><span>METHOD</span><strong>{selected.methodTags?.slice(0, 3).join(" · ")}</strong></p>}
                {(selected.domainTags?.length ?? 0) > 0 && <p><span>DOMAIN</span><strong>{selected.domainTags?.slice(0, 3).join(" · ")}</strong></p>}
              </div><div className="keyword-list">{[...(selected.methodTags ?? []), ...(selected.taskTags ?? []), ...(selected.domainTags ?? [])].slice(0, 9).map(tag => <button key={tag} onClick={() => setQuery(tag)}>{tag}</button>)}</div></div>

              <div className="inspector-section evidence-section"><span>ATTENTION · NOT QUALITY</span><div className="inspector-metrics">
                {[
                  { value: selected.attentionAvailable ? (selected.visits7d ?? 0).toLocaleString() : "N/A", label: "VISITS · 7D" },
                  { value: selected.attentionAvailable ? (selected.visitsAll ?? 0).toLocaleString() : "N/A", label: "VISITS · ALL" },
                  { value: selected.attentionAvailable ? (selected.publicVotes ?? 0).toLocaleString() : "N/A", label: "AX VOTES" },
                  { value: selected.githubStars == null ? "N/A" : `GH ${selected.githubStars.toLocaleString()}`, label: "GITHUB" },
                ].map(metric => <div key={metric.label}><strong>{metric.value}</strong><small>{metric.label}</small></div>)}
              </div><p className="signal-note">7D = current attention · ALL = cumulative reach · GitHub = open-source adoption · citation impact unavailable</p></div>

              <div className="inspector-section abstract-section">
                <div className="section-heading"><span>FULL ABSTRACT</span><small>{detailLoading ? "LOADING FULL TEXT…" : selectedDetail ? "ALPHAXIV DETAIL" : "PREVIEW ABSTRACT"}</small></div>
                <p className="is-expanded">{readableAbstract}</p>
                {detailError && <small className="detail-error">FULL ABSTRACT UNAVAILABLE · SHOWING MAP PREVIEW</small>}
              </div>

              <a className="open-paper-link" href={selected.url} target="_blank" rel="noreferrer">OPEN PAPER PAGE <ArrowSquareOut size={17} /></a>
              {selected.githubUrl && <a className="open-repository" href={selected.githubUrl} target="_blank" rel="noreferrer"><Code size={15} /> OPEN REPOSITORY</a>}
            </section>
          </aside>
        )}
      </section>}
      {surface === "rankings" && data && <RankingsSurface data={data} topic={topicFilter} method={methodFilter} task={taskFilter} setTopic={setTopicFilter} setMethod={setMethodFilter} setTask={setTaskFilter} onOpenPaper={selectPoint} />}
      {surface === "matrix" && data && <MatrixSurface data={data} metric={matrixMetric} setMetric={setMatrixMetric} onCell={(topic, method) => { setTopicFilter(topic); setMethodFilter(method); setTaskFilter(""); setSurface("rankings"); }} />}
      {surface !== "atlas" && !data && <div className="surface-loading">LOADING 6,628 PAPERS…</div>}
      <footer className="atlas-footer"><span>DRAG TO PAN · SCROLL TO ZOOM · CLICK A PAPER</span><p>Islands = our multi-label taxonomy over alphaXiv data. Attention is not paper quality. No line means “citation” unless labeled.</p><span>REAL PAPER + ABSTRACT DATA</span></footer>
    </main>
  );
}
