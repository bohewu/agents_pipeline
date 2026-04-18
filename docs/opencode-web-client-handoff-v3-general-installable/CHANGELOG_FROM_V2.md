# CHANGELOG_FROM_V2 — Required architecture correction

## 必改原因

v2 把這個 web client 當成 `agents_pipeline` repo 內部 app，並把 `agents_pipeline/opencode` 當 runtime shared config。這不符合產品目標。

正確方向：

- `agents_pipeline` 是 source / installer / distribution repo。
- 使用者透過 installer 把 web client 和必要 OpenCode assets 安裝到本機。
- web client 是 general local app，可對任意 repo/workspace 使用。
- runtime 吃本機 OpenCode config，而不是吃 source repo。

## Must remove / must not implement

### 1. 移除 AGENTS_PIPELINE_ROOT runtime dependency

禁止：

```ts
const AGENTS_PIPELINE_ROOT = process.env.AGENTS_PIPELINE_ROOT
const usageScript = path.join(AGENTS_PIPELINE_ROOT, 'opencode/tools/provider-usage.py')
const pluginDir = path.join(AGENTS_PIPELINE_ROOT, 'opencode')
```

改為：

```ts
const appPaths = resolveInstalledAppPaths()
const usageScript = appPaths.assets.tools.providerUsagePy
```

### 2. 不得預設注入 OPENCODE_CONFIG_DIR=source repo

禁止：

```ts
env.OPENCODE_CONFIG_DIR = path.join(AGENTS_PIPELINE_ROOT, 'opencode')
```

改為：

```ts
const env = {
  ...process.env,
  OPENCODE_SERVER_PASSWORD: randomPassword,
}

// only if user explicitly set it in app settings or env:
if (settings.opencodeConfigDirOverride) {
  env.OPENCODE_CONFIG_DIR = settings.opencodeConfigDirOverride
}
```

### 3. workspace registry 不可存在 source repo

禁止：

```text
<AGENTS_PIPELINE_ROOT>/.opencode/web-workspaces.json
```

改為：

```text
$XDG_STATE_HOME/opencode-codex-web/workspaces.json
# fallback: ~/.local/state/opencode-codex-web/workspaces.json
```

Windows fallback 可用：

```text
%LOCALAPPDATA%/opencode-codex-web/state/workspaces.json
```

### 4. 不使用 Next.js 作主架構

v2 的 Next.js Route Handlers 是 repo-hosted web app 思路。v3 改為 installable local app：

```text
CLI -> local Node server -> static React app + BFF routes -> OpenCode upstream
```

推薦：Vite + React + Hono/Fastify local server。

### 5. usage tool 必須 bundle / install

禁止：

```bash
python3 <AGENTS_PIPELINE_ROOT>/opencode/tools/provider-usage.py --format json
```

改為：

```bash
python3 <installed-assets>/tools/provider-usage.py --format json --project-root <workspaceRoot>
```

### 6. effort plugin 由 installer 安裝

禁止假設 plugin 留在 source repo。

installer 必須能把 plugin 安裝到：

```text
~/.config/opencode/plugins/effort-control.js
~/.config/opencode/plugins/effort-control/state.js
```

或使用者指定 config dir。

### 7. UI 文案調整

所有 UI 不應出現：

- `Agents Pipeline Root`
- `AGENTS_PIPELINE_ROOT`
- `shared agents_pipeline assets`

改用：

- `OpenCode config`
- `Installed assets`
- `Web client installation`
- `Workspace`

## Must keep from v2

以下 v2 概念仍正確，必須保留：

- 多 workspace / repo folder selection。
- 每個 workspace 有獨立 upstream OpenCode server context。
- BFF 封裝 upstream，不讓 browser 直連。
- assistant-ui 使用 ExternalStoreRuntime。
- effort / usage / diff / files / permissions 是核心功能。
- `status-runtime` 仍排除。

## Acceptance delta

驗收時必須檢查：

1. 移動或刪除 source repo 後，已安裝的 web client 仍可啟動。
2. 開啟任意 repo path 都可正常啟動 managed `opencode serve`。
3. managed `opencode serve` 使用該 repo cwd。
4. `OPENCODE_CONFIG_DIR` 不會被預設設到 source repo。
5. `/api/diagnostics/install` 顯示 installed assets，而不是 source repo assets。
6. usage script path 來自 installed assets。
7. effort plugin 安裝狀態可被診斷。

