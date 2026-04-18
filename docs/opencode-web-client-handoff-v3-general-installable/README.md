# OpenCode Web Client Handoff Package — v3 General Installable

> **Scope lock:** 本包明確排除 `status-runtime`、pipeline stage/task/run artifacts、以及任何 `agents_pipeline` runtime coupling。  
> v3 修正重點：這個 web 是 **general-purpose installable local web client**，不是只能在 `agents_pipeline` repo 裡啟動的 web app。

## 目的

這是一套可直接交給實作 Agent 的 handoff 檔案。目標是讓 Agent 不需要重新分析方向，直接按 spec / SDD / API contract 實作。

產品定位：

- **Codex-style coding web client over OpenCode**
- **獨立本機安裝的 web client**，可用 installer 安裝到使用者本機
- **以 local `opencode serve` / OpenCode SDK 當 upstream coding backend**
- **吃使用者本機既有 OpenCode config / agents / commands / plugins / credentials**
- **支援多 workspace / repo folder**
- **Browser 不直接連 `opencode serve`，必須經過本機 BFF**
- **前端使用 assistant-ui，但只作 UI runtime，不作 OpenCode protocol**
- **支援 Codex / Copilot 的 effort 與 usage-details**

## v3 關鍵修正

v2 的錯誤假設：

- 假設 web app 會留在 `agents_pipeline` repo 內執行。
- 假設 managed `opencode serve` 要注入 `OPENCODE_CONFIG_DIR=<AGENTS_PIPELINE_ROOT>/opencode`。
- 假設 effort / usage 直接從 `<AGENTS_PIPELINE_ROOT>/opencode/...` 讀取。
- workspace registry 放在 repo 內。

v3 必須改成：

1. `agents_pipeline` 只是 **source / installer / distribution repo**，不是 runtime dependency。
2. 使用者透過 installer 把 web client 與必要 OpenCode assets 安裝到本機。
3. 安裝後的 runtime 不需要知道 `agents_pipeline` clone path。
4. managed OpenCode server 預設只繼承使用者環境與本機 OpenCode config，不強制覆蓋 `OPENCODE_CONFIG_DIR`。
5. installer 以「跟其他 agent 設定相同」的方式，把需要的 OpenCode assets 安裝到本機 OpenCode config。
6. web client 的 registry / logs / cache 存在使用者本機 app config/state/cache path，不存在 source repo。
7. 使用者可選不同 repo folder 作為 workspace；每個 workspace 讓 OpenCode 自己依照正常 config precedence 載入 global + project `.opencode`。

## 交付內容

1. `README.md`  
   本檔。說明 handoff package 與文件優先序。

2. `CHANGELOG_FROM_V2.md`  
   明確列出 v2 到 v3 必改項目，避免 Agent 沿用錯誤架構。

3. `SPEC.md`  
   產品規格與功能需求。

4. `SDD.md`  
   軟體設計文件。包含 installable app 架構、local BFF、process manager、workspace、資料流。

5. `INSTALLER_MODEL.md`  
   installer 行為、install target、assets 安裝、update/uninstall/dry-run/idempotency。

6. `OPENCODE_INTEGRATION.md`  
   OpenCode config/serve/SDK/assets/effort/usage 的整合規則。

7. `WORKSPACE_MODEL.md`  
   多 workspace 模型、path validation、managed/attached server lifecycle。

8. `API_CONTRACT.md`  
   BFF API、SSE 事件、request/response shape、normalized model。

9. `WIREFRAMES.md`  
   Desktop-first ASCII wireframes，包含 onboarding、installer diagnostics、workspace selector、thread、diff、usage。

10. `TASK_BREAKDOWN.md`  
    實作順序與拆解。

11. `TEST_PLAN.md`  
    驗證案例與完成標準。

12. `AGENT_IMPLEMENTATION_PROMPT.md`  
    直接貼給實作 Agent 的主 prompt。

13. `AGENT_VERIFICATION_PROMPT.md`  
    直接貼給 reviewer / verifier Agent 的 prompt。

14. `SOURCES.md`  
    本 handoff 依據的 upstream docs / repo assets。

## 文件優先序

當文件之間有衝突時，請嚴格依以下順序處理：

1. `AGENT_IMPLEMENTATION_PROMPT.md`
2. `CHANGELOG_FROM_V2.md`
3. `INSTALLER_MODEL.md`
4. `OPENCODE_INTEGRATION.md`
5. `API_CONTRACT.md`
6. `WORKSPACE_MODEL.md`
7. `SDD.md`
8. `SPEC.md`
9. `WIREFRAMES.md`
10. `TASK_BREAKDOWN.md`
11. `TEST_PLAN.md`
12. `SOURCES.md`

