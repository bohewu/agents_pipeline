# SPEC — OpenCode Web Client vNext Codex-like Product Spec

> **Scope lock:** 本 spec 假設 `apps/opencode-web-client` 持續是 **OpenCode 之上的 local web client**。  
> 本 spec 不規劃重新實作 agent backend、provider auth、tool runtime 或 OpenCode core protocol。

## 1. 產品定義

vNext 的產品定義是：

- 一個 **desktop-first, chat-first, codex-like local web client**
- 以 **OpenCode** 當 execution backend
- 透過 **local BFF** 封裝 workspace、sessions、events、verification、git/PR 與安全邊界
- 讓使用者能在 browser 中完成更完整的 coding loop，而不只是聊天改檔

簡單說：

這不是要做另一套 agent 系統，而是要把現有 web client 補成「值得長時間使用」的完整 product surface。

## 2. 已鎖定前提

### 2.1 Backend ownership

以下能力繼續屬於 OpenCode：

- ask / command / shell execution
- agent / model / provider selection semantics
- tool execution
- reasoning / effort semantics
- upstream session / message lifecycle

### 2.2 Web client ownership

以下能力屬於 web client / local BFF：

- workspace and app shell
- UI state and evidence surfaces
- verification orchestration surface
- git/PR surface
- task persistence and resume surface
- local security / path / process boundaries

### 2.3 Hard non-goals

- 重做 OpenCode runtime
- 自建 provider routing layer
- 自建 cloud agent fabric
- full MCP admin console
- full OpenCode config editor
- general-purpose issue tracker
- multi-tenant SaaS architecture

## 3. 目標使用者

### Primary user

- 已經會用 terminal / git / PR workflow 的開發者
- 願意在 local repo 上用 agent 工具，但對完整度要求高
- 會拿 Codex / Claude Code / Cursor / Copilot / Aider 當比較基準

### Secondary user

- 已有 OpenCode setup，希望有更好的 web surface
- 需要比 TUI 更好的 diff / verification / usage / permission / shipping 體驗

## 4. 使用者真正要完成的事

1. 在任意 repo 開始一個 coding task
2. 看懂 agent 正在做什麼
3. 驗證改動是否成立
4. 決定是否接受結果
5. 送出 commit / PR
6. 中途切換 workspace 或稍後回來仍可續作

## 5. 成功標準

### Product success

1. 使用者能在 app 內完成 `change -> verify -> ship` 主路徑。
2. 使用者能在 refresh / reopen 後恢復 task 與 session context。
3. 使用者不需要把 terminal/GitHub 當主 UI 才能完成核心流程。

### UX success

使用者能快速回答這三個問題：

1. 我現在在哪個 workspace / session？
2. 這個 agent 結果有沒有被驗過？
3. 這個改動現在能不能送出？

### DX success

- `lint`, `typecheck`, `test`, `test --coverage`, `build` 可作為本地 gate
- 至少有針對 state/security 關鍵路徑的自動化測試

## 5.1 Current-app constraints to respect

1. 現況是 workspace-scoped SSE 與 session-scoped running state，不是完整 background job fabric。
2. 現況已有 inactive-workspace auto-sleep，因此任何 async/task 規劃都不能假設 workspace runtime 會永遠被持續觀察。
3. vNext 第一波 verify 必須盡量沿用現有 OpenCode-centered execution path，而不是立刻引入第二套任意 command executor。

## 6. 產品原則

1. **Chat-first, not chat-only**
2. **Evidence before trust**
3. **Workspace-scoped state only**
4. **Progressive disclosure for advanced controls**
5. **OpenCode stays the engine; web client stays the cockpit**

6. **Review / accept / recover must be explicit**

## 7. Cross-cutting Requirements

These primitives are required early, not after the main milestones ship.

### 7.1 Minimal task identity

Each user-visible result that can be verified, resumed, retried, or shipped must be traceable via:

- `taskId`
- `workspaceId`
- `sessionId`
- `sourceMessageId`

### 7.2 Result annotations

Each major assistant result should be able to project:

- verification status
- review-needed / approval-needed state
- ship readiness

### 7.3 Capability probe

The app must detect and surface whether the current workspace/runtime supports:

- local git ship actions
- `gh`-based PR actions
- preview target registration
- browser evidence collection

## 8. Functional Requirements

## 8.1 Verify Cockpit

### Must

1. 顯示 workspace-scoped 最近驗證結果
2. 支援 `test`, `build`, `lint`
3. 支援至少一種 preview target registration or preview URL evidence
4. 對 assistant result 顯示 `verified` / `partially verified` / `unverified`
5. 可從 result surface 重新執行驗證
6. 可從 result surface 明確做 review / accept / recover / retry

Execution note:

- M1 minimum 應優先走既有 OpenCode-centered execution path。
- Verification orchestration 可以由 BFF 負責編排、記錄與呈現，但不應在第一個 slice 就變成第二套通用 command runtime。

