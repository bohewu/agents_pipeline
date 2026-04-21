# MILESTONES — OpenCode Web Client vNext Codex-like Roadmap

> **Scope lock:** 本 roadmap 假設 **OpenCode 持續作為 execution backend**。  
> 本文件只規劃 web client、local BFF、workspace-side integration 與 product loop；**不重做 agent core、model/provider stack、tool runtime**。

## 1. 目的

目前 `apps/opencode-web-client` 已經具備可用的 local coding shell：

- multi-workspace
- session/thread/composer
- ask / command / shell
- diff / files / usage / permissions / diagnostics
- effort / reasoning activity

下一階段的目標不是再把 chat UI 做得更花，而是把它補成一個讓挑剔開發者覺得「功能完整、不是 demo」的 codex-like product surface。

## 2. 北極星

vNext 的北極星是把目前的 chat-first shell 補成三個完整閉環：

1. **Verify loop**
   從「改完」到「證明它真的 work」不必跳出 app。
2. **Ship loop**
   從「變更已完成」到「commit / push / PR / checks / review」不必主要依賴外部工具。
3. **Async loop**
   長任務、平行任務、恢復與追蹤不再像一次性 chat session。

## 3. 規劃原則

1. **Backend stays OpenCode**  
   所有 ask / command / shell / agent execution / reasoning / effort semantics 仍由 OpenCode 提供。

2. **Web client 補 surface，不補 agent runtime**  
   新功能優先是 orchestration, visibility, evidence, and shipping surfaces。

3. **Desktop-first, chat-first, but not chat-only**  
   thread 仍是核心，但 verify / ship / async 需要成為一等公民，不只是 side notes。

4. **Workspace-scoped state > global state**  
   streaming、verification、git status、background tasks 都必須嚴格綁定 workspace / session。

5. **Evidence over optimism**  
   對使用者宣稱「已完成」之前，必須有 test output、build output、browser evidence、git/check evidence 其中之一。

6. **Review / accept / recover 必須有明路徑**  
   codex-like 工具不只要會產出結果，還要讓使用者容易判斷「接受、重跑、修正、放棄」下一步。

## 4. Cross-cutting Foundations

這幾個基礎能力必須在第一個可用 slice 就出現，不可等到後面才補：

1. **Minimal TaskEntry / JobRecord**
   - `taskId`
   - `workspaceId`
   - `sessionId`
   - `sourceMessageId`
   - `status`
   - `artifact refs`

2. **ResultAnnotation**
   - verification status
   - review-needed / approval-needed
   - ship readiness

3. **CapabilityProbe**
   - local git available
   - `gh` available / authenticated
   - preview target available
   - browser evidence available or not
   - missing capability remediation copy

## 5. Milestone Overview

| Milestone | 名稱 | 核心問題 | 完成後使用者感受 |
|---|---|---|---|
| M0 | Foundation Hardening | 基礎 correctness / security / tooling 不夠穩 | 可以安心繼續堆功能 |
| M1 | Verify Cockpit | 改了但不好證明 work | 變更與驗證形成閉環 |
| M2 | Git-native Ship Loop | 做完還得跳 terminal / GitHub | 可以在 app 內完成最小 ship 主路徑 |
| M3 | Async Task Control | 長任務像一次性 chat | 可以背景跑、回來接手、追蹤進度 |
| M4 | Context and Extension Surface | 規則/skills/plugins/MCP 太隱形 | 這個產品越用越懂 repo 與 workflow |
| M5 | Parallel Execution Surface | 單線 agent 容易碰到上限 | 真正有 codex-like / cursor-like 的高階感 |

## 6. Milestone Details

## M0 — Foundation Hardening

### Scope

- session-scoped streaming / running ownership
- workspace path / file boundary hardening
- lint / typecheck / test / coverage / build 全部可跑
- 基本 a11y metadata 修補

### Why it exists

如果這層沒補齊，後面所有 verify / ship / async surface 都會建立在不穩的 state model 上。

### Exit criteria

- `npm run lint`
- `npm run typecheck`
- `npm run test -- --coverage`
- `npm run build`
- workspace/file boundary 對 traversal 與 symlink escape 有測試

Status: 這一層大致已經完成，可當作後續 milestone 的基線。

## M1 — Verify Cockpit

### Product goal

使用者在 app 內完成以下流程：

1. 發出 coding task
2. 看到變更摘要
3. 直接看到 test/build/dev-server/browser/console evidence
4. 能判斷這次變更是 `verified` / `partially verified` / `unverified`

### In scope

- workspace-scoped verification panel
- build / test / lint command presets and recent results
- optional preview URL registration
- per-assistant-turn verification status strip
- quick retry from the same result surface
- explicit review / accept / recover actions on verified or failed results

### Not in scope

- 任意 browser automation DSL
- 完整 CI pipeline editor
- multi-browser matrix

### Planned slices

#### M1a — Command evidence

- `test`, `build`, `lint`
- optional preview URL
- verification badge
- result review / accept / recover actions

#### M1b — Browser evidence

- browser preview runtime boundary
- console capture
- screenshots
- browser-check artifacts

M1b 只應在 M1a 穩定後再做，避免 verify cockpit 一開始就膨脹成另一套 preview automation project。

### User-visible outcomes

- 不再只是看到 diff，而是看到「證據」
- 可以快速回答：這次改動到底有沒有被驗過

### Exit criteria

