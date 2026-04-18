import importlib.util
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def load_module(relative_path: str, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, REPO_ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


COPILOT = load_module("scripts/export-copilot-agents.py", "export_copilot_agents_compaction")
CODEX = load_module("scripts/export-codex-agents.py", "export_codex_agents_compaction")
CLAUDE = load_module("scripts/export-claude-agents.py", "export_claude_agents_compaction")


def parse_body(module, relative_path: str) -> str:
    source = (REPO_ROOT / relative_path).read_text(encoding="utf-8")
    path = Path(relative_path)
    if module is COPILOT:
        _, body = module.parse_frontmatter(source, path)
        return body
    _, _, body = module.parse_frontmatter(source, path)
    return body


def adapt_body(module, agent_name: str, body: str) -> str:
    if module is COPILOT:
        return module.adapt_body(agent_name, body, False)
    if module is CODEX:
        return module.adapt_body(agent_name, body, False)
    return module.adapt_body(agent_name, body, [])


class ExportPromptCompactionTest(unittest.TestCase):
    def test_general_orchestrator_export_minifies_shared_sections(self) -> None:
        relative_path = "opencode/agents/orchestrator-general.md"
        for label, module in (("copilot", COPILOT), ("codex", CODEX), ("claude", CLAUDE)):
            adapted = adapt_body(module, "orchestrator-general", parse_body(module, relative_path))

            self.assertNotIn("These rules apply to **all agents**.", adapted, label)
            self.assertNotIn("## ORCHESTRATOR -> SUBAGENT HANDOFF", adapted, label)
            self.assertNotIn("You are given positional parameters via the slash command.", adapted, label)
            self.assertNotIn("|------|------------------------|-------------------|", adapted, label)
            self.assertIn("- `orchestrator-general`:", adapted, label)
            self.assertIn("Forbidden:", adapted, label)

    def test_pipeline_export_keeps_reviewer_retry_semantics(self) -> None:
        relative_path = "opencode/agents/orchestrator-pipeline.md"
        for label, module in (("copilot", COPILOT), ("codex", CODEX), ("claude", CLAUDE)):
            adapted = adapt_body(module, "orchestrator-pipeline", parse_body(module, relative_path))

            self.assertNotIn("## REVIEWER -> ORCHESTRATOR HANDOFF", adapted, label)
            self.assertIn("- Executor -> reviewer:", adapted, label)
            self.assertIn("- Reviewer -> orchestrator:", adapted, label)
            self.assertIn("required_followups", adapted, label)
            self.assertIn("max_retry_rounds", adapted, label)


if __name__ == "__main__":
    unittest.main()
