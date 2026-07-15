import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "sync-runtime-support.py"


def load_module():
    spec = importlib.util.spec_from_file_location("sync_runtime_support", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


MODULE = load_module()


class RuntimeSupportSyncTest(unittest.TestCase):
    def make_source(self, root: Path) -> Path:
        source = root / "source"
        for dirname in MODULE.SUPPORT_DIRS:
            (source / dirname).mkdir(parents=True)
        (source / "modes.json").write_text(
            '{"version":1,"modes":[{"name":"flow","agent":"orchestrator-flow","aliases":["flow","run-flow"]}]}',
            encoding="utf-8",
        )
        (source / "AGENTS.md").write_text("# Agent catalog\n", encoding="utf-8")
        (source / "VERSION").write_text("0.28.0\n", encoding="utf-8")
        (source / "agents" / "orchestrator-flow.md").write_text(
            "Parse `$ARGUMENTS`; read `protocols/PIPELINE_PROTOCOL.md`; "
            "run `node tools/status-event.js --help` and "
            "`node tools/reasoning-policy.js --help`.\n",
            encoding="utf-8",
        )
        (source / "protocols" / "PIPELINE_PROTOCOL.md").write_text(
            "See `./protocols/schemas/example.json`. "
            "Run `python3 scripts/validate-helper-contracts.py`.\n",
            encoding="utf-8",
        )
        (source / "protocols" / "reasoning-policy.json").write_text(
            '{"policy_version":"fixture"}\n',
            encoding="utf-8",
        )
        (source / "tools" / "reasoning-policy.js").write_text(
            'require("./reasoning-vocabulary");\n',
            encoding="utf-8",
        )
        (source / "tools" / "reasoning-vocabulary.js").write_text(
            'module.exports = {};\n',
            encoding="utf-8",
        )
        skill = source / "skills" / "example" / "SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text(
            "Run `python3 scripts/local-helper.py` relative to this skill.\n",
            encoding="utf-8",
        )
        return source

    def test_sync_rewrites_refs_and_commands_for_target_with_spaces(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source = self.make_source(root)
            target = root / "O'Brien (Work); R&D" / "agents pipeline"

            MODULE.sync_support_tree(source, target, dry_run=False)

            agent = (target / "agents" / "orchestrator-flow.md").read_text(
                encoding="utf-8"
            )
            self.assertIn("raw_input", agent)
            self.assertNotIn("$ARGUMENTS", agent)
            self.assertIn(
                f'{target.as_posix()}/protocols/PIPELINE_PROTOCOL.md', agent
            )
            self.assertIn(
                f'node "{target.as_posix()}/tools/status-event.js" --help', agent
            )
            self.assertIn(
                f'node "{target.as_posix()}/tools/reasoning-policy.js" --help',
                agent,
            )
            marker = json.loads(
                (target / MODULE.MARKER_FILE).read_text(encoding="utf-8")
            )
            self.assertEqual(marker["tool"], MODULE.MARKER_TOOL)
            self.assertEqual(marker["version"], MODULE.MARKER_VERSION)
            self.assertTrue((target / "runtimes").is_dir())
            self.assertTrue((target / "scripts").is_dir())
            self.assertTrue((target / "AGENTS.md").is_file())
            self.assertTrue((target / "tools" / "reasoning-policy.js").is_file())
            self.assertTrue((target / "tools" / "reasoning-vocabulary.js").is_file())
            self.assertTrue((target / "protocols" / "reasoning-policy.json").is_file())
            self.assertEqual(
                (target / "VERSION").read_text(encoding="utf-8"), "0.28.0\n"
            )
            protocol = (target / "protocols" / "PIPELINE_PROTOCOL.md").read_text(
                encoding="utf-8"
            )
            self.assertIn(
                f'python3 "{target.as_posix()}/scripts/validate-helper-contracts.py"',
                protocol,
            )
            skill = (target / "skills" / "example" / "SKILL.md").read_text(
                encoding="utf-8"
            )
            self.assertIn("python3 scripts/local-helper.py", skill)
            self.assertNotIn(f"{target.as_posix()}/scripts/local-helper.py", skill)

    def test_sync_rejects_shell_active_target_before_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source = self.make_source(root)
            target = root / "unsafe$target" / "agents-pipeline"

            with self.assertRaisesRegex(ValueError, "shell-active character"):
                MODULE.sync_support_tree(source, target, dry_run=False)

            self.assertFalse(target.exists())
            self.assertFalse(target.parent.exists())

    def test_sync_relocates_refs_from_an_installed_support_source(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source = self.make_source(root)
            first = root / "runtime-a" / "agents-pipeline"
            second = root / "runtime-b" / "agents-pipeline"
            MODULE.sync_support_tree(source, first, dry_run=False)
            MODULE.sync_support_tree(first, second, dry_run=False)

            managed_markdown = [
                second / "agents" / "orchestrator-flow.md",
                second / "protocols" / "PIPELINE_PROTOCOL.md",
            ]
            for path in managed_markdown:
                content = path.read_text(encoding="utf-8")
                with self.subTest(path=path):
                    self.assertNotIn(first.as_posix(), content)
                    self.assertIn(second.as_posix(), content)
            skill = (second / "skills" / "example" / "SKILL.md").read_text(
                encoding="utf-8"
            )
            self.assertIn("python3 scripts/local-helper.py", skill)

    def test_sync_upgrades_previous_marker_version(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source = self.make_source(root)
            target = root / "runtime" / "agents-pipeline"
            MODULE.sync_support_tree(source, target, dry_run=False)
            marker_path = target / MODULE.MARKER_FILE
            marker_path.write_text(
                json.dumps({"tool": MODULE.MARKER_TOOL, "version": 1}),
                encoding="utf-8",
            )
            MODULE.sync_support_tree(source, target, dry_run=False)
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
            self.assertEqual(marker["version"], MODULE.MARKER_VERSION)

    def test_sync_refuses_unowned_or_symlinked_targets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source = self.make_source(root)
            unowned = root / "unowned"
            unowned.mkdir()
            with self.assertRaisesRegex(ValueError, "unowned support directory"):
                MODULE.sync_support_tree(source, unowned, dry_run=False)

            real_target = root / "real-target"
            real_target.mkdir()
            symlink_target = root / "support-link"
            try:
                symlink_target.symlink_to(real_target, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")
            with self.assertRaisesRegex(ValueError, "symbolic link"):
                MODULE.resolve_target(symlink_target.as_posix())

            owned = root / "owned"
            MODULE.sync_support_tree(source, owned, dry_run=False)
            marker_path = owned / MODULE.MARKER_FILE
            external_marker = root / "external-marker.json"
            external_marker.write_text(
                json.dumps(
                    {"tool": MODULE.MARKER_TOOL, "version": MODULE.MARKER_VERSION}
                ),
                encoding="utf-8",
            )
            marker_path.unlink()
            try:
                marker_path.symlink_to(external_marker)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")
            with self.assertRaisesRegex(ValueError, "regular non-link file"):
                MODULE.sync_support_tree(source, owned, dry_run=False)

    def test_sync_preserves_backup_when_install_and_rollback_fail(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source = self.make_source(root)
            target = root / "runtime" / "agents-pipeline"

            MODULE.sync_support_tree(source, target, dry_run=False)
            original_replace = MODULE.os.replace
            replace_calls = 0

            def fail_install_and_rollback(source_path, destination_path):
                nonlocal replace_calls
                replace_calls += 1
                if replace_calls >= 2:
                    raise OSError(f"mock replace failure {replace_calls}")
                return original_replace(source_path, destination_path)

            with mock.patch.object(
                MODULE.os, "replace", side_effect=fail_install_and_rollback
            ):
                with self.assertRaisesRegex(
                    RuntimeError, "previous tree is preserved at"
                ) as raised:
                    MODULE.sync_support_tree(source, target, dry_run=False)

            backup_path = Path(str(raised.exception).rsplit(" at ", 1)[1])
            self.assertTrue(backup_path.is_dir())
            self.assertTrue((backup_path / MODULE.MARKER_FILE).is_file())
            self.assertFalse(target.exists())

    def test_sync_rejects_nested_or_ancestor_targets_but_allows_self_refresh(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source = self.make_source(root)
            with self.assertRaisesRegex(ValueError, "must not contain"):
                MODULE.sync_support_tree(
                    source,
                    source / "scripts" / "nested-support",
                    dry_run=False,
                )
            with self.assertRaisesRegex(ValueError, "must not contain"):
                MODULE.sync_support_tree(source, root, dry_run=False)

            (source / MODULE.MARKER_FILE).write_text(
                json.dumps(
                    {
                        "installed_root": source.resolve().as_posix(),
                        "tool": MODULE.MARKER_TOOL,
                        "version": MODULE.MARKER_VERSION,
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            MODULE.sync_support_tree(source, source, dry_run=False)
            self.assertTrue((source / MODULE.MARKER_FILE).is_file())


if __name__ == "__main__":
    unittest.main()