- 至少支援 `test`, `build`, `lint`
- 每次 assistant result 可顯示最後一次 verification summary
- 驗證結果可區分 workspace / session / originating task
- 使用者可以明確選擇 accept, retry, reopen/recover

## M2 — Git-native Ship Loop

### Product goal

把「完成變更」補成「可以送出去 review」的閉環。

### In scope

- branch / ahead-behind / dirty-state surface
- staged / unstaged / untracked summary
- commit flow with repo-style-aware message drafting
- push / upstream tracking
- PR creation and PR URL surfacing

### Not in scope

- 完整 GitHub project management
- issue planning system
- advanced rebase UI

### Planned slices

#### M2a — Local git ship

- git status
- commit
- push
- capability-gated PR creation

M2a 明確限定為 **foreground, synchronous ship actions**。在 M3 之前，不承諾完整的 background ship ledger、跨 restart continuity 或 long-running review/check tracking。

#### M2b — GitHub-backed ship

- checks summary
- review comments summary
- check/review-driven autofix

M2b 不應早於 M3，因為 advanced ship surface 若沒有 persisted task/resume/blocked-state UX，使用者仍會覺得流程脆弱。

### User-visible outcomes

- 可以在 app 內完成從 diff 到 PR 的主路徑
- 產品完成感明顯上升，因為不再只是 coding shell

### Exit criteria

- 支援 commit / push
- 若能力可用，支援 create PR
- 缺少 `gh`、remote、auth 或非 GitHub remote 時，UI 有明確 degraded behavior 與 remediation

## M3 — Async Task Control

### Product goal

長任務不再要求使用者把整個注意力綁在單一 thread。

### In scope

- task ledger: queued / running / blocked / completed / failed
- session resume after refresh / reconnect
- background task surface with progress and latest evidence
- notifications for task completion / failure / approval needed
- explicit cancel / retry / reopen actions

### Not in scope

- remote cloud execution fabric
- mobile handoff
- multi-user collaborative sessions

### User-visible outcomes

- 更像在管理一組 coding jobs，而不是只是在 chat
- 開始具備 codex-like 的 delegation 感

### Exit criteria

- page refresh 後仍可看到 running/completed tasks
- 一個 workspace 至少可同時追蹤多個 background tasks
- approval / verification / git/PR 事件能回流到 task ledger

### Clarified durability semantics

- **M3 minimum**: browser refresh / reconnect 後可恢復 task ledger 與 recent state
- **Not promised yet**: BFF process restart 後仍完整接回正在執行中的 upstream work

## M4 — Context and Extension Surface

### Product goal

讓使用者看得見、改得動、信得過目前這個 workspace 背後的 instructions / memory / extensions。

### In scope

- project instructions / `AGENTS.md` / `.opencode` visibility
- installed plugins / commands / usage / effort assets visibility
- skills / MCP / extension inventory surface
- clear distinction between:
  - backend-provided capability
  - project-local capability
  - user-global capability

### Not in scope

- 完整 MCP admin UI
- visual plugin authoring
- provider credential management wizard

### User-visible outcomes

- 「這 app 為什麼這樣做」變得可解釋
- 高階使用者會開始覺得這不是黑箱

### Exit criteria

- 使用者可在 UI 中看到主要 instruction / plugin / skill / command sources
- 關鍵 capability 若缺失，UI 能指出缺哪一層，而不是只顯示 generic error

## M5 — Parallel Execution Surface

### Product goal

把單線 coding shell 提升成高階開發者會期待的 parallel / isolated execution surface。

### In scope

- multiple concurrent task lanes
- worktree or isolated branch lane model
- compare-and-apply for alternative solutions
- optional subagent lane visualization if upstream task metadata可得

### Not in scope

- 重做 OpenCode planner/router/reviewer pipeline
- fully autonomous swarm orchestration engine

### User-visible outcomes

- 能同時探索不同解法
- 開始出現值得 star 的高階效率感

### Exit criteria

- 同一 workspace 至少可並行追蹤 2-3 個 isolated task lanes
- 使用者能比較結果並選擇採用哪一條

## 7. 建議實作順序

1. M1 Verify Cockpit
2. M2a Local git ship
3. M3 Async Task Control
4. M2b GitHub-backed ship
5. M4 Context and Extension Surface
6. M5 Parallel Execution Surface

原因：

- `verify + ship + async` 是最直接影響產品完整度感的三個缺口。
- M2a 的 local ship 必須先到，產品才會真正有 `change -> verify -> ship` 的完成感。
- `context/extensions` 與 `parallel lanes` 是高階加分，但不是第一波 adoption 的最大阻力。

## 8. 推薦切片

### Slice A

M1 的最小版本：

- test/build/lint 結果
- minimal task identity and result annotation
- capability probe
- assistant result verification badge
- review / accept / recover actions

### Slice B

M2a 的最小版本：

- git status
- commit
- push
- PR if capability available

### Slice C

M3 的最小版本：

- persisted task ledger
- resume after refresh
- cancel / retry / reopen

### Slice D

M2b 的最小版本：

- checks summary
- review comments summary
- fix-from-check or fix-from-review handoff

## 9. 明確延後項目

以下項目在 M1-M3 完成前不建議優先：

- fancy onboarding
- marketing-style first-run polish
- browser screenshot-rich verification before command evidence is stable
- advanced GitHub review/check autofix before task durability exists
- remote multi-user tenancy
- full config editor
- deep MCP marketplace
- mobile-first UI

原因很簡單：在 codex-like 賽道，**功能完整度感** 比 entry polish 更決定挑剔開發者會不會留下。
