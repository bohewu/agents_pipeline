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

## 2. 建議執行順序

1. Tranche 1: shared primitives + verify minimum
2. Tranche 2: local git ship minimum
3. Tranche 3: async task ledger minimum

完成這三包後，再考慮：

4. GitHub-backed ship
5. context / extension surface
6. browser evidence
7. parallel execution surface

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
```

### 5.1 這一包做完應該得到什麼

- 使用者 refresh 後不會失憶
- task 不再只是 thread 裡一段短暫狀態
- blocked / failed / completed task 有清楚的回來接手路徑

### 5.2 這一包不要碰什麼

- full background worker fabric
- process restart 後完整接回正在跑的 upstream work
- remote / multi-device continuation

## 6. 三包做完後再做什麼

下一輪順序：

1. GitHub-backed ship
2. context / extension surface
3. browser evidence
4. parallel execution surface

## 7. 一句話策略

先把產品補到：

- **會驗**
- **會送**
- **會記住**

再去做高級加分項，而不是一開始就把 scope 膨脹成一整套「什麼都想做」的 agent product rewrite。
