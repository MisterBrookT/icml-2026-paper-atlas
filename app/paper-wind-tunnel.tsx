"use client";

import { useEffect, useMemo, useState } from "react";

type Metric = { value: string; label: string };

type Paper = {
  id: string;
  short: string;
  title: string;
  authors: string;
  type: "latent" | "verifier" | "illustration" | "pixel";
  controlLabel: string;
  controlHint: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  unit: string;
  problem: string;
  mechanism: string;
  evidence: string;
  limit: string;
  metrics: Metric[];
  arxiv: string;
  poster: string;
};

const papers: Paper[] = [
  {
    id: "latentmas",
    short: "LatentMAS",
    title: "Latent Collaboration in Multi-Agent Systems",
    authors: "Jiaru Zou et al.",
    type: "latent",
    controlLabel: "沟通表示",
    controlHint: "左：文本消息；右：连续隐空间",
    min: 0,
    max: 100,
    step: 1,
    initial: 100,
    unit: "% latent",
    problem: "多 Agent 用文本互聊：信息先离散化，再生成、解析；慢且耗 token。",
    mechanism: "每个 Agent 直接输出最后一层隐表示，共享 latent working memory 无损传递内部状态。",
    evidence: "9 个基准：最高 +14.6% 准确率；输出 token 减少 70.8–83.7%；端到端快 4–4.3×。",
    limit: "训练免费不等于推理免费；结果依赖兼容的 LLM 隐表示与共享内存实现。",
    metrics: [
      { value: "−70.8–83.7%", label: "输出 token" },
      { value: "4–4.3×", label: "端到端速度" },
      { value: "+14.6%", label: "最高准确率" },
    ],
    arxiv: "https://arxiv.org/abs/2511.20639",
    poster: "https://icml.cc/virtual/2026/poster/61180",
  },
  {
    id: "thinkprm",
    short: "ThinkPRM",
    title: "Process Reward Models That Think",
    authors: "Muhammad Khalifa et al.",
    type: "verifier",
    controlLabel: "过程标签预算",
    controlHint: "拖到 1%，查看论文关键主张",
    min: 1,
    max: 100,
    step: 1,
    initial: 1,
    unit: "% labels",
    problem: "传统过程奖励模型要给每个推理步骤打标签；监督昂贵，迁移也脆弱。",
    mechanism: "验证器不只输出分数，而是生成一条检查每一步的 verification chain-of-thought。",
    evidence: "只用 PRM800K 约 1% 过程标签，胜过判别式 PRM；跨域 GPQA、LiveCodeBench 分别高 8 与 4.5 个点。",
    limit: "长验证链增加推理成本；论文结果不代表标签预算与性能可线性插值。",
    metrics: [
      { value: "1%", label: "过程标签" },
      { value: "+8 pts", label: "GPQA 子集" },
      { value: "+7.2%", label: "同 token 预算" },
    ],
    arxiv: "https://arxiv.org/abs/2504.16828",
    poster: "https://icml.cc/virtual/2026/poster/68817",
  },
  {
    id: "paperbanana",
    short: "PaperBanana",
    title: "PaperBanana: Automating Academic Illustration for AI Scientists",
    authors: "Dawei Zhu et al.",
    type: "illustration",
    controlLabel: "Agent 工序",
    controlHint: "逐步推进：检索 → 规划 → 渲染 → 自评",
    min: 1,
    max: 4,
    step: 1,
    initial: 1,
    unit: "stage",
    problem: "AI Scientist 能写实验，却仍难产出忠实、简洁、可读的论文插图。",
    mechanism: "专职 Agent 分工：检索视觉参考、规划内容与风格、渲染，再用自我批评迭代。",
    evidence: "PaperBananaBench 含 292 个 NeurIPS 2025 方法图案例；在忠实度、简洁度、可读性、美学上胜过强基线。",
    limit: "视觉质量不等于科学正确；最终图仍需作者核验方法、数字、因果箭头。",
    metrics: [
      { value: "292", label: "方法图案例" },
      { value: "4", label: "专职工序" },
      { value: "4 axes", label: "质量评估" },
    ],
    arxiv: "https://arxiv.org/abs/2601.23265",
    poster: "https://icml.cc/virtual/2026/poster/65206",
  },
  {
    id: "pixelmeanflow",
    short: "Pixel MeanFlow",
    title: "One-step Latent-free Image Generation with Pixel Mean Flows",
    authors: "Yiyang Lu et al.",
    type: "pixel",
    controlLabel: "采样步数",
    controlHint: "拖到 1：直接在像素空间完成生成",
    min: 1,
    max: 32,
    step: 1,
    initial: 1,
    unit: "step",
    problem: "常见扩散模型既多步采样，又依赖 latent 编码器；链路长、系统复杂。",
    mechanism: "网络预测低维图像流形上的 x，损失仍在 MeanFlow 速度空间；两种空间用简单变换连接。",
    evidence: "一步、无 latent：ImageNet 256² 达 2.22 FID，512² 达 2.48 FID。",
    limit: "FID 只衡量分布质量一面；一步生成不自动意味着所有分辨率、数据域都更优。",
    metrics: [
      { value: "1", label: "生成步数" },
      { value: "2.22", label: "FID · 256²" },
      { value: "2.48", label: "FID · 512²" },
    ],
    arxiv: "https://arxiv.org/abs/2601.22158",
    poster: "https://icml.cc/virtual/2026/poster/63515",
  },
];

