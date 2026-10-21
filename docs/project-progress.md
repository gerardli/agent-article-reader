# 项目进度与已知问题

## Action list

- [x] 隐私与归属检查（跟踪文件 + 全部历史，仅记录位置与类别）。
- [x] 依赖风险快速分类（advisory、依赖路径、生产/开发范围与触发条件）。
- [x] README 补齐安装、最小示例与已知限制。
- [x] 采用 MIT 许可证并添加 `LICENSE`、`package.json` 许可字段。
- [x] 仓库改为公开并验证匿名访问。
- [x] 文档修正：以远程最新提交为准更新状态，移除本机目录路径，标注历史结论。

## Current status

更新时间：2026-10-22 00:27（北京时间）。人工核查快照，不是实时监控。

### 当前基线（已核实）

- 仓库 gerardli/agent-article-reader，分支 `main`，远程 HEAD `947931e550bee33cee60a6636e694150eb82123f`。
- 公开状态：已公开。GitHub REST 返回 `visibility=public`、`private=false`；未登录访问仓库页面、提交页面与 raw 文件均为 HTTP 200。
- 许可证：MIT。根目录 `LICENSE` 为标准 MIT 文本（Copyright (c) 2026 Gerard Lee）；GitHub 许可证接口返回 `MIT | LICENSE`；`package.json` 含 `"license": "MIT"`。
- CI：提交 947931e 的 push 触发 run 39633025590，completed/success。
- 本机工作区与 `origin/main` 同步；提交本文件前无未提交改动。
- 提交链：0499a6e → 83a451f → a59a030 → af26444 → 4dc75e6 → afce970 → 3bbecc7 → 947931e。

### 当前有效的已知限制

1. 无 `isComplete: true` 的实现路径；完整性判断保守，正文返回与完整性判定已分离。
2. 浏览器源只有 mock 覆盖，真实 CDP 抓取未验收。
3. 依赖告警 10 项（生产树 6 项）：结论来自静态可达性分析，不是漏洞利用验证；当前配置未发现可达路径，版本变动后需重新核对。
4. 中文“验证码”裸词与原始 HTML 全局匹配仍可能误拦主题文章（已知、非安全阻塞）。
5. 站点反爬/UA 差异（403/406、text/plain）按设计拒绝，不绕过。

### 前序检查记录：隐私与归属（2026-10-22）

范围：当时全部 48 个跟踪文件、工作区与全部 6 个提交（逐提交树搜索）；不扫描主目录、不读取凭证文件。

- 凭证形状（`sk-`、`ghp_/gho_/ghu_/ghs_/ghr_`、AKIA、私钥头、`xox*`、`AIza*`、JWT 前缀）：工作区与全部历史均无命中。
- 本机账户名与绝对主目录路径：工作区与全部历史均无命中。
- 邮箱形状：仅 `tests/core/url-safety.test.ts:38` 的合成 fixture（`user:pass@example.com` 形式，用于断言 URL 内嵌凭证被拒绝）；example.com 为保留域名，非个人信息。
- 提交者/作者邮箱：全部为 GitHub noreply 地址。
- 锁文件下载地址：仅 registry.npmjs.org、opencollective.com、github.com、tidelift.com 等公开主机；无内嵌 userinfo、无私有 registry。
- 第三方内容：`src/`、`tests/`、`docs/` 无 vendored 代码、无第三方版权头、无“licensed under”声明；全部代码来自本仓库历史提交。
- 结论：未发现凭证、私人数据或无权公开第三方内容的阻断项。当时唯一未决的许可证问题已于 2026-10-22 确定为 MIT。

### 前序检查记录：依赖风险（2026-10-22）

`npm audit`：10 项（1 critical、4 high、5 moderate）。生产树（`--omit=dev`）6 项，全部通过直接依赖 `@modelcontextprotocol/sdk@1.30.0` 传递引入：

| 严重度 | 包 | 依赖路径 | 触发条件与评估 |
| --- | --- | --- | --- |
| critical | proxy-addr 2.0.7 | sdk → express@5.2.1 → proxy-addr | Express `trust proxy` 下 IPv4-mapped IPv6 信任子网导致 IP 伪造；本项目不启动 HTTP transport，不读取转发头，不可达 |
| high | fast-uri 3.1.5 | sdk → ajv@8.20.0 → fast-uri | URI 格式校验的主机/协议混淆与 SSRF；本项目的 URL 安全校验使用 Node `URL` + 自身 DNS/IP 检查（ipaddr.js），不依赖 fast-uri，不可达 |
| high | @modelcontextprotocol/sdk 1.30.0 | 直接依赖 | OAuth 凭证外发、跨源重定向重发、bearer 令牌跨服务接受、HTTP 校验内存耗尽、tasks 会话绑定；均为 HTTP/OAuth/tasks 路径，本项目只用 stdio，不可达 |
| moderate | hono 4.13.1 | sdk → hono / @hono/node-server | 仅 Hono HTTP 服务端路由触发；未使用 |
| moderate | qs 6.15.3 | sdk → express → body-parser/qs | 仅 Express 请求体解析触发；未使用 |
| moderate | ip-address 10.5.0 | sdk → express-rate-limit → ip-address | 本项目 SSRF 检查使用 ipaddr.js，非该包；未使用 |

