# SPEC — OpenCode Codex-style Web Client v3 General Installable

> **Scope lock:** 本規格完全排除 `status-runtime`。  
> 本規格定義一個可本機安裝、可對任意 repo 使用的 OpenCode web client。

## 1. 產品定義

建立一個 **general-purpose installable local web client**：

- 像簡化版 Codex app 的 coding UI。
- 以本機 `opencode serve` / OpenCode SDK 當 coding backend。
- 透過 installer 安裝到使用者本機。
- 不依賴 `agents_pipeline` repo 作 runtime。
- 吃使用者本機 OpenCode config、providers、models、agents、commands、plugins、credentials。
- 支援 workspace/repo folder selection。
- 支援 effort / usage-details，尤其 Codex / Copilot。

這不是官方 `opencode web` 的 clone，也不是 `agents_pipeline` 內部 dashboard。它是 **OpenCode 的 independent web client distribution**。

---

## 2. 名詞

### 2.1 Source repo

開發此 web client 的 repository。現在可能是 `bohewu/agents_pipeline`。source repo 只提供：

- package source
- installer
- bundled assets
- tests / docs

安裝後 runtime 不可依賴 source repo path。

### 2.2 Installed web client

installer 在使用者本機安裝的可執行 local app，包含：

- CLI command，例如 `opencode-codex-web`
- local BFF server bundle
- built React static assets
- BFF runtime assets，例如 `provider-usage.py`
- install metadata

### 2.3 OpenCode config dir

使用者本機 OpenCode config。預設為 OpenCode 的 global config，例如：

```text
~/.config/opencode
```

或使用者透過 env / installer option 指定的 config dir。

OpenCode assets 應安裝到此目錄，例如：

```text
~/.config/opencode/plugins/
~/.config/opencode/commands/
```

### 2.4 Workspace root

使用者要讓 OpenCode 操作的 repo folder。例如：

```text
/Users/me/dev/project-a
/home/me/work/backend
```

每個 workspace 都會用該 path 作為 upstream `opencode serve` 的 cwd。

### 2.5 Workspace

Web client local app 的 workspace profile，包含：

- id
- display name
- root path
- mode：managed / attached
- upstream server status
- last active session
- UI preferences

Workspace registry 屬於 web client app state，不屬於 source repo。

---

## 3. 產品目標

### 3.1 Primary goals

1. 使用者安裝一次後，可在任意本機 repo 使用 web coding client。
2. 使用者在 browser 中完成主要 coding loop：
   - 選 workspace
   - 選 provider / model / agent
   - ask / command / shell
   - 看 tool calls / tool outputs
   - 批 permission
   - 看 diff / files
   - 查 Codex / Copilot usage
   - 調 effort
3. 透過 BFF 封裝 OpenCode upstream API 與 event stream。
4. 使用 assistant-ui 提供 thread/composer/tool UI，但 OpenCode protocol 由 BFF 與 app store 控制。
5. installer 安裝必要 OpenCode assets，不要求使用者手動複製。

### 3.2 Non-goals

- `status-runtime`
- pipeline run dashboard
- stage/task artifacts
- full provider OAuth wizard
- MCP manager
- full OpenCode config editor
- official `opencode web` parity
- cloud-hosted multi-user service
- mobile-first UI
- source repo as runtime dependency

---

## 4. 目標使用者

- 單一開發者。
- 本機或私有網路使用。
- 已安裝或願意安裝 OpenCode CLI。
- 有本機 OpenCode config / credentials。
- 需要在不同 repo 之間切換。
- 需要比 TUI 更好的 diff / usage / effort / permissions web UX。

---

## 5. 安裝與啟動使用情境

### 5.1 Install web client

使用者在 source repo 或 release package 執行：

```bash
./install.sh web-client
```

installer 必須：

1. 檢查 Node runtime。
2. 檢查或提示 OpenCode CLI 是否存在。
3. Build 或 copy web client bundle。
4. 安裝 executable command。
5. 安裝 OpenCode assets 到 local OpenCode config。
6. 寫入 install manifest。
7. 支援 idempotent re-run。

