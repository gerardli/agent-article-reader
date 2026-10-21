# 项目进度与已知问题

## Action list

- [x] 确认目标为 gerardli/agent-article-reader 私有 TypeScript MCP 项目。
- [x] 核对入口、核心代码、测试策略及历史 CI。
- [x] 汇总现有进度与已知问题到本文件，先同步再改进。
- [x] 明确本机工作区的来源与边界（2026-10-21 第二轮）。
- [x] 修正 P1/P2/P3/P4：完整性断言、浏览器 unknown 升级、限制词误判、短文章分类。
- [x] 补必要回归测试并通过 `npm run check`。
- [x] 用少量公开页面完成 HTTP 真实验收，并记录失败/环境限制。
- [ ] 审查拟公开源码、Git 历史和第三方归属，确定自有代码许可证。
- [ ] 按实际可用性整理 README 和公开候选版本。
- [ ] 所有者审核后决定是否公开；另行准备申请材料。

## Current status

更新时间：2026-10-21 23:54（北京时间）。这是一次人工核查快照，不是后台实时监控。

### 工作区来源与身份核对（本轮）

- 执行端在本线程开始时没有既有项目副本。按主控指定，在 `$HOME/Documents/Codex/agent-article-reader` 建立工作区，但该目录受 macOS 文件夹权限限制不可读写（`Operation not permitted`）。
- 经授权，使用现有 GitHub 登录（gerardli）将 `gerardli/agent-article-reader`（私有，默认分支 main）克隆到 `$HOME/1Developer home/chatgpt/github-agent-article-reader`。
- 本次 clone 是新建工作区，不是找到了原先的本机项目，也不代表同步了任何其他目录中的本地成果。未扫描主目录，未读取其他项目或浏览器资料。
- 身份核对：remote = gerardli/agent-article-reader；`package.json` 为 TypeScript/ESM MCP 项目；入口 `src/index.ts` → `dist/index.js`。与 ai-reading-highlighter 浏览器扩展无关。
- 基线提交：af264440cce31e3d8d7d729dd62060e81f874d4e（与云端最新一致），克隆后工作区干净，无未推送提交。

### 本轮已完成

1. **可访问性与完整性语义分离**（P1/P2/P4）
   - `src/core/access.ts`：`accessible` 只表示未检测到限制；`isComplete` 仅在存在明确证据时为 true。HTTP 路径不再用“响应成功 + 正文长度”推断完整，统一返回 `isComplete: false` 并给出原因 indicator。
   - 短文本（<100 字符）不再判为 `truncated`，改为 `accessible` + `isComplete:false` + “insufficient text to assess completeness”。完整短文章、提取不足与真正截断不再混同。
   - `src/browser/access-state.ts` 的 `completeness: unknown` 不再经 HTTP 分类器升级成已确认完整；浏览器 positive 场景同样返回 `isComplete:false`。
2. **正文返回契约同步**
   - `src/core/reader.ts`、`src/app/browser-reader.ts`：内容返回条件由 `accessible && isComplete` 改为 `accessState === "accessible"`，避免“isComplete 全部为 false”导致正常文章全部无法读取；限制、登录、付费墙、截断状态仍不返回正文。
   - `.agents/skills/article-reader/SKILL.md`、`README.md`、`src/mcp/server.ts` 的措辞同步为“isComplete 表示完整性是否被证实，与是否返回正文分离；未证实时须如实标注”。
3. **限制信号误拦收敛**（P3）
   - `src/core/restricted-signals.ts`：删除裸 `\bcaptcha\b`、裸 `subscription required`、裸 `become a subscriber`、`remaining article` 等易误伤模式，改为需要动作/阻断语境的短语（如 `complete the captcha`、`subscribe to continue`）。普通订阅按钮、讨论 CAPTCHA 主题的文章不再命中。
4. **回归测试**
   - 更新 `tests/core/access.test.ts`、`tests/core/reader.test.ts`；新增 `tests/core/restricted-signals.test.ts`，覆盖：长文不虚报完整、短文不误判截断、讨论 CAPTCHA 不误拦、普通订阅入口不误拦、真实登录/订阅/截断仍拦截、浏览器 unknown 不升级。