开发树另 4 项（vite、vitest、@vitest/mocker、source-map-js），仅影响测试与构建工具链。

证据：`dist/` 无 express/hono/proxy-addr/ip-address/fast-uri 引用；`src/` 仅导入 SDK 的 `server/stdio.js` 与 `server/mcp.js`。

结论：未发现本项目实际运行路径可达的漏洞。该结论来自导入图与 advisory 文本的静态分类，不是漏洞利用验证；未升级依赖，未运行 `npm audit fix --force`。SDK 或传递依赖版本变动后需重新核对。

### 许可证与 README

- 自有代码：均在本仓库历史中原创提交，无 vendored 或第三方版权声明。
- 许可证：MIT（所有者于 2026-10-22 确认）。理由：小型本地 MCP 工具，MIT 最短、最通用，便于复用与二次分发，合规成本低；不含专利授权条款。Apache-2.0 因显式专利授权与 NOTICE 机制未被采用。
- 第三方依赖保持各自原有许可，不做重新授权。`private: true` 仅阻止 npm 发布，不影响源码许可。
- README 已含：安装步骤（Node ≥20、`npm ci`、`npm run build`）、MCP 客户端最小配置、最小调用示例、已知限制（无 `isComplete: true` 路径、浏览器源仅 mock 验证、限制页不返回正文、403/406 与非 HTML 按 unsupported 处理、继承的依赖告警）。

### 测试结果（区分通过 / 失败 / 未运行）

- 提交 4dc75e6：本地 `npm run check` 通过（11 个测试文件、85 个测试，含 tsc 构建）；CI run 39629972672 success。
- 提交 947931e：CI run 39633025590 success。该提交只改 `LICENSE`、`package.json` 元数据与本文件，未重跑本地全量测试。
- 本轮文档修正：未改代码或依赖，未重跑测试。
- 未运行：浏览器/CDP 真实抓取、真实漏洞利用验证。

### 本轮改动

仅修改 `docs/project-progress.md`：按远程最新提交更新当前状态，移除本机目录路径，把私有仓库、许可证未定、尚未公开等过期结论标注为历史记录。未改代码、依赖、工作流、README、`LICENSE` 或仓库设置。

### 提交记录

- `0499a6e` Initial commit
- `83a451f` feat: add compliant agent reader
- `a59a030` fix: fail closed on restricted browser content
- `af26444` docs: record project progress and known issues before further fixes
- `4dc75e6` fix: separate accessibility from proven completeness
- `afce970` docs: verify latest CI and record remaining review limitations
- `3bbecc7` docs: prepare public release review
- `947931e` chore: add MIT license（仓库随后改为公开）

## 历史记录

### 2026-10-21 修正轮

#### Action list

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

#### Current status

更新时间：2026-10-21 23:54（北京时间）。这是一次人工核查快照，不是后台实时监控。

#### 工作区来源与身份核对（本轮）

- 执行端在本线程开始时没有既有项目副本。按主控指定在 Documents 下的目标目录建立工作区，但该目录受 macOS 文件夹权限限制不可读写（`Operation not permitted`）。
- 经授权，使用现有 GitHub 登录（gerardli）将该仓库（当时为私有，默认分支 main）克隆到本机另一个开发目录（路径不在此记录）。
- 本次 clone 是新建工作区，不是找到了原先的本机项目，也不代表同步了任何其他目录中的本地成果。未扫描主目录，未读取其他项目或浏览器资料。
- 身份核对：remote = gerardli/agent-article-reader；`package.json` 为 TypeScript/ESM MCP 项目；入口 `src/index.ts` → `dist/index.js`。与 ai-reading-highlighter 浏览器扩展无关。
- 基线提交：af264440cce31e3d8d7d729dd62060e81f874d4e（与云端最新一致），克隆后工作区干净，无未推送提交。

#### 本轮已完成

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

#### 本轮未完成 / 阻塞

- **独立上下文审查未执行**：本轮按主控要求“不新建子 Agent，由执行端直接完成”，因此没有额外独立 review 上下文。提交前仅由执行端自审 diff。
- **浏览器路径只有离线 mock 验证**：未接入日常浏览器、未导出会话，真实 CDP 抓取未运行。
- **许可证（P5）未处理**（当时状态；2026-10-22 已采用 MIT 并补 LICENSE 与 package.json 字段）。
- 执行端无法访问 Documents 下的指定目录（macOS 文件夹权限），工作区改在本机另一个开发目录；该限制只影响目录选择，不影响仓库内容。

#### 测试结果（区分通过 / 失败 / 未运行）