### 5.2 Launch web client

使用者執行：

```bash
opencode-codex-web --open
```

local app 必須：

1. 啟動 BFF + static server。
2. 選擇可用 port。
3. 開 browser 到 local URL。
4. 顯示 onboarding / workspace selector。

### 5.3 First run diagnostics

如果缺少 OpenCode binary 或 assets，UI 必須顯示 diagnostics：

- OpenCode binary found / not found。
- OpenCode version / health。
- Installed plugin status。
- Installed usage tool status。
- OpenCode config dir path。
- Python availability for usage tool。

### 5.4 Add workspace

使用者輸入或選擇 repo path：

1. BFF canonicalize path。
2. 若 path 在 git repo 子目錄，預設解析到 git root。
3. BFF 驗證 path 存在、可讀、非危險系統路徑。
4. 寫入 local workspace registry。
5. 建立 / 啟動 managed upstream server。
6. 載入 OpenCode bootstrap 資料。

### 5.5 Switch workspace

1. 停止或 idle 舊 workspace SSE。
2. 保留舊 workspace server，除非設定為 auto-stop。
3. 切換 active workspace。
4. 建立新 workspace SSE。
5. 載入 sessions / agents / commands / providers / models。
6. 還原該 workspace last active session。

---

## 6. 核心功能需求

## 6.1 App shell

Desktop-first UI，包含：

- 左側 session sidebar。
- 上方 top bar。
- 中央 assistant thread。
- 下方 composer。
- 右側 drawer tabs。

Top bar 必須包含：

- Workspace selector。
- Provider selector。
- Model selector。
- Agent selector。
- Effort control。
- Usage badge。
- OpenCode/server connection status。
- Diagnostics button。

Right drawer tabs：

- Diff
- Files
- Usage
- Permissions
- Diagnostics

禁止出現：

- Run
- Stage
- Task timeline
- status-runtime artifact panel

## 6.2 Workspaces

必須支援：

1. list workspace profiles。
2. add workspace by path。
3. discover candidate git repos under allowed roots。
4. select active workspace。
5. rename workspace display name。
6. remove workspace profile。
7. start / stop / restart managed OpenCode server。
8. attach to existing server。
9. clear workspace UI state。
10. display workspace-specific config sources。

Workspace registry storage：

```text
$XDG_STATE_HOME/opencode-codex-web/workspaces.json
fallback: ~/.local/state/opencode-codex-web/workspaces.json
```

App settings storage：

```text
$XDG_CONFIG_HOME/opencode-codex-web/config.json
fallback: ~/.config/opencode-codex-web/config.json
```

## 6.3 Upstream OpenCode server

### Managed mode

BFF starts one local upstream per active workspace or on demand:

```bash
opencode serve --hostname 127.0.0.1 --port <allocated>
```

Process options:

- `cwd = workspaceRoot`
- `env = process.env + OPENCODE_SERVER_PASSWORD=random`
- Do not set `OPENCODE_CONFIG_DIR` unless user explicitly configured it.
- Track pid / port / password / startedAt / lastHealth。

### Attached mode

User enters:

- base URL
- optional username/password
- optional workspace root expectation

BFF validates:

- `/global/health` works。
- server version returned。
- if project/current API is available, current project path should match expected workspace root or show warning。

## 6.4 Sessions / messages

必須支援 workspace-scoped：

- list sessions。
- create new session。
- rename session。
- delete/archive session if upstream supports it。
- fork session。
- load messages。
- send chat message。
- stream response。
- abort current generation。

Thread UI must show：

- user messages。
- assistant messages。
- tool calls。
- tool results。
- permission requests。
- error/retry cards。
- metadata chips: provider/model/agent/effort/usage snapshot when available。

## 6.5 Composer modes

Composer modes：

