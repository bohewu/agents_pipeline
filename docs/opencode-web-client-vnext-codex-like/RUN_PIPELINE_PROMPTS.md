# RUN_PIPELINE_PROMPTS — vNext Tranche Prompts

> **Scope lock:** 這些 prompts 是給 `apps/opencode-web-client` 的實作 tranche 使用。  
> **OpenCode remains the execution backend**。不要把 scope 擴成重做 agent core / provider stack / tool runtime。

## 1. 使用方式

這份文件的目的，是把 vNext roadmap 拆成幾個可以實際執行的 `/run-pipeline` prompts。

原則：

1. **不要一次做完整個 roadmap**。
2. **一個 tranche 一個 prompt**。
3. 每一包都必須有明確 out-of-scope。
4. 每一包都必須自己做完驗證。
5. **凡是碰到 app shell / store / thread / panel / hydration / reconnect UX 的 tranche，除了 npm 驗證外，都必須真的把 app 跑起來，並至少用 `playwright-cli` skill 或 Chrome DevTools MCP 做一次 browser validation。**

補充：

- 這裡說的 browser validation，是開發驗證要求，不是要提早實作 productized browser evidence。
- 也就是說，Phase A/B/C/D 雖然仍然不做 browser screenshot automation feature，本地開發驗證還是要真的打開 app 看它有沒有炸。

## 1.1 Browser validation baseline

如果 tranche 會改到前端主要使用路徑，prompt 應明確要求至少做這些：

1. 啟動 `apps/opencode-web-client` 本地 app。
2. 用 `playwright-cli` skill 或 Chrome DevTools MCP 打開真實頁面，而不是只看測試輸出。
3. 確認沒有出現 app-level render fallback，例如 `Render Error` 或 React minified runtime exception。
4. 確認這一包新增的主要 UI surface 至少能 render 並可進入。
5. 檢查 browser console 沒有 uncaught error。

原因：

- `npm run lint`
- `npm run typecheck`
- `npm run test -- --coverage`
- `npm run build`

都可能通過，但 React / Zustand 這類 runtime render loop 仍然會在真瀏覽器才暴露。

## 1.2 SoT alignment baseline

所有 tranche prompt 在真正動手前，都應先讀這些 SoT 文件：

1. `docs/opencode-web-client-vnext-codex-like/MILESTONES.md`
2. `docs/opencode-web-client-vnext-codex-like/SPEC.md`
3. `docs/opencode-web-client-vnext-codex-like/SDD.md`
4. `docs/opencode-web-client-vnext-codex-like/TASK_BREAKDOWN.md`

規則：

1. **SoT 優先於 prompt 的局部措辭**。
2. 如果 prompt 與 SoT 存在語意差異，除非該 tranche 明確要求更新 docs，否則以 SoT 為準。
3. 如果 tranche 處理的是 SoT 尚未納入的使用者 UX delta，必須明講是 **explicit exception**，不可默默把它併入 roadmap scope。

## 2. 建議執行順序

1. Tranche 1: shared primitives + verify minimum
2. Tranche 2: local git ship minimum
3. Tranche 3: async task ledger minimum

完成這三包後，再考慮：

4. GitHub-backed ship
5. context / extension surface
6. browser evidence
7. parallel execution surface (split into Tranche 7-9)

## 3. Tranche 1 Prompt

```text
/run-pipeline Implement Phase A and Phase B from docs/opencode-web-client-vnext-codex-like/TASK_BREAKDOWN.md for apps/opencode-web-client.

Hard constraints:
- OpenCode remains the execution backend.
- Reuse the existing app shell, store, event reducer, local BFF, and workspace-scoped architecture.
- Do not introduce a second general-purpose agent runtime.
- Do not implement browser screenshot automation, GitHub checks/review flows, or parallel lanes in this tranche.

Scope:
- Add minimal TaskEntry, ResultAnnotation, and CapabilityProbe foundations.
- Implement Verify Cockpit minimum for test/build/lint.
- Add verification badges and a result-level retry / accept / recover path.
- Keep everything workspace-scoped and session-safe.

Verification required:
- npm run lint
- npm run typecheck
- npm run test -- --coverage
- npm run build

Browser validation required:
- Start the local app for `apps/opencode-web-client`.
- Use `playwright-cli` skill or Chrome DevTools MCP to open the real app.
- Confirm the app shell loads for a real workspace without the `Render Error` fallback.
- Confirm the verification side panel and result-level verification UI render without crashing the page.
- Confirm browser console has no uncaught error.
```