const views = ["问题", "招式", "证据", "边界"] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function AgentVisual({ value }: { value: number }) {
  const latent = value / 100;
  return (
    <div className="instrument latent-instrument" style={{ "--latent": latent } as React.CSSProperties}>
      <div className="agent agent-a"><span>A</span><small>plan</small></div>
      <div className="agent agent-b"><span>B</span><small>solve</small></div>
      <div className="agent agent-c"><span>C</span><small>check</small></div>
      <div className="memory-core"><i /><strong>shared</strong><small>latent memory</small></div>
      <div className="signal signal-a">{latent < .52 ? "token token token" : "∿ ∿ ∿"}</div>
      <div className="signal signal-b">{latent < .52 ? "parse → text" : "∿ ∿ ∿"}</div>
      <div className="signal signal-c">{latent < .52 ? "reply tokens" : "∿ ∿ ∿"}</div>
      <div className="instrument-caption">{latent < .52 ? "离散文本中介" : "连续表示直接协作"}</div>
    </div>
  );
}

function VerifierVisual({ value }: { value: number }) {
  const normalized = (value - 1) / 99;
  return (
    <div className="instrument verifier-instrument" style={{ "--budget": normalized } as React.CSSProperties}>
      <div className="reasoning-line">
        {["理解题意", "建立方程", "代入", "化简", "答案"].map((label, index) => (
          <div className="reason-step" key={label} style={{ "--delay": `${index * 110}ms` } as React.CSSProperties}>
            <span>{index + 1}</span><small>{label}</small><i />
          </div>
        ))}
      </div>
      <div className="verifier-beam"><span>THINKPRM</span><small>逐步生成验证链</small></div>
      <div className="budget-meter"><span style={{ width: `${clamp(value, 1, 100)}%` }} /></div>
      <div className="instrument-caption">监督预算 {value}% · 论文验证点：1%</div>
    </div>
  );
}

function IllustrationVisual({ value }: { value: number }) {
  const stages = ["检索参考", "规划内容", "渲染图像", "自评精修"];
  return (
    <div className="instrument illustration-instrument">
      <div className="agent-pipeline">
        {stages.map((stage, index) => (
          <div className={`pipeline-stage ${index < value ? "active" : ""}`} key={stage}>
            <span>0{index + 1}</span><strong>{stage}</strong><i />
          </div>
        ))}
      </div>
      <div className={`paper-preview stage-${value}`}>
        <div className="preview-title" />
        <div className="preview-flow"><i /><b /><i /></div>
        <div className="preview-lines"><span /><span /><span /></div>
      </div>
      <div className="instrument-caption">当前工序：{stages[value - 1]}</div>
    </div>
  );
}

function PixelVisual({ value }: { value: number }) {
  const clarity = value === 1 ? 1 : Math.max(.08, 1 - value / 38);
  return (
    <div className="instrument pixel-instrument" style={{ "--clarity": clarity } as React.CSSProperties}>
      <div className="noise-grid">
        {Array.from({ length: 81 }, (_, index) => <i key={index} style={{ "--pixel": index } as React.CSSProperties} />)}
      </div>
      <div className="meanflow-core"><span>pMF</span><small>x ↔ velocity</small></div>
      <div className="image-grid">
        {Array.from({ length: 81 }, (_, index) => <i key={index} style={{ "--pixel": index } as React.CSSProperties} />)}
      </div>
      <div className="flow-arrow"><span>{value === 1 ? "一次流动" : `${value} 次采样对照`}</span></div>
      <div className="instrument-caption">{value === 1 ? "论文方法：一步、无 latent" : "多步基线概念对照（非论文性能插值）"}</div>
    </div>
  );
}