1. `Ask`：normal chat。
2. `Command`：OpenCode slash command。
3. `Shell`：OpenCode shell command。

Keyboard shortcut：

- `Cmd/Ctrl+Enter` send。
- `Esc` cancel composer autocomplete。
- `/` in Ask mode opens command suggestions。
- `@` opens agent/subagent mention suggestions if available。

## 6.6 Provider / model / agent selection

BFF bootstrap must load OpenCode providers, models, agents, and commands from selected workspace upstream.

UI behavior：

- Provider selector filters model selector。
- Model selector displays provider/model id。
- Agent selector shows primary agents first。
- If selected agent/model no longer exists after workspace switch, fallback to upstream default。

## 6.7 Permissions

當 upstream event 或 message part indicates permission request：

- Show inline permission card in thread。
- Also show pending list in right Permissions panel。
- Actions：
  - allow once
  - allow and remember when upstream supports remembered permission
  - deny
- Decision is POSTed through BFF, never directly to upstream。

## 6.8 Diff / files

Diff panel：

- list changed files。
- show additions/deletions summary。
- show unified diff or split diff if enough data available。
- refresh on message completion and relevant file events。

Files panel：

- file search。
- tree or flat changed-files list。
- open file content readonly。
- copy relative path。

## 6.9 Effort control

Must support Codex/Copilot GPT-5-style reasoning effort via installed OpenCode plugin.

UI levels：

```text
medium | high | max
```

Internal levels：

```text
medium | high | xhigh
```

Scope：

- workspace/project default。
- session override。

Files in selected workspace：

```text
<workspaceRoot>/.opencode/effort-control.sessions.json
<workspaceRoot>/.opencode/effort-control.trace.jsonl
```

BFF responsibilities：

- read current state。
- write default / session override。
- clear default / session override。
- read recent trace events。
- compute UI effective effort using the same compatibility logic as the plugin。

OpenCode plugin responsibilities：

- hook `chat.params`。
- set upstream reasoning effort。
- write trace。

## 6.10 Usage details

Must support：

- Codex usage windows。
- Copilot live lookup when token available。
- Copilot CSV report mode。
- JSON response only。

BFF executes installed usage tool：

```bash
python3 <installedAssets>/tools/provider-usage.py \
  --provider auto \
  --format json \
  --project-root <workspaceRoot>
```

Do not parse `/usage` command text output.

UI：

- Header badge summary。
- Usage drawer tabs：Codex / Copilot / Raw JSON。
- Refresh button。
- Error with remediation hints。

## 6.11 Diagnostics

Diagnostics panel must show：

- app version。
- installed paths。
- install manifest status。
- OpenCode binary path/version。
- current OpenCode config dir resolution。
- installed OpenCode assets status。
- active workspace server status。
- Python availability。
- usage tool path。
- source repo dependency check: should say `not required`.

---

## 7. Security / safety requirements

1. Bind local app server to `127.0.0.1` by default。
2. Never expose upstream OpenCode server to browser directly。
3. Upstream managed server binds to `127.0.0.1`。
4. Generate random upstream server password per process。
5. Validate workspace paths。
6. Do not allow arbitrary file read outside selected workspace except explicit allowed config/asset paths。
7. Do not print tokens or credentials in UI logs。
8. Attached mode must show warning if host is not localhost / private network。
9. Usage tool output must redact sensitive fields by default。

---

## 8. Completion criteria

A build is acceptable when：

1. `./install.sh web-client` installs/reinstalls idempotently。
2. `opencode-codex-web --open` launches after source repo is moved away。
3. User can add two unrelated repo folders and switch between them。
4. Each workspace starts OpenCode in the correct cwd。
5. Browser never calls upstream OpenCode URL。
6. Chat, command, shell work through BFF。
7. Permissions can be approved/denied。
8. Diff/files panels work for changed files。
9. Effort state writes into selected workspace `.opencode`。
10. Usage drawer executes installed tool and returns JSON。
11. No `status-runtime` routes/components/imports exist。

