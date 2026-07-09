import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[1]
UPDATER_SCRIPT_PATH = REPO_ROOT / "scripts" / "update-agent-model-sets.py"

CURRENT_METADATA = {
    "anthropic": {
        "models": {
            "claude-fable-5": {},
            "claude-haiku-4-5": {},
            "claude-haiku-4-5-20251001": {},
            "claude-opus-4-7": {},
            "claude-opus-4-8": {},
            "claude-opus-5": {"deprecated": True},
            "claude-sonnet-4-6": {},
            "claude-sonnet-5": {},
        }
    },
    "google": {
        "models": {
            "gemini-2.5-pro": {},
            "gemini-4-pro": {"deprecated": True},
            "gemini-3-flash-preview": {},
            "gemini-3-pro-image-preview": {},
            "gemini-3-pro-preview": {},
            "gemini-3.1-flash-lite": {},
            "gemini-3.1-flash-lite-preview": {},
            "gemini-3.5-flash": {},
            "gemini-3.5-flash-preview-tts": {},
        }
    },
}


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


UPDATER = load_module("update_agent_model_sets", UPDATER_SCRIPT_PATH)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class UpdateAgentModelSetsTest(unittest.TestCase):
    def test_all_builders_match_bundled_catalogs(self) -> None:
        cases = (
            (
                UPDATER.build_openai,
                REPO_ROOT / "opencode" / "tools" / "model-sets" / "openai.json",
                None,
            ),
            (
                UPDATER.build_anthropic,
                REPO_ROOT / "opencode" / "tools" / "model-sets" / "anthropic.json",
                CURRENT_METADATA,
            ),
            (
                UPDATER.build_google,
                REPO_ROOT / "opencode" / "tools" / "model-sets" / "google.json",
                CURRENT_METADATA,
            ),
            (
                UPDATER.build_codex_openai,
                REPO_ROOT / "codex" / "tools" / "model-sets" / "openai.json",
                None,
            ),
            (
                UPDATER.build_copilot_default,
                REPO_ROOT / "copilot" / "tools" / "model-sets" / "default.json",
                None,
            ),
            (
                UPDATER.build_claude_default,
                REPO_ROOT / "claude" / "tools" / "model-sets" / "default.json",
                None,
            ),
        )

        for builder, path, metadata in cases:
            with self.subTest(path=path.as_posix()):
                built = builder(metadata, path)
                self.assertEqual(built, read_json(path))
                self.assertEqual(UPDATER.render_json(built), path.read_text(encoding="utf-8"))

    def test_openai_and_codex_use_gpt_5_6_luna_terra_sol(self) -> None:
        self.assertEqual(
            UPDATER.build_openai(None, Path("openai.json"))["tiers"],
            {
                "mini": "openai/gpt-5.6-luna",
                "standard": "openai/gpt-5.6-terra",
                "strong": "openai/gpt-5.6-sol",
            },
        )
        self.assertEqual(
            UPDATER.build_codex_openai(None, Path("openai.json"))["tiers"],
            {
                "mini": {"model": "gpt-5.6-luna", "model_provider": "openai"},
                "standard": {"model": "gpt-5.6-terra", "model_provider": "openai"},
                "strong": {"model": "gpt-5.6-sol", "model_provider": "openai"},
            },
        )

    def test_copilot_is_gpt_first_and_claude_code_preserves_aliases(self) -> None:
        copilot_tiers = UPDATER.build_copilot_default(None, Path("default.json"))["tiers"]
        claude_tiers = UPDATER.build_claude_default(None, Path("default.json"))["tiers"]

        self.assertEqual(copilot_tiers["mini"], "GPT-5 mini")
        self.assertEqual(copilot_tiers["standard"], "GPT-5.5")
        self.assertEqual(copilot_tiers["strong"], ["GPT-5.5", "Claude Opus 4.8"])
        self.assertEqual(claude_tiers, {"mini": "haiku", "standard": "sonnet", "strong": "opus"})

    def test_metadata_builders_select_stable_text_models_and_not_fable(self) -> None:
        anthropic = UPDATER.build_anthropic(CURRENT_METADATA, Path("anthropic.json"))
        google = UPDATER.build_google(CURRENT_METADATA, Path("google.json"))

        self.assertEqual(
            anthropic["tiers"],
            {
                "mini": "anthropic/claude-haiku-4-5",
                "standard": "anthropic/claude-sonnet-5",
                "strong": "anthropic/claude-opus-4-8",
            },
        )
        self.assertEqual(
            google["tiers"],
            {
                "mini": "google/gemini-3.1-flash-lite",
                "standard": "google/gemini-3.5-flash",
                "strong": "google/gemini-2.5-pro",
            },
        )

    def test_static_copilot_update_is_deterministic_and_needs_no_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            model_set_dir = Path(temp_dir_name)
            path = model_set_dir / "default.json"
            path.write_text(
                json.dumps(
                    {
                        "name": "default",
                        "runtime": "copilot",
                        "description": "stale description",
                        "tiers": {
                            "mini": "Keep Me Mini",
                            "standard": "old standard",
                            "strong": "old strong",
                        },
                    }
                ),
                encoding="utf-8",
            )

            argv = [
                "update-agent-model-sets.py",
                "--provider",
                "copilot",
                "--model-set-dir",
                temp_dir_name,
            ]
            with patch.object(
                UPDATER,
                "load_metadata",
                side_effect=AssertionError("static runtime update should not load metadata"),
            ), patch.object(sys, "argv", argv), patch("sys.stdout", new_callable=io.StringIO) as stdout:
                exit_code = UPDATER.main()

            self.assertEqual(exit_code, 0)
            self.assertIn(f"Updated {path}", stdout.getvalue())
            self.assertEqual(
                read_json(path)["tiers"],
                {
                    "mini": "GPT-5 mini",
                    "standard": "GPT-5.5",
                    "strong": ["GPT-5.5", "Claude Opus 4.8"],
                },
            )

    def test_all_updates_every_catalog_in_a_collision_free_layout(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source_file = root / "models.dev.json"
            model_set_dir = root / "model-sets"
            source_file.write_text(json.dumps(CURRENT_METADATA), encoding="utf-8")

            argv = [
                "update-agent-model-sets.py",
                "--provider",
                "all",
                "--source-file",
                source_file.as_posix(),
                "--model-set-dir",
                model_set_dir.as_posix(),
            ]
            with patch.object(sys, "argv", argv), patch("sys.stdout", new_callable=io.StringIO):
                exit_code = UPDATER.main()

            self.assertEqual(exit_code, 0)
            expected = {
                "opencode/tools/model-sets/openai.json": "opencode",
                "opencode/tools/model-sets/anthropic.json": "opencode",
                "opencode/tools/model-sets/google.json": "opencode",
                "codex/tools/model-sets/openai.json": "codex",
                "copilot/tools/model-sets/default.json": "copilot",
                "claude/tools/model-sets/default.json": "claude",
            }
            for relative_path, runtime in expected.items():
                with self.subTest(path=relative_path):
                    self.assertEqual(read_json(model_set_dir / relative_path)["runtime"], runtime)

            with patch.object(sys, "argv", [*argv, "--check"]), patch(
                "sys.stdout", new_callable=io.StringIO
            ):
                self.assertEqual(UPDATER.main(), 0)


if __name__ == "__main__":
    unittest.main()
