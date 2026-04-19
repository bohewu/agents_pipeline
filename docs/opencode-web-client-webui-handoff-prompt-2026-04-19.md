# OpenCode Web Client WebUI Handoff Prompt

Use this prompt to continue the `apps/opencode-web-client` investigation from the current repo state.

## Prompt

```md
Repo: /home/bohewu/repos/agents_pipeline
Focus app: apps/opencode-web-client
Branch: feat/opencode-web-client-v3

Continue the web client debugging work from the current repo state.

Primary user problem:
- In the web UI, long-thinking / long-generation responses can still make the app feel hung.
- During that state, clicking `Settings` may feel blocked or laggy.
- The browser has sometimes shown a "response too long" style warning during long generations.
- If TUI shows a reasoning summary, the web UI should also surface it.

Important context already handled:
- The extra standalone `Thinking...` placeholder row was intentionally removed. Do not reintroduce a separate pending assistant message block.
- The thread should remain conversational, not card-heavy.
- `reasoning_summary` / `summary_text` normalization support was already added earlier.
- `npm run typecheck` and `npm run build` passed after the latest local changes.

Current uncommitted/local state that should be understood before changing direction:
- `apps/opencode-web-client/src/server/services/event-broker.ts`
  - Adds message-delta flush throttling (`MESSAGE_DELTA_FLUSH_MS = 80`) so SSE does not broadcast every tiny delta immediately.
- `apps/opencode-web-client/src/client/runtime/event-reducer.ts`
  - Stops re-sorting sidebar sessions on every `message.delta`; only flips the active session to `running` once.
- `apps/opencode-web-client/src/client/components/thread/Thread.tsx`
  - Uses a narrower Zustand selector so each message row subscribes to its own message instead of the full store.
  - Keeps only the existing inline `Generating...` status under the assistant row.
- `apps/opencode-web-client/src/client/components/app-shell/AppShell.tsx`
  - Wraps incoming event handling in `startTransition(...)`.

Latest validated facts:
- Idle-state browser check succeeded at `http://127.0.0.1:5173`.
- `Settings` opens normally when the app is not under streaming pressure.
- The duplicate `Thinking...` row / overlap bug is fixed.
- Console was clean on reload.

What still needs real browser evidence:
1. Start the local preview for `apps/opencode-web-client`.
2. Reproduce a truly long-running generation in the web UI.
3. While generation is active, click `Settings` and confirm whether the UI still hangs.
4. If it still hangs, capture browser evidence:
   - snapshots first
   - console/network if useful
   - performance trace during the long generation
5. Confirm whether reasoning summaries appear in the web UI for the same kind of session where TUI shows them.

Strong suspicion to validate:
- The remaining issue is performance pressure from high-frequency streaming updates and/or oversized incremental payloads, not just a simple visual-state bug.

Useful commands:
- `cd /home/bohewu/repos/agents_pipeline/apps/opencode-web-client && npm run dev`
- `cd /home/bohewu/repos/agents_pipeline/apps/opencode-web-client && npm run typecheck`
- `cd /home/bohewu/repos/agents_pipeline/apps/opencode-web-client && npm run build`

Guardrails:
- Do not revert unrelated work.
- Do not create a separate pending assistant chat block for thinking.
- Keep fixes small and localized if possible.
- If you make more code changes, verify with `npm run typecheck` and `npm run build`.
```

## Notes

- Relevant recent commits on this branch:
  - `fd857c6` `fix(web-client): surface thinking progress without blocking the UI`
  - `e7019a8` `fix(web-client): stabilize thread rendering and soften chat presentation`
  - `4edb46b` `fix(web-client): demote reasoning summaries and clarify settings affordance`
- The remaining work is mainly browser-backed validation under a real long response, plus any follow-up performance tuning that evidence supports.
