# 项目进度与已知问题

## Action list

- [x] 确认 remote、分支与工作区状态，快进同步远程基线 afce970。
- [x] 隐私与归属检查：工作区全部跟踪文件 + 全部 Git 历史，只记录位置与类别。
- [x] 依赖风险快速分类：advisory、依赖路径、生产/开发范围与触发条件。
- [x] README 补齐安装、最小示例与已知限制。
- [ ] 许可证选择（待所有者确认后应用）。
- [ ] 所有者明确同意后再改仓库可见性。

## Current status

更新时间：2026-10-22（北京时间）。人工核查快照，不是实时监控。

### 基线

- 工作区：`$HOME/1Developer home/chatgpt/github-agent-article-reader`，remote = gerardli/agent-article-reader，分支 main。
- 开始时工作区干净；`git fetch` 后 `main` 落后 origin/main 1 个提交（afce970），仅改本文件，已 `--ff-only` 快进，无冲突、无未提交修改需要保护。
- 历史链：0499a6e → 83a451f → a59a030 → af26444 → 4dc75e6 → afce970。

### 1. 隐私与归属检查（实际范围与结论）

范围：全部 48 个跟踪文件、工作区、全部 6 个提交（逐提交树搜索），不扫描主目录、不读取凭证文件。

检查项与结果：
- 凭证形状（`sk-`、`ghp_/gho_/ghu_/ghs_/ghr_`、AKIA、私钥头、`xox*`、`AIza*`、JWT 前缀）：工作区与全部历史均无命中。
- 本机账户名与 `/Users/<name>` 绝对路径：工作区与全部历史均无命中。
- 邮箱形状：仅 `tests/core/url-safety.test.ts:38` 的合成 fixture（`user:pass@example.com` 形式，用于断言 URL 内嵌凭证被拒绝）；example.com 为保留域名，非个人信息。
- 提交者/作者邮箱：全部为 GitHub noreply 地址，可随仓库公开。
- 锁文件下载地址：仅 registry.npmjs.org、opencollective.com、github.com、tidelift.com 等公开主机；无内嵌 userinfo、无私有 registry。
- 第三方内容：`src/`、`tests/`、`docs/` 无 vendored 代码、无第三方版权头、无“licensed under”声明；全部代码来自本仓库历史提交。
- 结论：**未发现凭证、私人数据或无权公开的第三方内容的阻断项**。唯一未决项是仓库自身许可证。

### 2. 依赖风险快速分类

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

结论：**未发现本项目实际运行路径可达的漏洞**；上述 advisory 属于继承的依赖告警，公开前记录、持续跟踪即可，不构成本轮公开阻塞。未执行任何升级，也未运行 `npm audit fix --force`。静态分类，未做真实漏洞利用验证；SDK/传递依赖版本若变动需重新核对。

### 3. 许可证与 README

- 自有代码可授权：代码均在本仓库历史中原创提交，无 vendored 或第三方版权声明。
- 建议许可证：**MIT**。理由：仓库是小型本地 MCP 工具，MIT 最短、最通用，允许复用与二次分发，降低使用者合规成本；不含专利授权条款。若更看重显式专利授权与贡献者条款，可改用 Apache-2.0（更长、需保留 NOTICE 机制）。
- 待所有者确认后再添加 LICENSE 与 `package.json` 的 `license` 字段，不替第三方依赖重新授权。
- README 已补：安装步骤（Node ≥20、`npm ci`、`npm run build`）、MCP 客户端最小配置示例、最小调用示例、已知限制（无 `isComplete: true` 路径、浏览器源仅 mock 验证、限制页不返回正文、403/406 与非 HTML 按 unsupported 处理、继承的依赖告警）。原有边界说明保留。

### 测试结果（区分通过 / 失败 / 未运行）

- 本轮只改 README 与本文件，未改代码或依赖，因此未重跑 `npm run check`（按“纯文档修改无需反复全量测试”）。
- 最近一次代码验证仍为提交 4dc75e6：本地 `npm run check` 85/85 通过；CI run 39629972672 在该提交上 success。afce970 与本次均为文档变更。
- 未运行：浏览器/CDP 真实抓取、真实漏洞利用验证、许可证工具链检查。

### 本轮提交与推送

- 本轮提交：`docs: prepare public release review`（哈希以推送后的 `git log` 为准），仅含 README 与本文件。
- 推送目标：origin/main（私有仓库）。未公开、未部署、未发布软件包、未提交申请。

### 尚未解决但可公开记录的问题