### 3.1 這一包做完應該得到什麼

- 每個主要 assistant result 開始有 task identity
- 使用者可以知道這次結果有沒有被驗過
- app 內可直接跑最小 verification loop
- 使用者有明確的 retry / accept / recover 路徑

### 3.2 這一包不要碰什麼

- browser console/screenshot automation
- GitHub checks / review comments / autofix
- parallel lanes
- 深的 context / MCP / extension inventory

註：

- 這一包**不要做 browser evidence product feature**，但**要做真實 browser validation**。

## 4. Tranche 2 Prompt

```text
/run-pipeline Implement Phase C from docs/opencode-web-client-vnext-codex-like/TASK_BREAKDOWN.md for apps/opencode-web-client.

Hard constraints:
- Keep OpenCode as backend execution engine.
- Keep ship actions foreground-only and synchronous in this tranche.
- Capability-gate PR creation; do not assume GitHub + gh is always available.

Scope:
- Add workspace-scoped git status surface.
- Implement commit flow.
- Implement push flow.
- Implement capability-gated PR creation with clear degraded behavior.

Verification required:
- npm run lint
- npm run typecheck
- npm run test -- --coverage
- npm run build

Browser validation required:
- Start the local app for `apps/opencode-web-client`.
- Use `playwright-cli` skill or Chrome DevTools MCP to open the real app.
- Confirm the git status / commit / push / capability-gated PR surfaces render for a real workspace without crashing the shell.
- Confirm degraded capability messaging is visible when `gh` is unavailable or unauthenticated.
- Confirm browser console has no uncaught error.
```

### 4.1 這一包做完應該得到什麼

- app 開始具備最小 `change -> verify -> ship` 完成感
- 使用者不必跳 terminal 才能做 status / commit / push
- 有能力時可直接開 PR
- 沒能力時會清楚知道缺什麼

### 4.2 這一包不要碰什麼

- background ship orchestration
- checks summary
- review comment summary
- review-driven autofix

## 5. Tranche 3 Prompt

```text
/run-pipeline Implement Phase D from docs/opencode-web-client-vnext-codex-like/TASK_BREAKDOWN.md for apps/opencode-web-client.

Hard constraints:
- Target refresh/reconnect continuity only.
- Do not promise full process-restart continuity for already running upstream work yet.

Scope:
- Add persisted task ledger.
- Restore task summaries after refresh/reconnect.
- Add active/completed/blocked task UI.
- Add cancel / retry / reopen actions.

Verification required:
- npm run lint
- npm run typecheck
- npm run test -- --coverage
- npm run build

Browser validation required:
- Start the local app for `apps/opencode-web-client`.
- Use `playwright-cli` skill or Chrome DevTools MCP to open the real app.
- Confirm task UI renders before and after a real browser refresh for the same workspace.
- Confirm active / completed / blocked task surfaces are visible without app-shell fallback.
- Confirm browser console has no uncaught error.
```

### 5.1 這一包做完應該得到什麼

- 使用者 refresh 後不會失憶
- task 不再只是 thread 裡一段短暫狀態
- blocked / failed / completed task 有清楚的回來接手路徑

### 5.2 這一包不要碰什麼

- full background worker fabric
- process restart 後完整接回正在跑的 upstream work
- remote / multi-device continuation

### 5.3 Optional Mini-Tranche Prompt — Thread Text Block Polish Exception

