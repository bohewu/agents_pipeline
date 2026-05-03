import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[1]


def load_module(relative_path: str, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, REPO_ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


CODEX = load_module("scripts/export-codex-agents.py", "export_codex_agents_models")
COPILOT = load_module("scripts/export-copilot-agents.py", "export_copilot_agents_models")
CLAUDE = load_module("scripts/export-claude-agents.py", "export_claude_agents_models")


def write_json(directory: Path, name: str, payload: dict) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{name}.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def profile_payload(models: dict) -> dict:
    return {"name": "profile", "runtime": "opencode", "models": models}


def args_for(profile_dir: Path, model_set_dir: Path, *, uniform_model=None):
    return SimpleNamespace(
        agent_profile="profile",
        model_set="default",
        profile_dir=profile_dir,
        model_set_dir=model_set_dir,
        uniform_model=uniform_model,
    )


def frontmatter(content: str) -> str:
    parts = content.split("---", 2)
    return parts[1]


class RuntimeModelExporterTest(unittest.TestCase):
    def test_default_builders_emit_no_model_fields(self) -> None:
        codex_agent = CODEX.AgentSource(
            path=Path("opencode/agents/executor.md"),
            file_stem="executor",
            name="executor",
            description="Execute one task.",
            body="",
            fm_keys=set(),
        )
        codex_content = CODEX.build_role_config(codex_agent, "Do work.\n")
        self.assertIn('description = "Execute one task."\ndeveloper_instructions = ', codex_content)
        self.assertNotIn("model =", codex_content)
        self.assertNotIn("model_provider", codex_content)

        copilot_content = COPILOT.build_agent_markdown(
            name="executor",
            description="Execute one task.",
            body="Do work.\n",
            subagents=[],
        )
        self.assertNotIn("\nmodel:", frontmatter(copilot_content))

        claude_content = CLAUDE.build_agent_markdown(
            name="executor",
            description="Execute one task.",
            body="Do work.\n",
            tools=[],
        )
        self.assertNotIn("\nmodel:", frontmatter(claude_content))

    def test_codex_profile_writes_role_model_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = root / "model-sets"
            write_json(profile_dir, "profile", profile_payload({"executor": "strong"}))
            write_json(
                model_set_dir,
                "default",
                {
                    "name": "default",
                    "runtime": "codex",
                    "tiers": {
                        "mini": {"model": "gpt-5.4-mini", "model_provider": "openai"},
                        "standard": {"model": "gpt-5.4", "model_provider": "openai"},
                        "strong": {"model": "gpt-5.5", "model_provider": "openai"},
                    },
                },
            )
            agent = CODEX.AgentSource(
                path=Path("opencode/agents/executor.md"),
                file_stem="executor",
                name="executor",
                description="Execute one task.",
                body="",
                fm_keys=set(),
            )

            resolved = CODEX.resolve_runtime_model_settings(
                ["executor"], args_for(profile_dir, model_set_dir), runtime="codex"
            )
            role_content = CODEX.build_role_config(
                agent, "Do work.\n", resolved["executor"]
            )
            root_config = CODEX.build_root_config(
                [agent],
                enable_feature=True,
                max_threads=6,
                max_depth=2,
                job_max_runtime_seconds=None,
            )

            self.assertIn('description = "Execute one task."\nmodel = "gpt-5.5"', role_content)
            self.assertIn('model_provider = "openai"', role_content)
            self.assertNotIn("reasoning", role_content)
            self.assertNotIn("model =", root_config)
            self.assertNotIn("model_provider", root_config)

    def test_copilot_profile_writes_scalar_and_list_models_with_solo_match(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = REPO_ROOT / "copilot" / "tools" / "model-sets"
            write_json(
                profile_dir,
                "profile",
                profile_payload(
                    {
                        "executor": "mini",
                        "doc-writer": "standard",
                        "orchestrator-flow": "strong",
                    }
                ),
            )

            resolved = COPILOT.resolve_runtime_model_settings(
                ["executor", "doc-writer", "orchestrator-flow"],
                args_for(profile_dir, model_set_dir),
                runtime="copilot",
            )
            executor_content = COPILOT.build_agent_markdown(
                name="executor",
                description="Execute one task.",
                body="Do work.\n",
                subagents=[],
                model_setting=resolved["executor"],
            )
            doc_writer_content = COPILOT.build_agent_markdown(
                name="doc-writer",
                description="Write docs.",
                body="Write docs.\n",
                subagents=[],
                model_setting=resolved["doc-writer"],
            )
            orchestrator_content = COPILOT.build_agent_markdown(
                name="orchestrator-flow",
                description="Route a flow.",
                body="Route work.\n",
                subagents=["executor"],
                model_setting=resolved["orchestrator-flow"],
            )
            solo_content = COPILOT.build_agent_markdown(
                name="orchestrator-flow-solo",
                description="Route a flow. (fallback: no subagents)",
                body="Route work inline.\n",
                subagents=[],
                model_setting=resolved["orchestrator-flow"],
            )

            self.assertIn('model: "GPT-5 mini"', frontmatter(executor_content))
            self.assertIn("model: GPT-5.4", frontmatter(doc_writer_content))
            self.assertIn(
                'model:\n  - "Claude Opus 4.7"\n  - GPT-5.5',
                frontmatter(orchestrator_content),
            )
            self.assertIn(
                'model:\n  - "Claude Opus 4.7"\n  - GPT-5.5',
                frontmatter(solo_content),
            )

    def test_claude_profile_emits_alias_and_rejects_versioned_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = root / "model-sets"
            write_json(profile_dir, "profile", profile_payload({"executor": "standard"}))
            write_json(
                model_set_dir,
                "default",
                {
                    "name": "default",
                    "runtime": "claude",
                    "tiers": {"mini": "haiku", "standard": "sonnet", "strong": "opus"},
                },
            )

            resolved = CLAUDE.resolve_runtime_model_settings(
                ["executor"], args_for(profile_dir, model_set_dir), runtime="claude"
            )
            content = CLAUDE.build_agent_markdown(
                name="executor",
                description="Execute one task.",
                body="Do work.\n",
                tools=[],
                model_setting=resolved["executor"],
            )
            self.assertIn("model: sonnet", frontmatter(content))

            write_json(
                model_set_dir,
                "versioned",
                {
                    "name": "versioned",
                    "runtime": "claude",
                    "tiers": {
                        "mini": "haiku",
                        "standard": "claude-sonnet-4-5",
                        "strong": "opus",
                    },
                },
            )
            bad_args = SimpleNamespace(
                agent_profile="profile",
                model_set="versioned",
                profile_dir=profile_dir,
                model_set_dir=model_set_dir,
                uniform_model=None,
            )
            with self.assertRaisesRegex(ValueError, "versioned model IDs"):
                CLAUDE.resolve_runtime_model_settings(
                    ["executor"], bad_args, runtime="claude"
                )

    def test_source_frontmatter_model_and_provider_still_fail(self) -> None:
        for key in ("model", "provider"):
            with self.subTest(key=key, runtime="codex"):
                source = f"---\nname: executor\ndescription: Execute one task.\n{key}: bad\n---\nBody\n"
                with self.assertRaisesRegex(ValueError, f"frontmatter key '{key}' is not supported"):
                    CODEX.parse_frontmatter(source, Path("executor.md"))

            with self.subTest(key=key, runtime="copilot"):
                source = (
                    "---\nname: executor\ndescription: Execute one task.\nmode: primary\n"
                    f"temperature: 0\n{key}: bad\n---\nBody\n"
                )
                with self.assertRaisesRegex(ValueError, f"frontmatter key '{key}' is not supported"):
                    COPILOT.parse_frontmatter(source, Path("executor.md"))

            with self.subTest(key=key, runtime="claude"):
                source = f"---\nname: executor\ndescription: Execute one task.\n{key}: bad\n---\nBody\n"
                with self.assertRaisesRegex(ValueError, f"frontmatter key '{key}' is not supported"):
                    CLAUDE.parse_frontmatter(source, Path("executor.md"))


if __name__ == "__main__":
    unittest.main()