1. 许可证未定（待确认 MIT 或 Apache-2.0，或保留默认“保留所有权利”）。
2. 无 `isComplete: true` 正面路径；完整性判断仍保守。
3. 浏览器源仅有 mock 覆盖，真实 CDP 验收未做。
4. 中文“验证码”裸词与原始 HTML 全局匹配仍可能误拦主题文章（已知、非安全阻塞）。
5. 继承依赖告警 10 项（生产树 6 项），当前配置下不可达，待依赖升级窗口统一处理。
6. 站点反爬/UA 差异（403/406、text/plain）按设计拒绝，不绕过。

---

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

- 执行端在本线程开始时没有既有项目副本。按主控指定，在 `$HOME/Documents/Codex/agent-article-reader` 建立工作区，但该目录受 macOS 文件夹权限限制不可读写（`Operation not permitted`）。
- 经授权，使用现有 GitHub 登录（gerardli）将 `gerardli/agent-article-reader`（私有，默认分支 main）克隆到 `$HOME/1Developer home/chatgpt/github-agent-article-reader`。
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
- **许可证（P5）未处理**：仍无 LICENSE/COPYING、package.json 无 license 字段，需所有者决定，本轮不擅自决定。
- 执行端无法访问 `$HOME/Documents/Codex/`（macOS 文件夹权限），工作区改在 `$HOME/1Developer home/chatgpt/github-agent-article-reader`；如需迁回指定目录，需要先在系统设置中给终端授予该文件夹访问权限。

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
- 推送目标：`origin/main`（gerardli/agent-article-reader，私有仓库）。未公开、未部署、未发布软件包、未开启 CI、未提交申请。

#### 剩余已知问题

1. **P5 许可证与第三方归属**：未确定自有代码许可证；锁文件 227 条非根包许可声明（MIT 169、MIT-0 1、Apache-2.0 27、BSD-2-Clause 3、BSD-3-Clause 4、ISC 11、MPL-2.0 12）仅是声明统计，不能据此统一授权。
2. **浏览器真实验收缺失**：browser 源只经过 mock fixtures；completeness 语义在真实浏览器会话中的表现未验证。
3. **完整性正面证据缺失**：当前没有任何路径会返回 `isComplete: true`。这是有意保守，但若后续需要“已证实完整”的正面路径（例如站点声明、结构化全文标记或用户确认），需另行设计并补测试，不能靠正文长度推断。
4. **站点反爬与 UA 行为**：部分站点对非浏览器 UA 返回 403/406 或 text/plain；项目按设计拒绝，不绕过，也未增加伪造 UA。
5. **依赖审计**：`npm install` 报告 10 个漏洞（5 moderate、4 high、1 critical）。本轮按“不升级无关依赖”未处理，需单独评估。

#### 后续最小修正与验收

1. 如需要浏览器真实验收：在明确授权下用少量公开页面运行 CDP fixture 之外的抓取，不读取个人会话。
2. 许可证：所有者决定后补 LICENSE 与 package.json license 字段，再核对第三方归属。
3. 若需要 `isComplete: true` 的正面路径，先定义可验证证据，再改代码与测试。
4. 依赖漏洞单独评估，不与本轮修正混合。

#### 执行边界

优先沿用当前仓库和已有工具，不增加部署或编排系统。修复和检查不以申请材料好看为目标；公开、软件包发布、部署和申请提交仍需所有者另行决定。

### 云端主控复核（2026-10-22）

已读取提交 4dc75e6 的 diff 与本文件；这是独立于本机执行会话的有限静态复核，不是完整安全审计，也未在云端重跑测试。代码确认将正文返回与完整性分开，且此次未修改 DNS/HTTP 传输实现；DoH 探测方式未包含在提交中，因此不能仅据此提交独立验证探测过程是否保持原有地址校验和 DNS 固定。

本轮修正可作为私有开发阶段成果接收，公开准备尚未完成。

- [CI 39629972672](https://github.com/gerardli/agent-article-reader/actions/runs/39629972672) 已核验为该代码提交、push 事件、completed/success。
- 限制词误拦只得到部分缓解：restricted-signals.ts 仍有裸“验证码”匹配和对原始 HTML/正文的全局匹配，中文验证码主题文章、引用阻断提示的文章仍有误判风险。不要将 P3 标为彻底解决。
- 空提取尚需确认：classifyAccess 的 !extractedText 分支也返回 accessible，可能出现 accessible + content:null，需与正常短文章区分。先记录，后续最小修正，不扩展工程。
- 10 项依赖漏洞目前只有执行端汇总，没有 advisory、依赖路径及生产/开发范围；公开前先做明细分类，不能只按数量判断风险，也不要直接运行强制批量升级。
- 下一步继续使用现有本机工作区，无需迁回 Documents 或额外授予目录访问权限。