### 本轮未完成 / 阻塞

- **独立上下文审查未执行**：本轮按主控要求“不新建子 Agent，由执行端直接完成”，因此没有额外独立 review 上下文。提交前仅由执行端自审 diff。
- **浏览器路径只有离线 mock 验证**：未接入日常浏览器、未导出会话，真实 CDP 抓取未运行。
- **许可证（P5）未处理**：仍无 LICENSE/COPYING、package.json 无 license 字段，需所有者决定，本轮不擅自决定。
- 执行端无法访问 `$HOME/Documents/Codex/`（macOS 文件夹权限），工作区改在 `$HOME/1Developer home/chatgpt/github-agent-article-reader`；如需迁回指定目录，需要先在系统设置中给终端授予该文件夹访问权限。

### 测试结果（区分通过 / 失败 / 未运行）

- **通过**：`npm run check`（typecheck + vitest + build），11 个测试文件、85 个测试全部通过，tsc 构建成功。运行时间 2026-10-21 23:53 CST。
- **未运行**：CI（本轮未触发 GitHub Actions，历史 CI 通过不代表本轮）。
- **未运行**：浏览器/CDP 真实抓取。
- **真实网页 HTTP 验收（2026-10-21 23:54 CST）**：本机 DNS 被本地代理返回 198.18/15 fake-ip，项目 SSRF 防护按设计拒绝（`UNSAFE_TARGET`），未绕过。改用 Cloudflare DoH 解析公网地址后完成 4 个公开页面探测：
  - `https://example.com/` → `accessible`，`isComplete:false`，正文 156 字符正常返回（短文章不再被判截断）。
  - `https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview` → `accessible`，`isComplete:false`，正文 12,730 字符返回，标题正确。
  - `https://en.wikipedia.org/wiki/Article_(publishing)` → `unsupported`（站点对该客户端返回 text/plain，未绕过）。
  - `https://www.cloudflare.com/learning/bots/what-is-a-captcha/` → `error` / HTTP 403；`https://www.theguardian.com/international` → `error` / HTTP 406。均为站点反爬拒绝，按设计不取正文。

### 本轮提交与推送

- 代码与文档提交：见本次推送的 `fix: separate accessibility from proven completeness` 提交（哈希以推送后的 `git log` 为准，本文档随该提交一并推送）。
- 推送目标：`origin/main`（gerardli/agent-article-reader，私有仓库）。未公开、未部署、未发布软件包、未开启 CI、未提交申请。

### 剩余已知问题

1. **P5 许可证与第三方归属**：未确定自有代码许可证；锁文件 227 条非根包许可声明（MIT 169、MIT-0 1、Apache-2.0 27、BSD-2-Clause 3、BSD-3-Clause 4、ISC 11、MPL-2.0 12）仅是声明统计，不能据此统一授权。
2. **浏览器真实验收缺失**：browser 源只经过 mock fixtures；completeness 语义在真实浏览器会话中的表现未验证。
3. **完整性正面证据缺失**：当前没有任何路径会返回 `isComplete: true`。这是有意保守，但若后续需要“已证实完整”的正面路径（例如站点声明、结构化全文标记或用户确认），需另行设计并补测试，不能靠正文长度推断。
4. **站点反爬与 UA 行为**：部分站点对非浏览器 UA 返回 403/406 或 text/plain；项目按设计拒绝，不绕过，也未增加伪造 UA。
5. **依赖审计**：`npm install` 报告 10 个漏洞（5 moderate、4 high、1 critical）。本轮按“不升级无关依赖”未处理，需单独评估。

## 后续最小修正与验收

1. 如需要浏览器真实验收：在明确授权下用少量公开页面运行 CDP fixture 之外的抓取，不读取个人会话。
2. 许可证：所有者决定后补 LICENSE 与 package.json license 字段，再核对第三方归属。
3. 若需要 `isComplete: true` 的正面路径，先定义可验证证据，再改代码与测试。
4. 依赖漏洞单独评估，不与本轮修正混合。

## 执行边界

优先沿用当前仓库和已有工具，不增加部署或编排系统。修复和检查不以申请材料好看为目标；公开、软件包发布、部署和申请提交仍需所有者另行决定。
