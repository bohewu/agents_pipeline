---
name: decide
description: Evaluate explicitly selected text or JSON with the OpenAI Decisions API to return predicates, fixed choices or rubric scores. Use when the user requests $decide; answers are advisory and do not authorize actions.
license: See repository license
---

# Decide

Use this capability only on explicit user invocation. It is a one-shot API tool,
not a managed role or a replacement for independent review, deterministic guards,
profile routing or user approval. Do not dispatch another agent to use it.

## Prepare

1. Apply the host's API credential setup policy before implementation, configuration
   or a live request. Never read Codex OAuth tokens or change the parent runtime's
   provider, login, permissions, sandbox or approval settings.
2. Establish the question and evidence. Use only supplied text/JSON or files the
   user explicitly selected. Show a concise evidence scope before transmission.
   Do not collect the repository, conversation or private settings automatically.
   Remove any known secret; ask for sanitized evidence when necessary.
3. Build a request using the example below. The tool supports text or user
   text/JSON messages, 1–16 uniquely named questions, and a maximum 64 KiB request.
   Ask for missing choices or ordered score levels before sending anything.

```json
{
  "model": "gpt-6-luna",
  "input": "The supplied task changes one documentation link.",
  "questions": [{
    "name": "route_suggestion",
    "type": "choice",
    "instructions": "Which workflow fits this task's scope? This is a suggestion only.",
    "choices": [
      {"value": "simple", "description": "One bounded, clear task."},
      {"value": "flow", "description": "Several dependent tasks with modest risk."},
      {"value": "pipeline", "description": "Complex work needing formal gates."}
    ]
  }]
}
```

Question types: `predicate` returns a probability; `choice` needs 2–255 distinct
string/boolean values; `score` needs 2–10 ordered levels with `label` and optional
`description`. Instructions are text. JSON evidence may use user message content
parts of type `input_json` with `data` as an object or array of objects.
Images, tools, streaming and arbitrary endpoints are outside this delivery.

## Invoke

Resolve these paths relative to this skill file; installed copies are rewritten
to the persistent support tree. Run with Node.js 18+ and Python 3.11+;
entrypoints use Bash on Linux/macOS or PowerShell 7+ on Windows.

- Local validation: `node ../../tools/decisions.js --input request.json --dry-run`.
  No network or credential lookup occurs. Input may instead be `-` for stdin.
- If the operator's existing secret manager supplies a dedicated process-local
  `OPENAI_API_KEY`, invoke `node ../../tools/decisions.js --input request.json`.
- Once the operator has bound a private env file, invoke
  `bash ../../scripts/decide.sh run --input request.json`, or on Windows
  `pwsh -NoProfile -File ../../scripts/decide.ps1 run --input request.json`.
  These fixed entrypoints work from any workspace and retain the caller's cwd
  for request paths. They use the per-user saved credential location, not local
  workspace discovery. An explicit `--env-file <confirmed-file>` overrides it
  for one call without changing the binding. An invalid binding never falls
  back to a different key. The launcher does not execute env-file contents or
  export the credential to the parent session.

The direct Python entry `python3 ../../scripts/decide.py` supports the same
commands. Without a saved binding or `--env-file`, `run` preserves the existing
process-environment mode. Dry-run never reads binding metadata or credentials.

For first-time manual setup, local status, replacement and Windows notes, read
[the setup reference](references/setup.md). The optional standalone entrypoint
opens a `set / status / clear` menu when run without arguments in the human's
terminal; `set` completes key-file setup and location binding together. Never
automate secret entry or pass a key as an argument. Unrelated tasks, the main
installer and workspace profile must not launch this optional setup. Installation
and updates do not create keys or modify credential files.

## Interpret and stop

Report validated named answers, model, usage and safe request ID when present.
Describe probabilities/confidence as estimates. Score is a weighted level index,
not necessarily an integer. Do not invent a rationale the API did not return.

Exit 0 means completed or dry-run; 2 means local input/credential error; 3 means
API/transport/response failure; 4 means at least one refusal. Preserve refusals
and errors without inventing answers. A returned suggestion never executes
commands or changes workflow/profile settings by itself.

One live invocation sends one request to the fixed production Decisions endpoint.
It has a 30-second deadline and 256 KiB response limit. No automatic retry,
credential/model fallback or redirects. After timeout/transport failure, server
outcome and billing may be unknown: report that before any user-authorized retry.
Do not expose upstream error bodies, authorization headers, keys or stack traces.

Live calls may spend the selected project's credits/balance. Local limits are
not a monetary cap. Do not alter billing or claim available credit from a
successful request. See the [official API contract](https://developers.openai.com/api/reference/resources/decisions/methods/create).
