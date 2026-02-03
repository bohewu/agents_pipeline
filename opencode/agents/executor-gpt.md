---
name: executor-gpt
description: Executes one atomic task using GPT-5.2-codex (high quality). Use for high-risk/complex tasks only.
mode: subagent
model: openai/gpt-5.2-codex
temperature: 0.2
tools:
  read: true
  edit: true
  write: true
  grep: true
  glob: true
  bash: true
---