- **通过**：`npm run check`（typecheck + vitest + build），11 个测试文件、85 个测试全部通过，tsc 构建成功。运行时间 2026-10-21 23:53 CST。
- **云端复核已通过**：提交 4dc75e6 的 push 自动触发 CI，run 39629972672 于北京时间 2026-10-21 23:55:13 完成，结论 success。执行端未手动触发不代表没有自动 CI。
- **未运行**：浏览器/CDP 真实抓取。
- **真实网页 HTTP 验收（2026-10-21 23:54 CST）**：本机 DNS 被本地代理返回 198.18/15 fake-ip，项目 SSRF 防护按设计拒绝（`UNSAFE_TARGET`），未绕过。改用 Cloudflare DoH 解析公网地址后完成以下 5 个公开页面探测：
  - `https://example.com/` → `accessible`，`isComplete:false`，正文 156 字符正常返回（短文章不再被判截断）。
  - `https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview` → `accessible`，`isComplete:false`，正文 12,730 字符返回，标题正确。
  - `https://en.wikipedia.org/wiki/Article_(publishing)` → `unsupported`（站点对该客户端返回 text/plain，未绕过）。
  - `https://www.cloudflare.com/learning/bots/what-is-a-captcha/` → `error` / HTTP 403；`https://www.theguardian.com/international` → `error` / HTTP 406。均未取得正文；仅凭 403/406 不能确定是反爬，具体原因待站点返回内容证实。

#### 本轮提交与推送

- 代码与文档提交：见本次推送的 `fix: separate accessibility from proven completeness` 提交（哈希以推送后的 `git log` 为准，本文档随该提交一并推送）。
- 推送目标：`origin/main`（gerardli/agent-article-reader）。当时仓库仍为私有；2026-10-22 已改为公开。未部署、未发布软件包、未提交申请。

#### 剩余已知问题

1. **P5 许可证与第三方归属**（当时未确定；2026-10-22 已采用 MIT）：锁文件 227 条非根包许可声明（MIT 169、MIT-0 1、Apache-2.0 27、BSD-2-Clause 3、BSD-3-Clause 4、ISC 11、MPL-2.0 12）仅是声明统计，不能据此统一授权第三方代码。
2. **浏览器真实验收缺失**：browser 源只经过 mock fixtures；completeness 语义在真实浏览器会话中的表现未验证。
3. **完整性正面证据缺失**：当前没有任何路径会返回 `isComplete: true`。这是有意保守，但若后续需要“已证实完整”的正面路径（例如站点声明、结构化全文标记或用户确认），需另行设计并补测试，不能靠正文长度推断。
4. **站点反爬与 UA 行为**：部分站点对非浏览器 UA 返回 403/406 或 text/plain；项目按设计拒绝，不绕过，也未增加伪造 UA。
5. **依赖审计**：`npm install` 报告 10 个漏洞（5 moderate、4 high、1 critical）。本轮按“不升级无关依赖”未处理，需单独评估。

#### 后续最小修正与验收

1. 如需要浏览器真实验收：在明确授权下用少量公开页面运行 CDP fixture 之外的抓取，不读取个人会话。
2. 许可证：已完成（2026-10-22 采用 MIT，补 LICENSE 与 package.json license 字段）。
3. 若需要 `isComplete: true` 的正面路径，先定义可验证证据，再改代码与测试。
4. 依赖漏洞单独评估，不与本轮修正混合。

#### 执行边界

优先沿用当前仓库和已有工具，不增加部署或编排系统。修复和检查不以申请材料好看为目标；当时公开、软件包发布、部署和申请提交仍需所有者另行决定（2026-10-22 所有者已授权公开）。

### 云端主控复核（2026-10-22）

已读取提交 4dc75e6 的 diff 与本文件；这是独立于本机执行会话的有限静态复核，不是完整安全审计，也未在云端重跑测试。代码确认将正文返回与完整性分开，且此次未修改 DNS/HTTP 传输实现；DoH 探测方式未包含在提交中，因此不能仅据此提交独立验证探测过程是否保持原有地址校验和 DNS 固定。

本轮修正可作为私有开发阶段成果接收；截至该次复核，公开准备尚未完成（后续轮次已完成公开准备并公开仓库）。

- [CI 39629972672](https://github.com/gerardli/agent-article-reader/actions/runs/39629972672) 已核验为该代码提交、push 事件、completed/success。
- 限制词误拦只得到部分缓解：restricted-signals.ts 仍有裸“验证码”匹配和对原始 HTML/正文的全局匹配，中文验证码主题文章、引用阻断提示的文章仍有误判风险。不要将 P3 标为彻底解决。
- 空提取尚需确认：classifyAccess 的 !extractedText 分支也返回 accessible，可能出现 accessible + content:null，需与正常短文章区分。先记录，后续最小修正，不扩展工程。
- 10 项依赖漏洞目前只有执行端汇总，没有 advisory、依赖路径及生产/开发范围；公开前先做明细分类，不能只按数量判断风险，也不要直接运行强制批量升级。
- 下一步继续使用现有本机工作区，无需迁回 Documents 或额外授予目录访问权限。