### Should

1. 顯示 console errors / warnings
2. 支援 screenshot evidence
3. 顯示驗證是由哪個 task / session 觸發

### Must not

1. 把 generic raw terminal dump 當成唯一驗證 UI
2. 用全域狀態標記所有 session 都在驗證或 running
3. 在 browser evidence 尚不可用時假裝 preview/browser-check 已 supported

## 8.2 Git-native Ship Loop

### Must

1. 顯示 branch / dirty state / ahead-behind
2. 顯示 staged / unstaged / untracked summary
3. 提供 commit flow
4. 提供 push flow
5. 在 capability 可用時提供 create PR flow

Scope note:

- M2 最小版本限定為 foreground local ship。
- advanced checks/review/comment tracking 與較長生命週期的 ship task，延後到 M3/M2b 之後。

### Should

1. 顯示 checks summary
2. 顯示 PR review comments summary
3. 可從 review/check issue 直接發起 fix action

### Must not

1. 自動 force push
2. 隱藏 git failures 或 hook failures
3. 假設所有 repo 都是 GitHub + `gh` 可用

## 8.3 Async Task Control

### Must

1. 保留 task ledger：queued / running / blocked / completed / failed
2. refresh / reconnect 後可恢復 ledger
3. 支援 cancel / retry / reopen
4. 每個 task 必須明確綁定 workspace 與 session

### Should

1. 顯示 task 最新證據與結果摘要
2. 顯示 approval needed / verification failed / checks failed 這類狀態
3. 區分 browser refresh continuity 與 full app restart continuity

### Must not

1. 只靠目前 thread view 暗示背景任務存在
2. 把不同 workspace 的 task 混在同一個 ambiguous running state

## 8.4 Context and Extension Surface

### Must

1. 顯示目前 workspace 的主要 instruction sources
2. 顯示主要 installed capabilities：plugins / commands / skills / usage / effort assets
3. 清楚標示 capability 來自：
   - project local
   - user global
   - app bundled

### Should

1. 顯示 MCP / extension inventory
2. 顯示 capability missing / degraded 的 remediation

### Must not

1. 假裝 capability 可用但實際缺 asset
2. 把 config/debug 資訊埋到只有 diagnostics 才看得到

## 8.5 Parallel Execution Surface

### Must for this phase family

1. 支援多 task lane 的 UI model
2. lane 必須可綁定 isolated branch 或 worktree context
3. lane 結果可比較與採用

### Should

1. 能標示哪些 lane 是 alternative attempts
2. 能顯示 lane-level verification and ship readiness

### Must not

1. 以單一 global thread 取代 parallel task mental model

## 9. UX Requirements

## 9.1 Main shell

- thread 仍是 primary surface
- verify / ship / tasks 必須可快速進入
- 右側 drawer 可以保留，但不能只裝 inspection-only panel

## 9.2 Result surfaces

assistant result 至少要能附帶：

- changed files summary
- verification summary
- review / approval summary
- ship readiness summary
- link to detailed evidence

## 9.3 Task surfaces

使用者應能在 1-2 次點擊內從主 thread 進到：

- task status
- verification evidence
- review / accept / recover actions
- git/PR state

## 10. Data and State Requirements

1. streaming state 必須 session-scoped
2. verification state 必須 workspace-scoped，且可追溯到 task/session
3. ship state 必須 workspace-scoped，且與 git remote/branch 綁定
4. task state 必須 persisted，不可只在 memory 中存在
5. secrets 不可落到 browser local storage
6. capability detection state 必須可查詢，不可只隱含在按鈕 disable 狀態

## 11. Security and Trust Requirements

1. Browser 不可直連 upstream OpenCode server
2. Workspace/file access 必須維持 path boundary
3. symlink escape 必須被阻止
4. git / shell / verification 的危險操作要明確顯示證據與失敗狀態
5. PR / push / commit 等 destructive-enough action 必須顯式觸發

## 12. Release Priorities

### Release A

- Verify Cockpit minimum
- minimal task identity
- capability probe
- verification badges on results
- review / accept / recover actions

### Release B

- Git-native Ship Loop minimum
- local git ship path

### Release C

- Async Task Control minimum
- persisted task ledger

### Release D

- GitHub-backed ship path
- checks / review summaries
- Context and Extension Surface

### Release E

- Parallel Execution Surface

## 13. Out-of-scope Until After Release C

- first-run marketing polish
- broad onboarding redesign
- mobile-first layout work
- full remote multi-device continuation
- advanced MCP management

Browser screenshot-rich verification and advanced GitHub autofix are also lower priority than Releases A-C unless they are unusually cheap.

Reason: 在 codex-like 賽道，使用者先看的是功能閉環是否完整，而不是 entry polish。
