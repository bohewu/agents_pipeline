---
description: Show workspace agent model profile commands.
agent: doc-writer
---

# Agent Model Profile

Use the deterministic installer instead of asking the model to edit agent files.

PowerShell:

```powershell
pwsh ~/.config/opencode/tools/agent-profile.ps1 list
pwsh ~/.config/opencode/tools/agent-profile.ps1 install balanced -ModelSet openai -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 install balanced -ModelSet anthropic -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 install premium -ModelSet google -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 install uniform -Model openai/gpt-5.4 -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 install balanced -Runtime claude -ModelSet default -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 status -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 clear -Workspace .
```

Bash/macOS/Linux:

```bash
bash ~/.config/opencode/tools/agent-profile.sh list
bash ~/.config/opencode/tools/agent-profile.sh install balanced --model-set openai --workspace .
bash ~/.config/opencode/tools/agent-profile.sh install balanced --model-set anthropic --workspace .
bash ~/.config/opencode/tools/agent-profile.sh install premium --model-set google --workspace .
bash ~/.config/opencode/tools/agent-profile.sh install uniform --model openai/gpt-5.4 --workspace .
bash ~/.config/opencode/tools/agent-profile.sh install balanced --runtime claude --model-set default --workspace .
bash ~/.config/opencode/tools/agent-profile.sh status --workspace .
bash ~/.config/opencode/tools/agent-profile.sh clear --workspace .
```

Restart OpenCode after changing profiles.
For runtime installs, `-Workspace` / `--workspace` is workspace-first and `-Target` / `--target` is only for an explicit override or intentional global install.
