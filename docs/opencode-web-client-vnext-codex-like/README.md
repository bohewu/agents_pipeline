# OpenCode Web Client vNext Codex-like Bundle

> **Scope lock:** 本 bundle 規劃的是 `apps/opencode-web-client` 的下一階段產品與技術方向。  
> **OpenCode remains the execution backend**。本 bundle 不允許把任務轉向「重做 agent core / provider stack / tool runtime」。

## 1. 目的

這組文件用來定義 `apps/opencode-web-client` 下一階段如何從「可用 local coding shell」補到更完整的 codex-like product surface。

核心目的不是 marketing/onboarding，而是補齊真正影響完整度感的三個 loop：

1. `verify`
2. `ship`
3. `async`

## 2. Bundle Contents

1. `README.md`  
   本檔。定義 bundle 的 scope 與文件優先序。

2. `MILESTONES.md`  
   產品 milestone 與優先順序，從 Foundation 到 Verify / Ship / Async / Context / Parallel。

3. `SPEC.md`  
   vNext 的產品規格與功能需求，明確區分 must / should / must not。

4. `SDD.md`  
   系統設計文件，定義 web client、local BFF、OpenCode boundary、state ownership、module model 與 phase guidance。

5. `TASK_BREAKDOWN.md`  
   實作順序與切片，將 roadmap/spec/design 轉成可執行的 phase/task list。

## 3. 文件優先序

若文件之間出現衝突，請依以下順序解讀：

1. `README.md`
2. `TASK_BREAKDOWN.md`
3. `SDD.md`
4. `SPEC.md`
5. `MILESTONES.md`

原因：

- `README.md` 鎖定 bundle scope
- `TASK_BREAKDOWN.md` 鎖定近期實作切片
- `SDD.md` 鎖定技術與 ownership boundary
- `SPEC.md` 鎖定產品需求
- `MILESTONES.md` 鎖定長期順序與 product framing

## 4. Already Locked Decisions

### 4.1 Backend ownership

以下持續屬於 OpenCode：

- ask / command / shell execution
- agent / model / provider semantics
- tool runtime
- upstream message/session lifecycle
- reasoning / effort semantics

### 4.2 Web client ownership

以下屬於 web client / local BFF：

- app shell and navigation surfaces
- workspace-scoped state and evidence surfaces
- verification orchestration surface
- git/PR surface
- task persistence and resume surface
- local security and runtime boundaries

### 4.3 First tranche definition

第一個真正應該落地的「變完整」tranche 是：

1. minimal task identity
2. verify minimum
3. minimal local ship
4. basic refresh/reconnect continuity

如果少了其中一塊，產品仍然比較像強化版 coding shell，而不是完整 codex-like tool。

## 5. 明確排除

本 bundle 明確不包含：

- 重做 OpenCode backend
- provider auth / credential UX 重設計
- cloud multi-tenant service
- full MCP admin console
- general-purpose issue tracker
- marketing-first onboarding 導向的重設計

## 6. 適合怎麼用這組文件

### 如果要開始實作

順序：

1. 先讀 `README.md`
2. 再讀 `TASK_BREAKDOWN.md`
3. 實作時以 `SDD.md` 為主要技術邊界依據
4. 需求不清時回查 `SPEC.md`
5. milestone framing 與 deferred items 看 `MILESTONES.md`

### 如果要 review 方向

建議先檢查三件事：

1. 是否還維持 OpenCode backend ownership
2. 是否還把 verify / ship / async 當最優先閉環
3. 是否避免過早膨脹到 browser runtime / cloud fabric / full parallel orchestration

## 7. 目前 bundle 狀態

這份 bundle 已經過一輪 subagent review，已收斂以下高價值風險：

- sequencing mismatch
- task identity 太晚出現
- verification ownership 不清
- async continuity 承諾過頭

目前可視為：

- 足夠當下一輪 implementation handoff
- 但仍保留正常工程調整空間，不是凍結 RFC
