<div align="center">
  <img src="public/atlas-logo.png" width="72" alt="ICML 2026 Paper Atlas 标志" />
  <h1>ICML 2026 Paper Atlas</h1>
  <p><strong>看见整个领域，而不只是论文列表。</strong></p>
  <p>用一张可交互语义地图探索 6,628 篇 ICML 2026 论文、主题、热度、开源采用与相互关系。</p>
  <p><a href="README.md">English</a> · <a href="https://icml-2026-paper-atlas.vercel.app">在线体验</a></p>
</div>

![ICML 2026 Paper Atlas 全局视图](docs/readme-hero.jpg)

## 为什么做 Atlas

论文列表只能回答“发布了什么”。Atlas 进一步回答：

- **Overview：**今年大家在研究什么？
- **Explore：**一个领域有哪些子主题、方法和代表论文？
- **Understand：**一篇论文做了什么，为什么受到关注，与哪些工作相关？

## 支持什么

| 界面 | 回答的问题 | 编码方式 |
| --- | --- | --- |
| **Atlas** | 论文位于领域的什么位置？ | 语义位置、主主题、子主题 |
| **Attention** | 最近什么被阅读？ | 点大小 = alphaXiv 最近 7 日访问量 |
| **Open Source** | 哪些论文有代码采用？ | 外环 = GitHub Stars |
| **Rankings** | 哪些论文发现信号最强？ | 访问、投票、Stars 分段呈现 |
| **Matrix** | 哪些方法流行于哪些主题？ | Topic × Method 数量或热度中位数 |
| **Focus Reader** | 论文做了什么，为什么相关？ | 完整摘要、元数据和综合关系推荐 |

地图支持最高 10× 语义缩放。随着放大，会逐级出现子主题、代表论文、指标、Method 和 Task。选中论文不会把视图强行拉回全局。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
git clone https://github.com/MisterBrookT/icml-2026-paper-atlas.git
cd icml-2026-paper-atlas
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

```bash
npm run lint
npm test
```

## 数据与分类

- 论文、摘要、关键词、原始语义坐标、访问、投票与仓库数据来自 [alphaXiv](https://www.alphaxiv.org/icml)。
- 八个 Macro Topic 是 Atlas 自己定义的稳定导航锚点，不是直接继承 alphaXiv 分类。
- 使用 `Xenova/all-MiniLM-L6-v2` embedding 与八个语义锚点的 cosine similarity 决定主主题。
- 子主题在主主题内部确定性聚类，名称来自区分度最高的 TF-IDF 词组。
- 每篇论文预计算 12 个语义邻居；浏览器不会加载原始 384 维 embedding。

刷新数据并重建布局：

```bash
npm run atlas:refresh
npm run atlas:github
```

Embedding 模型放在 `work/models/`；缓存和中间文件支持断点恢复，不进入 Git。

## 解读边界

Visits、Votes 和 GitHub Stars 分开表达。它们是关注与采用信号，不代表论文质量、学术影响或引用量。缺失数据保持缺失态，不伪装成 0。仓库中的数据是快照，可能与 alphaXiv 实时 Feed 不同。

## 技术栈

Next.js 16、React 19、Canvas 2D、Transformers.js、MiniLM embedding、seeded UMAP，以及静态 6,628 篇论文地图数据。

## License

[MIT](LICENSE) © 2026 Yinghao Tang.