```text
/run-pipeline Implement a small thread-surface polish tranche for apps/opencode-web-client focused on the user-raised MessageCard text block UX delta.

Hard constraints:
- Read docs/opencode-web-client-vnext-codex-like/MILESTONES.md, SPEC.md, SDD.md, and TASK_BREAKDOWN.md first, and treat them as the source of truth.
- This tranche is an explicit exception for a newly discovered UX delta, not a silent expansion of the SoT roadmap.
- Keep OpenCode as the backend execution engine.
- Keep the change tightly bounded to the thread/message presentation layer; do not redesign verify, ship, task-ledger, or agent runtime behavior.

Scope:
- Audit `apps/opencode-web-client/src/client/components/thread/MessageCard.tsx` and related thread UI.
- Soften the chrome for plain-text text block rendering where the current panel-like treatment feels too heavy.
- Remove duplicate copy affordance for the same plain-text block when a more specific copy action already exists.
- Preserve clear copy affordance for real code blocks and preserve existing result-trace / verification actions.

Out of scope:
- Broad thread redesign.
- assistant-ui shell rewrite.
- Verification, ship, or task-ledger feature work.
- Markdown renderer replacement.
- Browser evidence productization.

Verification required:
- npm run lint
- npm run typecheck
- npm run test -- --coverage
- npm run build

Browser validation required:
- Start the local app for `apps/opencode-web-client`.
- Use `playwright-cli` skill or Chrome DevTools MCP to open the real app.
- Confirm normal assistant text messages render without app-shell fallback.
- Confirm plain-text block presentation is lighter and no longer feels like duplicated heavy panel chrome.
- Confirm there is no duplicate copy affordance for the same plain-text block while code blocks still have a clear copy path.
- Confirm browser console has no uncaught error.
```

### 5.4 這一包做完應該得到什麼

- thread 的 plain-text block 不再有過重的 panel-like chrome
- 同一塊 plain text 不會同時出現重複 copy affordance
- 這是一個 bounded polish tranche，不會污染 Tranche 4+ roadmap scope

### 5.5 這一包不要碰什麼

- broader thread / shell redesign
- verify / ship / tasks feature scope
- markdown renderer replacement
- SoT roadmap 重定義

## 6. Tranche 4 Prompt

```text
/run-pipeline Implement Phase E from docs/opencode-web-client-vnext-codex-like/TASK_BREAKDOWN.md for apps/opencode-web-client.

Hard constraints:
- Read docs/opencode-web-client-vnext-codex-like/MILESTONES.md, SPEC.md, SDD.md, and TASK_BREAKDOWN.md first, and treat them as the source of truth.
- Keep OpenCode as the backend execution engine.
- Extend the existing ShipPanel, workspace ship service, task ledger, and result-annotation model; do not redesign agent-core, provider/runtime ownership, or the main app shell.
- Capability-gate all GitHub-backed behavior. Do not assume GitHub remotes, gh installation, or gh auth.
- Keep the existing local status / commit / push / PR path working.

Scope:
- Add PR-linked checks summary.
- Add PR review comments / requested-changes summary.
- Add a fix handoff path from failing checks and review conditions into the existing workspace/session chat loop.
- Project ship/review state back into task/result surfaces where that closes the current Tranche 3 gap.
- Preserve clear degraded behavior and remediation when GitHub-backed capability is unavailable.

Out of scope:
- GitHub project management.
- Issue tracker features.
- Rebase UI.
- Browser evidence productization.
- Parallel lanes.

Verification required:
- npm run lint
- npm run typecheck
- npm run test -- --coverage
- npm run build

Browser validation required:
- Start the local app for `apps/opencode-web-client`.
- Use `playwright-cli` skill or Chrome DevTools MCP to open the real app.
- Confirm the existing ship surface still renders for a GitHub-backed workspace without shell fallback.
- Confirm checks/review summaries render in both happy and degraded states.
- Confirm a fix handoff can be launched from a failing check or review condition.
- Confirm browser console has no uncaught error.
```

### 6.1 這一包做完應該得到什麼

- PR 不再只是建立完 URL 就結束，而是能回來看 check / review 狀態
- ship surface 開始具備 review-driven follow-up loop
- task / result surface 與 ship 後續狀態的關聯更完整

