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


def run_updater(*args: str) -> int:
    with patch.object(sys, "argv", ["update-agent-model-sets.py", *args]), patch(
        "sys.stdout", new_callable=io.StringIO
    ), patch("sys.stderr", new_callable=io.StringIO):
        return UPDATER.main()


class UpdateAgentModelSetsTest(unittest.TestCase):
    def test_builders_match_bundled_catalogs(self) -> None:
        cases = (
            (UPDATER.build_codex_openai, REPO_ROOT / "runtimes/codex/model-sets/openai.json"),
            (UPDATER.build_copilot_default, REPO_ROOT / "runtimes/copilot/model-sets/default.json"),
            (UPDATER.build_claude_default, REPO_ROOT / "runtimes/claude/model-sets/default.json"),
        )
        for builder, path in cases:
            with self.subTest(path=path.as_posix()):
                built = builder(None, path)
                self.assertEqual(built, read_json(path))
                self.assertEqual(UPDATER.render_json(built), path.read_text(encoding="utf-8"))

    def test_only_openai_gpt6_is_builtin_for_codex(self) -> None:
        directory = REPO_ROOT / "runtimes/codex/model-sets"
        self.assertEqual([path.name for path in directory.glob("*.json")], ["openai.json"])
        catalog = read_json(directory / "openai.json")
        self.assertEqual(catalog["version"], "4")
        self.assertEqual(catalog["reasoning_projection"]["id"], "openai-gpt6-v1")
        self.assertEqual(catalog["role_overrides"], {})
        self.assertEqual(
            {tier: value["model"] for tier, value in catalog["tiers"].items()},
            {"mini": "gpt-6-luna", "standard": "gpt-6-sol", "strong": "gpt-6-astra"},
        )
        self.assertEqual({v["model_provider"] for v in catalog["tiers"].values()}, {"openai"})

    def test_all_mirrors_runtime_layout_and_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            args = ("--provider", "all", "--model-set-dir", temp_dir)
            self.assertEqual(run_updater(*args), 0)
            root = Path(temp_dir)
            self.assertEqual(
                sorted(p.relative_to(root).as_posix() for p in root.rglob("*.json")),
                [
                    "runtimes/claude/model-sets/default.json",
                    "runtimes/codex/model-sets/openai.json",
                    "runtimes/copilot/model-sets/default.json",
                ],
            )
            self.assertEqual(run_updater(*args, "--check"), 0)
            self.assertEqual(run_updater(*args), 0)

    def test_retired_managed_catalogs_are_reported_and_removed_only_on_write(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            args = ("--provider", "codex", "--model-set-dir", temp_dir)
            self.assertEqual(run_updater(*args), 0)
            retired = root / "openai-luna-sol-astra.json"
            retired.write_bytes((
                REPO_ROOT / "tests/fixtures/retired-codex-model-sets/openai-luna-sol-astra.json"
            ).read_bytes())
            self.assertEqual(run_updater(*args, "--check"), 1)
            self.assertTrue(retired.exists())
            self.assertEqual(run_updater(*args, "--dry-run"), 0)
            self.assertTrue(retired.exists())
            self.assertEqual(run_updater(*args), 0)
            self.assertFalse(retired.exists())
            self.assertEqual(run_updater(*args, "--check"), 0)

    def test_unknown_catalog_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            args = ("--provider", "codex", "--model-set-dir", temp_dir)
            self.assertEqual(run_updater(*args), 0)
            custom = root / "custom.json"
            custom.write_text("{}\n", encoding="utf-8")
            retired_name_custom = root / "openai-legacy.json"
            retired_name_custom.write_text("{}\n", encoding="utf-8")
            self.assertEqual(run_updater(*args), 1)
            self.assertTrue(custom.exists())
            self.assertTrue(retired_name_custom.exists())
            self.assertEqual(run_updater(*args, "--check"), 1)

    def test_check_reports_stale_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "openai.json"
            path.write_text("{}\n", encoding="utf-8")
            self.assertEqual(run_updater("--provider", "codex", "--model-set-dir", temp_dir, "--check"), 1)
            self.assertEqual(path.read_text(encoding="utf-8"), "{}\n")

    def test_active_catalog_symlink_is_not_followed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            target = root / "outside.json"
            target.write_text("{}\n", encoding="utf-8")
            catalog_dir = root / "catalogs"
            catalog_dir.mkdir()
            (catalog_dir / "openai.json").symlink_to(target)
            self.assertEqual(
                run_updater("--provider", "codex", "--model-set-dir", str(catalog_dir)), 1
            )
            self.assertEqual(target.read_text(encoding="utf-8"), "{}\n")

    def test_retired_cleanup_does_not_follow_symlinked_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            target_dir = root / "target"
            nested_dir = target_dir / "catalogs"
            nested_dir.mkdir(parents=True)
            retired = nested_dir / "openai-legacy.json"
            original = (
                REPO_ROOT / "tests/fixtures/retired-codex-model-sets/openai-legacy.json"
            ).read_bytes()
            retired.write_bytes(original)
            linked_parent = root / "linked"
            linked_parent.symlink_to(target_dir, target_is_directory=True)
            self.assertEqual(
                run_updater(
                    "--provider", "codex", "--model-set-dir", str(linked_parent / "catalogs")
                ),
                1,
            )
            self.assertEqual(retired.read_bytes(), original)
            self.assertFalse((nested_dir / "openai.json").exists())


if __name__ == "__main__":
    unittest.main()