## 已鎖定、不允許重設計的決策

### 1) 產品型態

- 這是 **獨立 local web client**。
- 不是 `agents_pipeline` repo 內部專用頁面。
- 不是官方 `opencode web` clone。
- 安裝後應可在任意本機 repo 使用。
- 安裝後 runtime 不依賴 source repo 路徑。

### 2) 推薦實作位置

在 source repo 中新增一個自包含 package：

```text
apps/opencode-web-client/
```

該 package build 後產物可被 installer 安裝到本機。若 repo 既有慣例使用 `packages/`，可改用：

```text
packages/opencode-web-client/
```

但 package 必須保持自包含，不可從 repo root runtime import 檔案。

### 3) Runtime 技術

- React + TypeScript + Vite
- `@assistant-ui/react`
- Node.js local server
- Hono 或 Fastify 作 local BFF。本文預設 Hono。
- `@opencode-ai/sdk`
- Zustand / TanStack Query 皆可；若無特殊需求，採 Zustand。
- 不使用 Next.js Route Handlers 作主架構，因為目標是本機安裝型 CLI web app。

### 4) CLI entrypoint

installer 安裝後必須提供可執行命令，例如：

```bash
opencode-codex-web
```

可接受 aliases，但 primary command 必須固定在文件與測試中，例如：

```bash
opencode-codex-web --host 127.0.0.1 --port 45123 --open
```

### 5) OpenCode upstream

- 預設 managed mode：web client 依 workspace root 啟動 `opencode serve`。
- attached mode：可連到使用者已啟動的 `opencode serve`。
- Browser 不可直接打 upstream OpenCode server。
- BFF side 才可透過 SDK / HTTP 操作 upstream。
- managed mode 不得強制 `OPENCODE_CONFIG_DIR=<source repo>/opencode`。
- 只有使用者明確設定 `OPENCODE_WEB_OPENCODE_CONFIG_DIR` 或 app settings 時，才可覆寫 upstream env。

### 6) Installer 與 OpenCode assets

installer 必須安裝兩類東西：

1. Web client runtime / CLI / static assets。
2. OpenCode assets：至少 effort plugin、usage command、usage tool。

OpenCode assets 應安裝到使用者本機 OpenCode config：

```text
~/.config/opencode/
  plugins/
  commands/
```

或使用者指定的 config dir。不要要求 runtime 從 `agents_pipeline/opencode` 讀取。

### 7) effort

- Web client 必須支援 project/workspace default effort 與 session override。
- UI level：`medium | high | max`。
- internal level：`medium | high | xhigh`，其中 UI `max` 映射到 `xhigh`。
- 實際套用 reasoning effort 仍由 OpenCode plugin hook 負責。
- web/BFF 只寫入 selected workspace 的 `.opencode/effort-control.sessions.json` 並讀 trace。
- plugin 必須由 installer 安裝到本機 OpenCode config 或 project `.opencode/plugins`。

### 8) usage-details

- 不能 parse `/usage` 的文字輸出。
- web client 必須包含 / 安裝 `provider-usage.py`，並由 BFF 執行 JSON 模式。
- runtime path 必須來自 installed asset path，不可來自 source repo root。
- 必須支援 Codex 與 Copilot。
- Copilot report file 可由 UI 上傳或填 local path，BFF side 讀取。

### 9) 明確排除

- `status-runtime`
- pipeline stages / task artifacts / canonical run timeline
- full provider OAuth wizard
- MCP 管理 UI
- full OpenCode config editor
- share / public session UI
- remote multi-user tenancy
- source repo as runtime dependency

## 目標完成態

完成後，使用者流程應是：

```bash
# 從 agents_pipeline 或 release package 安裝
./install.sh web-client

# 開啟 local web client
opencode-codex-web --open

# 在 browser 選 repo folder
# 使用 OpenCode local config / providers / agents / commands / plugins
# 在 web 中聊天、跑 command/shell、看 diff、批 permissions、看 Codex/Copilot usage、調 effort
```

完成後不應要求使用者：

- 保留 `agents_pipeline` repo clone。
- 以 `agents_pipeline` 為 cwd 啟動 web。
- 設定 `OPENCODE_CONFIG_DIR=<agents_pipeline>/opencode`。
- 手動複製 plugin/tool 檔案。