### 6.2 這一包不要碰什麼

- GitHub project / issue 管理
- advanced rebase / branch surgery UI
- browser evidence feature
- parallel execution lanes

## 7. Tranche 5 Prompt

```text
/run-pipeline Implement Phase F from docs/opencode-web-client-vnext-codex-like/TASK_BREAKDOWN.md for apps/opencode-web-client.

Hard constraints:
- Read docs/opencode-web-client-vnext-codex-like/MILESTONES.md, SPEC.md, SDD.md, and TASK_BREAKDOWN.md first, and treat them as the source of truth.
- Keep OpenCode as the backend execution engine.
- Reuse the existing local BFF, right-drawer-first shell, workspace-scoped store, and capability model.
- Do not build a full config editor, provider credential wizard, or MCP admin console.
- Prefer one bounded surface over a large IA redesign.

Scope:
- Add a context/catalog service and UI surface for workspace instruction and capability visibility.
- Surface major instruction sources such as AGENTS.md, .opencode, and relevant project-local instruction files.
- Surface installed capabilities such as plugins, commands, tools, usage/effort assets, and cheap-to-expose skills/MCP-facing assets.
- Label each surfaced capability by source layer: project-local, user-global, or app-bundled.
- Add clear remediation copy for missing or degraded capability.

Out of scope:
- Full config editing.
- Provider auth flows.
- Marketplace-style extension management.
- Browser evidence runtime.
- Parallel execution lanes.

Verification required:
- npm run lint
- npm run typecheck
- npm run test -- --coverage
- npm run build

Browser validation required:
- Start the local app for `apps/opencode-web-client`.
- Use `playwright-cli` skill or Chrome DevTools MCP to open the real app.
- Confirm the new context/inventory surface renders and is reachable from the existing shell without fallback.
- Confirm source-layer labeling is visible and understandable for real capability entries.
- Confirm missing/degraded capability remediation is visible in the UI.
- Confirm browser console has no uncaught error.
```

### 7.1 這一包做完應該得到什麼

- advanced user 能看見目前 workspace 背後的 instruction / capability 來源
- capability missing 時，不再只看到 generic unavailable state
- 產品黑箱感下降，SoT 的 context surface 開始成立

### 7.2 這一包不要碰什麼

- full config editor
- provider credential management wizard
- MCP admin console
- browser evidence
- parallel lanes

## 8. Tranche 6 Prompt

```text
/run-pipeline Implement Phase G from docs/opencode-web-client-vnext-codex-like/TASK_BREAKDOWN.md for apps/opencode-web-client.

Hard constraints:
- Read docs/opencode-web-client-vnext-codex-like/MILESTONES.md, SPEC.md, SDD.md, and TASK_BREAKDOWN.md first, and treat them as the source of truth.
- Keep OpenCode as the backend execution engine.
- Introduce a dedicated preview/browser evidence boundary; do not turn the BFF into a generic browser automation platform.
- Keep command-based verification usable when preview/browser evidence is unavailable.
- Capability-gate all preview/browser evidence behavior.
- Do not broaden into multi-browser matrix support.

Scope:
- Add a preview/browser runtime boundary.
- Add preview target registration or preview URL handling.
- Add browser evidence artifacts for console capture and screenshots.
- Persist browser evidence metadata and project it into verification results.
- Keep existing lint/build/test verification intact and clearly separated from browser evidence.

Out of scope:
- Arbitrary browser automation DSL.
- Full CI pipeline editor.
- Multi-browser support.
- Parallel lanes.

Verification required:
- npm run lint
- npm run typecheck
- npm run test -- --coverage
- npm run build

Browser validation required:
- Start the local app for `apps/opencode-web-client`.
- Use `playwright-cli` skill or Chrome DevTools MCP to open the real app.
- Validate one real preview-capable workspace path if available, or a bounded local preview fixture if needed.
- Confirm command-only verification still works when preview/browser evidence is unavailable.
- Confirm browser evidence artifacts render from the verification surface when capability is available.
- Confirm browser console has no uncaught error.
```

