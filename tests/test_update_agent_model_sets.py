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
    def test_copilot_default_builder_matches_bundled_catalog(self) -> None:
        path = REPO_ROOT / "copilot" / "tools" / "model-sets" / "default.json"
        current = read_json(path)
        built = UPDATER.build_copilot_default(None, path)

        self.assertEqual(built, current)
        self.assertEqual(built["tiers"]["mini"], current["tiers"]["mini"])
        self.assertEqual(built["tiers"]["standard"], "GPT-5.4")
        self.assertEqual(built["tiers"]["strong"], ["Claude Opus 4.7", "GPT-5.5"])
        self.assertIn("Copilot/VS Code", built["description"])
        self.assertIn("model picker", built["description"])
        self.assertEqual(UPDATER.render_json(built), path.read_text(encoding="utf-8"))

    def test_static_runtime_builders_match_bundled_catalogs(self) -> None:
        cases = (
            (
                UPDATER.build_codex_openai,
                REPO_ROOT / "codex" / "tools" / "model-sets" / "openai.json",
            ),
            (
                UPDATER.build_claude_default,
                REPO_ROOT / "claude" / "tools" / "model-sets" / "default.json",
            ),
        )

        for builder, path in cases:
            with self.subTest(path=path.as_posix()):
                built = builder(None, path)
                self.assertEqual(built, read_json(path))
                self.assertEqual(UPDATER.render_json(built), path.read_text(encoding="utf-8"))

    def test_static_copilot_update_preserves_current_mini_without_metadata(self) -> None:
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
            updated = read_json(path)
            self.assertEqual(updated["tiers"]["mini"], "Keep Me Mini")
            self.assertEqual(updated["tiers"]["standard"], "GPT-5.4")
            self.assertEqual(updated["tiers"]["strong"], ["Claude Opus 4.7", "GPT-5.5"])

    def test_legacy_all_updates_only_metadata_backed_opencode_sets(self) -> None:
        metadata = {
            "anthropic": {
                "models": {
                    "claude-haiku-4-5": {},
                    "claude-sonnet-4-6": {},
                    "claude-opus-4-7": {},
                }
            },
            "google": {
                "models": {
                    "gemini-3.1-flash-lite-preview": {},
                    "gemini-3-flash-preview": {},
                    "gemini-3.1-pro-preview": {},
                }
            },
        }

        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source_file = root / "models.dev.json"
            model_set_dir = root / "model-sets"
            model_set_dir.mkdir()
            source_file.write_text(json.dumps(metadata), encoding="utf-8")

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
            self.assertEqual(read_json(model_set_dir / "anthropic.json")["runtime"], "opencode")
            self.assertEqual(read_json(model_set_dir / "google.json")["runtime"], "opencode")
            self.assertFalse((model_set_dir / "default.json").exists())
            self.assertFalse((model_set_dir / "openai.json").exists())


if __name__ == "__main__":
    unittest.main()
