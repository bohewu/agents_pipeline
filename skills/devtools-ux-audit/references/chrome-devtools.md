# Chrome DevTools Notes

Use these details only when Chrome DevTools tools are the selected browser capability.

## Typical Sequence

1. Open or navigate one page.
2. Resize or emulate the selected viewport.
3. Take a semantic snapshot.
4. Fill, click, press keys, and wait for the expected state.
5. Inspect console messages and relevant network requests.
6. Take a screenshot only for a visual claim.

Tool names vary by runtime. Common Codex-facing names include `chrome-devtools_new_page`, `chrome-devtools_navigate_page`, `chrome-devtools_resize_page`, `chrome-devtools_emulate`, `chrome-devtools_take_snapshot`, `chrome-devtools_fill`, `chrome-devtools_click`, `chrome-devtools_press_key`, `chrome-devtools_wait_for`, `chrome-devtools_list_console_messages`, `chrome-devtools_list_network_requests`, and `chrome-devtools_take_screenshot`.

## Recovery

- `Not connected` means evidence collection failed; it does not prove that the browser or MCP process stopped.
- A shared-profile error usually means another browser still owns that profile. Do not delete lock files until you verify that no live process is using it.
- Restart only the dedicated DevTools/browser pair owned by this task. Do not terminate unrelated user sessions.
- On Linux or macOS, remove `SingletonLock`, `SingletonSocket`, and `SingletonCookie` only after the owning Chrome process is confirmed stopped.
- Retry recovery once, then report the exact failure and reduced confidence instead of looping.
- After recovery, make one lightweight browser call before resuming the journey.