### 8.1 這一包做完應該得到什麼

- verify cockpit 開始不只看 terminal evidence，也能看 browser-facing evidence
- preview/browser evidence 明確 capability-gated，而不是假裝永遠可用
- M1b 與 M1a 的界線仍然清楚，不會把 verify 擴成另一個 preview product

### 8.2 這一包不要碰什麼

- arbitrary browser automation DSL
- CI pipeline editor
- multi-browser matrix
- parallel lanes

## 9. Tranche 7 Prompt

```text
/run-pipeline Implement the first Phase H slice from docs/opencode-web-client-vnext-codex-like/TASK_BREAKDOWN.md for apps/opencode-web-client.

Hard constraints:
- Read docs/opencode-web-client-vnext-codex-like/MILESTONES.md, SPEC.md, SDD.md, and TASK_BREAKDOWN.md first, and treat them as the source of truth.
- Keep OpenCode as the backend execution engine.
- Do not redesign the planner/router/reviewer pipeline or build a new autonomous swarm runtime.
- Use explicit isolated execution context for each lane, tied to branch or worktree semantics.
- Keep the first slice intentionally small and finishable.

Scope:
- Add a minimal parallel lane UI model for at least two isolated attempts in one workspace.
- Bind each lane to an explicit isolated branch or worktree context.
- Keep lane state attributable to workspace and session context.
- Allow the UI to identify lanes as alternative attempts without yet adding final compare-and-apply behavior.

Out of scope:
- Final compare-and-apply or adopt flow.
- Per-lane verification and ship readiness projection.
- Agent-core redesign.
- Cloud execution fabric.
- Multi-user collaboration.
- Fancy swarm visualization unless upstream metadata is already cheap to surface.

Verification required:
- npm run lint
- npm run typecheck
- npm run test -- --coverage
- npm run build

Browser validation required:
- Start the local app for `apps/opencode-web-client`.
- Use `playwright-cli` skill or Chrome DevTools MCP to open the real app.
- Confirm at least two isolated lanes can be created or rendered without shell fallback.
- Confirm each lane clearly shows its isolated branch/worktree attribution.
- Confirm browser console has no uncaught error.
```

### 9.1 這一包做完應該得到什麼

- 使用者可以同時看 2 條以上 isolation-first 的 task attempt
- lane 不再只是隱含概念，而是明確綁定 branch/worktree context
- M5 開始有清楚 substrate，但還沒把 compare/apply 一次塞進來

### 9.2 這一包不要碰什麼

- final selection / adopt flow
- lane-level verification / ship readiness projection
- re-implement OpenCode orchestration runtime
- cloud agent fabric
- multi-user collaborative session model
- 無邊界的 swarm orchestration UI

## 10. Tranche 8 Prompt

```text
/run-pipeline Implement the second Phase H slice from docs/opencode-web-client-vnext-codex-like/TASK_BREAKDOWN.md for apps/opencode-web-client.

Hard constraints:
- Read docs/opencode-web-client-vnext-codex-like/MILESTONES.md, SPEC.md, SDD.md, and TASK_BREAKDOWN.md first, and treat them as the source of truth.
- Keep OpenCode as the backend execution engine.
- Build on the existing lane model rather than replacing it.
- Keep this slice read-oriented: comparison and readiness visibility first, no destructive adopt/apply yet.
- Keep lane state attributable to workspace and session context.

Scope:
- Add a lane comparison surface for alternative attempts.
- Surface per-lane verification summary and ship readiness.
- Make alternative-lane status understandable without collapsing back into a single global thread mental model.
- Preserve the explicit isolated branch/worktree attribution established in Tranche 7.

Out of scope:
- Final compare-and-apply or adopt flow.
- Agent-core redesign.
- Cloud execution fabric.
- Multi-user collaboration.
- Fancy swarm visualization unless upstream metadata is already cheap to surface.

Verification required:
- npm run lint
- npm run typecheck
- npm run test -- --coverage
- npm run build

Browser validation required:
- Start the local app for `apps/opencode-web-client`.
- Use `playwright-cli` skill or Chrome DevTools MCP to open the real app.
- Confirm at least two isolated lanes render without shell fallback.
- Confirm the lane comparison surface renders understandable alternative attempts.
- Confirm per-lane verification and ship readiness is visible.
- Confirm browser console has no uncaught error.
```

