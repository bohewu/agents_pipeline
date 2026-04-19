# WIREFRAMES — Desktop-first ASCII UI

## 1. First launch / chat-first empty state

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Workspace: Open workspace ▾ │ + Repo │ Provider: openai ▾ │ Model: gpt-5.1-codex ▾ ...   │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ Sessions              │ Thread                                               │ Right Panel │
│                       │                                                      │             │
│ Open a workspace to   │ ┌──────────────────────────────────────────────────┐ │ Diagnostics │
│ start seeing chats.   │ │ Start in chat, attach a repo when you're ready. │ │             │
│                       │ │                                                  │ │ App         │
│ [Open workspace]      │ │ OpenCode needs a workspace before it can edit,   │ │ OpenCode    │
│                       │ │ diff, or run tools inside a project.             │ │ Node/Python │
│                       │ │                                                  │ │ Plugins     │
│                       │ │ [Open workspace]                                 │ │             │
│                       │ │                                                  │ │             │
│                       │ │ Quick system check                               │ │             │
│                       │ │ - OpenCode CLI found                             │ │             │
│                       │ │ - Usage tool installed                           │ │             │
│                       │ │ - Python found                                   │ │             │
│                       │ └──────────────────────────────────────────────────┘ │             │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Main app shell

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Workspace: project-a ▾ │ Provider: openai ▾ │ Model: gpt-5.1-codex ▾ │ Agent: build ▾ │ Effort: High ▾ │ Usage: 62% │ ● Connected │
├───────────────────────┬──────────────────────────────────────────────────────┬─────────────┤
│ Sessions              │ Thread                                               │ Right Panel │
│                       │                                                      │             │
│ + New session          │ ┌──────────────────────────────────────────────────┐ │ [Diff]      │
│                       │ │ User                                              │ │  Files      │
│ ▸ Fix auth tests       │ │ Fix the failing auth tests.                       │ │  Usage      │
│   Refactor API client  │ └──────────────────────────────────────────────────┘ │  Perms      │
│   Add CI cache         │                                                      │  Diag       │
│                       │ ┌──────────────────────────────────────────────────┐ │             │
│                       │ │ Assistant                                        │ │ Changed     │
│                       │ │ I'll inspect the test failures and related files. │ │ files       │
│                       │ │                                                  │ │             │
│                       │ │ Tool: bash                                       │ │ M auth.ts   │
│                       │ │ pnpm test auth                                   │ │ M auth.spec │
│                       │ │ status: running                                  │ │             │
│                       │ └──────────────────────────────────────────────────┘ │             │
│                       │                                                      │             │
│                       │ ┌──────────────────────────────────────────────────┐ │             │
│                       │ │ Permission required                              │ │             │
│                       │ │ bash: pnpm test auth                             │ │             │
│                       │ │ [Allow once] [Allow & remember] [Deny]           │ │             │
│                       │ └──────────────────────────────────────────────────┘ │             │
├───────────────────────┴──────────────────────────────────────────────────────┴─────────────┤
│ Mode: Ask ▾   @mention / slash command supported                                           │
│ ┌────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Type a request...                                                                       │ │
│ └────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                            [Attach files] [Send ⌘Enter]    │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Workspace selector

```text
┌──────────────────────────────────────────────┐
│ Workspaces                                   │
├──────────────────────────────────────────────┤
│ ● project-a                                  │
│   /Users/me/dev/project-a                    │
│   OpenCode: ready                            │
│                                              │
│   backend                                    │
│   /Users/me/work/backend                     │
│   OpenCode: stopped                          │
│                                              │
│   attached-staging                           │
│   http://127.0.0.1:4096                      │
│   OpenCode: attached                         │
├──────────────────────────────────────────────┤
│ [Add repo folder] [Discover under ~/dev]      │
└──────────────────────────────────────────────┘
```

## 4. Add workspace modal

```text
┌────────────────────────────────────────────────────────────────┐
│ Add repo folder                                                 │
├────────────────────────────────────────────────────────────────┤
│ Path                                                           │
│ /Users/me/dev/project-a                              [Browse]   │
│                                                                │
│ Resolve behavior                                                │
│ (●) Use nearest git root                                        │
│ ( ) Use exact folder                                            │
│                                                                │
│ Validation                                                      │
│ ✓ Directory exists                                              │
│ ✓ Git root: /Users/me/dev/project-a                             │
│ ✓ Readable                                                      │
│ ! Workspace has project .opencode config                        │
│                                                                │
│ Mode                                                           │
│ (●) Managed local opencode serve                                │
│ ( ) Attach existing server                                      │
│                                                                │
│                                      [Cancel] [Add workspace]    │
└────────────────────────────────────────────────────────────────┘
```

## 5. Effort popover

```text
┌──────────────────────────────────────┐
│ Effort                               │
├──────────────────────────────────────┤
│ Current effective: High              │
│ Source: session override             │
│                                      │
│ Session override                     │
│ [Medium] [High] [Max] [Clear]        │
│                                      │
│ Workspace default                    │
│ [Medium] [High] [Max] [Clear]        │
│                                      │
│ Applies to supported GPT-5 models    │
│ via installed OpenCode plugin.       │
└──────────────────────────────────────┘
```

## 6. Usage drawer

```text
┌───────────────────────────────────────────────────────────────┐
│ Usage                                                 Refresh │
├───────────────────────────────────────────────────────────────┤
│ [Codex] [Copilot] [Raw JSON]                                  │
│                                                               │
│ Codex account: personal@example.com       Plan: Plus          │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ 5h window        62% left        resets 14:30             │ │
│ │ weekly           41% left        resets Mon 09:00         │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ Copilot                                                       │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Source: live                                               │ │
│ │ Premium requests: 184 / 300    Remaining: 116              │ │
│ │ By model: gpt-5: 92, claude-sonnet: 57, other: 35          │ │
│ └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## 7. Diff panel

```text
┌───────────────────────────────────────────────────────────────┐
│ Diff                                           Refresh  Open   │
├───────────────────────────────────────────────────────────────┤
│ Changed files                                                  │
│ M src/auth.ts             +22 -8                               │
│ M tests/auth.spec.ts      +15 -2                               │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ diff --git a/src/auth.ts b/src/auth.ts                    │ │
│ │ - old line                                                │ │
│ │ + new line                                                │ │
│ │                                                           │ │
│ └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## 8. Diagnostics drawer after install

```text
┌───────────────────────────────────────────────────────────────┐
│ Diagnostics                                                    │
├───────────────────────────────────────────────────────────────┤
│ App                                                           │
│   Version: 0.1.0                                               │
│   Source repo required: no                                    │
│   Data: ~/.local/share/opencode-codex-web                      │
│   State: ~/.local/state/opencode-codex-web                     │
│                                                               │
│ OpenCode                                                       │
│   Binary: /opt/homebrew/bin/opencode                           │
│   Version: 1.x.x                                               │
│   Config: ~/.config/opencode                                   │
│   OPENCODE_CONFIG_DIR: not set                                 │
│                                                               │
│ Current workspace                                              │
│   Root: /Users/me/dev/project-a                                │
│   Server: ready                                                │
│   Upstream: hidden from browser                                │
│                                                               │
│ Assets                                                         │
│   Effort plugin: installed                                     │
│   Usage command: installed                                     │
│   Provider usage tool: installed                               │
└───────────────────────────────────────────────────────────────┘
```
