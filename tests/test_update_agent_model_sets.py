import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts/update-agent-model-sets.py"
SPEC = importlib.util.spec_from_file_location("update_agent_model_sets", SCRIPT_PATH)
UPDATER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = UPDATER
SPEC.loader.exec_module(UPDATER)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class UpdateAgentModelSetsTest(unittest.TestCase):
    def test_builders_match_bundled_catalogs(self) -> None:
        cases = (
            (UPDATER.build_codex_openai, REPO_ROOT / "runtimes/codex/model-sets/openai.json"),
            (
                UPDATER.build_codex_openai_legacy,
                REPO_ROOT / "runtimes/codex/model-sets/openai-legacy.json",
            ),
            (
                UPDATER.build_codex_openai_luna_sol_astra,
                REPO_ROOT / "runtimes/codex/model-sets/openai-luna-sol-astra.json",
            ),
            (UPDATER.build_copilot_default, REPO_ROOT / "runtimes/copilot/model-sets/default.json"),
            (UPDATER.build_claude_default, REPO_ROOT / "runtimes/claude/model-sets/default.json"),
        )
        for builder, path in cases:
            with self.subTest(path=path.as_posix()):
                built = builder(None, path)
                self.assertEqual(built, read_json(path))
                self.assertEqual(UPDATER.render_json(built), path.read_text(encoding="utf-8"))

    def test_codex_uses_luna_terra_sol(self) -> None:
        self.assertEqual(
            UPDATER.build_codex_openai(None, Path("openai.json"))["tiers"],
            {
                "mini": {"model": "gpt-5.6-luna", "model_provider": "openai"},
                "standard": {"model": "gpt-5.6-terra", "model_provider": "openai"},
                "strong": {"model": "gpt-5.6-sol", "model_provider": "openai"},
            },
        )

    def test_codex_catalogs_bind_the_three_registered_projections(self) -> None:
        expected = {
            "openai": ("openai-reviewer-v1", "gpt-6-astra"),
            "openai-legacy": ("legacy-v2", None),
            "openai-luna-sol-astra": ("lsa-efficiency-v1", None),
        }
        for name, (projection, reviewer_model) in expected.items():
            with self.subTest(name=name):
                catalog = read_json(
                    REPO_ROOT / "runtimes" / "codex" / "model-sets" / f"{name}.json"
                )
                self.assertEqual(catalog["reasoning_projection"]["id"], projection)
                self.assertRegex(catalog["mapping_digest"], r"^sha256:[0-9a-f]{64}$")
                override = catalog["role_overrides"].get("reviewer")
                self.assertEqual(
                    None if override is None else override["model"], reviewer_model
                )

    def test_runtime_defaults_are_static(self) -> None:
        self.assertEqual(
            UPDATER.build_copilot_default(None, Path("default.json"))["tiers"],
            {
                "mini": "GPT-5 mini",
                "standard": "GPT-5.5",
                "strong": ["GPT-5.5", "Claude Opus 4.8"],
            },
        )
        self.assertEqual(
            UPDATER.build_claude_default(None, Path("default.json"))["tiers"],
            {"mini": "haiku", "standard": "sonnet", "strong": "opus"},
        )

    def test_all_mirrors_neutral_runtime_layout(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            argv = [
                "update-agent-model-sets.py",
                "--provider",
                "all",
                "--model-set-dir",
                temp_dir,
            ]
            with patch.object(sys, "argv", argv), patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(UPDATER.main(), 0)
            root = Path(temp_dir)
            expected = {
                "runtimes/codex/model-sets/openai.json": "codex",
                "runtimes/codex/model-sets/openai-legacy.json": "codex",
                "runtimes/codex/model-sets/openai-luna-sol-astra.json": "codex",
                "runtimes/copilot/model-sets/default.json": "copilot",
                "runtimes/claude/model-sets/default.json": "claude",
            }
            for relative, runtime in expected.items():
                self.assertEqual(read_json(root / relative)["runtime"], runtime)
            with patch.object(sys, "argv", [*argv, "--check"]), patch(
                "sys.stdout", new_callable=io.StringIO
            ):
                self.assertEqual(UPDATER.main(), 0)

    def test_check_reports_stale_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "openai.json"
            path.write_text("{}\n", encoding="utf-8")
            argv = [
                "update-agent-model-sets.py",
                "--provider",
                "codex",
                "--model-set-dir",
                temp_dir,
                "--check",
            ]
            with patch.object(sys, "argv", argv), patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(UPDATER.main(), 1)


if __name__ == "__main__":
    unittest.main()