### 10.1 這一包做完應該得到什麼

- 使用者不只看到多 lane，還能看懂 lane 之間差在哪裡
- 每條 lane 開始有 verification / ship readiness 的產品意義
- compare 是真的 compare，不只是把兩個結果平行擺著

### 10.2 這一包不要碰什麼

- final selection / adopt flow
- re-implement OpenCode orchestration runtime
- cloud agent fabric
- multi-user collaborative session model
- 無邊界的 swarm orchestration UI

## 11. Tranche 9 Prompt

```text
/run-pipeline Implement the third Phase H slice from docs/opencode-web-client-vnext-codex-like/TASK_BREAKDOWN.md for apps/opencode-web-client.

Hard constraints:
- Read docs/opencode-web-client-vnext-codex-like/MILESTONES.md, SPEC.md, SDD.md, and TASK_BREAKDOWN.md first, and treat them as the source of truth.
- Keep OpenCode as the backend execution engine.
- Build on the existing lane model and readiness surface rather than replacing them.
- Keep compare-and-apply intentionally bounded to explicit user selection and adoption of one lane outcome.
- Do not redesign the planner/router/reviewer pipeline or build a new autonomous swarm runtime.

Scope:
- Add final selection / adopt flow for alternative lane outcomes.
- Surface clear selected-lane state and the post-selection outcome.
- Keep per-lane verification and ship readiness visible during adoption.
- Add the smallest necessary cleanup/finalization UX so the user understands which lane was adopted and which were not.

Out of scope:
- Agent-core redesign.
- Cloud execution fabric.
- Multi-user collaboration.
- Fancy swarm visualization unless upstream metadata is already cheap to surface.
- Unbounded lane orchestration or autonomous swarm UI.

Verification required:
- npm run lint
- npm run typecheck
- npm run test -- --coverage
- npm run build

Browser validation required:
- Start the local app for `apps/opencode-web-client`.
- Use `playwright-cli` skill or Chrome DevTools MCP to open the real app.
- Confirm at least two isolated lanes can be rendered without shell fallback.
- Confirm lane comparison and final selection/adopt flow render end-to-end.
- Confirm the selected/adopted lane is clearly identifiable after the action.
- Confirm per-lane verification/ship readiness remains visible through the flow.
- Confirm browser console has no uncaught error.
```

### 11.1 這一包做完應該得到什麼

- 結果不只平行存在，還能真的 compare-and-apply
- 使用者可以明確採用其中一條 lane outcome
- SoT 定義的 codex-like 高階 parallel 感，才在這一包真正成立

### 11.2 這一包不要碰什麼

- re-implement OpenCode orchestration runtime
- cloud agent fabric
- multi-user collaborative session model
- 無邊界的 swarm orchestration UI

## 12. Tranche 3 之後怎麼排

建議順序：

1. Optional mini-tranche: thread text block polish exception
2. GitHub-backed ship
3. context / extension surface
4. browser evidence
5. parallel lane foundation
6. lane comparison + readiness surface
7. lane compare-and-apply

補充：

- optional mini-tranche 也應維持 bounded exception，不要趁機混入 Tranche 4-9 feature scope
- M5 明確拆成 Tranche 7-9 三包，不要再把它們合回單一大包
- 這六包仍然要維持一包一個 prompt，不要把 Tranche 4-9 合併成單一大包
- 若 scope 壓力變大，優先保住 M2b 與 M4 的 finishable slice，再考慮壓縮 M1b / M5 深度

## 13. 一句話策略

先把產品補到：

- **會驗**
- **會送**
- **會記住**

再去做高級加分項，而不是一開始就把 scope 膨脹成一整套「什麼都想做」的 agent product rewrite。