function Experiment({ paper, value }: { paper: Paper; value: number }) {
  if (paper.type === "latent") return <AgentVisual value={value} />;
  if (paper.type === "verifier") return <VerifierVisual value={value} />;
  if (paper.type === "illustration") return <IllustrationVisual value={value} />;
  return <PixelVisual value={value} />;
}

export function PaperWindTunnel() {
  const [paperIndex, setPaperIndex] = useState(0);
  const [activeView, setActiveView] = useState<(typeof views)[number]>("招式");
  const paper = papers[paperIndex];
  const [value, setValue] = useState(paper.initial);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setValue(paper.initial);
    setActiveView("招式");
    setPlaying(false);
  }, [paper]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setValue(current => {
        const next = current + paper.step;
        return next > paper.max ? paper.min : next;
      });
    }, paper.type === "illustration" ? 950 : 90);
    return () => window.clearInterval(timer);
  }, [paper, playing]);

  const explanation = useMemo(() => ({
    问题: paper.problem,
    招式: paper.mechanism,
    证据: paper.evidence,
    边界: paper.limit,
  }), [paper]);

  return (
    <main className="wind-shell">
      <header className="wind-header">
        <a className="wind-brand" href="#top" aria-label="Paper Wind Tunnel 首页">
          <span className="wind-logo"><i /><i /><i /></span>
          <span><strong>PAPER</strong> WIND TUNNEL</span>
        </a>
        <div className="header-meta"><span>ICML 2026</span><i />EXPERIMENTAL EXPLAINER</div>
      </header>

      <section className="paper-tabs" aria-label="选择论文">
        {papers.map((item, index) => (
          <button className={index === paperIndex ? "active" : ""} key={item.id} onClick={() => setPaperIndex(index)}>
            <span>0{index + 1}</span><strong>{item.short}</strong>
          </button>
        ))}
      </section>

      <section className="wind-workspace" id="top">
        <aside className="paper-brief">
          <p className="kicker">PLAYABLE PAPER · 0{paperIndex + 1}</p>
          <h1>{paper.title}</h1>
          <p className="authors">{paper.authors}</p>

          <nav className="explain-nav" aria-label="解释层">
            {views.map(view => <button className={view === activeView ? "active" : ""} key={view} onClick={() => setActiveView(view)}>{view}</button>)}
          </nav>

          <div className="explanation" key={`${paper.id}-${activeView}`}>
            <span>{activeView}</span>
            <p>{explanation[activeView]}</p>
          </div>

          <div className="source-links">
            <a href={paper.arxiv} target="_blank" rel="noreferrer">ARXIV ↗</a>
            <a href={paper.poster} target="_blank" rel="noreferrer">ICML POSTER ↗</a>
          </div>
        </aside>

        <section className="experiment-bay" aria-label={`${paper.short} 交互实验`}>
          <div className="bay-label"><span>LIVE MECHANISM</span><i />拖动下方变量</div>
          <Experiment paper={paper} value={value} />

          <div className="control-deck">
            <div className="control-heading">
              <div><span>关键变量</span><strong>{paper.controlLabel}</strong></div>
              <output>{value}<small>{paper.unit}</small></output>
            </div>
            <input
              aria-label={paper.controlLabel}
              type="range"
              min={paper.min}
              max={paper.max}
              step={paper.step}
              value={value}
              onChange={event => setValue(Number(event.target.value))}
              style={{ "--progress": `${((value - paper.min) / (paper.max - paper.min)) * 100}%` } as React.CSSProperties}
            />
            <div className="control-foot">
              <span>{paper.controlHint}</span>
              <button onClick={() => setPlaying(current => !current)}>{playing ? "暂停" : "播放实验"}</button>
            </div>
          </div>
        </section>

        <aside className="evidence-panel">
          <div className="evidence-heading"><span>EVIDENCE</span><small>论文报告值</small></div>
          <div className="metric-stack">
            {paper.metrics.map(metric => (
              <div className="metric" key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>
            ))}
          </div>
          <div className="truth-label"><i />原文证据层</div>
          <p>动画用于建立直觉；数字只呈现论文报告结果，不把滑杆状态伪装成实验测量。</p>
        </aside>
      </section>

      <footer className="wind-footer">
        <span>PROTOTYPE 01 · 2026-07-14</span>
        <p>Conference map 告诉你论文在哪。Playable paper 告诉你它怎么工作。</p>
        <span>4 / 6,628 PAPERS</span>
      </footer>
    </main>
  );
}
