from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "sync-codex-skills.py"


def load_module():
    spec = importlib.util.spec_from_file_location("sync_codex_skills", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


MODULE = load_module()


class CodexSkillSyncTest(unittest.TestCase):
    def make_source(self, root: Path) -> Path:
        source = root / "skills"
        source.mkdir()
        for name in MODULE.MANAGED_SKILL_NAMES:
            skill = source / name
            (skill / "agents").mkdir(parents=True)
            (skill / "SKILL.md").write_text(
                f"---\nname: {name}\ndescription: Test {name}.\n---\n\n# {name}\n",
                encoding="utf-8",
            )
            (skill / "agents" / "openai.yaml").write_text(
                f'name: "{name}"\n', encoding="utf-8"
            )
        return source

    def test_sync_installs_exact_managed_collection_with_ownership(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "home" / ".agents" / "skills"
            support = root / "home" / ".codex" / "agents-pipeline"

            MODULE.sync_managed_skills(source, target, support, dry_run=False)

            self.assertEqual(
                sorted(path.name for path in target.iterdir() if path.is_dir()),
                sorted(MODULE.MANAGED_SKILL_NAMES),
            )
            self.assertFalse((target / "run-goal").exists())
            for name in MODULE.MANAGED_SKILL_NAMES:
                with self.subTest(skill=name):
                    skill_root = target / name
                    self.assertTrue((skill_root / "SKILL.md").is_file())
                    marker = json.loads(
                        (skill_root / MODULE.MARKER_FILE).read_text(encoding="utf-8")
                    )
                    self.assertEqual(marker["tool"], MODULE.MARKER_TOOL)
                    self.assertEqual(marker["version"], MODULE.MARKER_VERSION)
                    self.assertEqual(marker["skill_name"], name)
                    self.assertEqual(
                        marker["installed_root"], skill_root.resolve().as_posix()
                    )
                    self.assertEqual(
                        marker["content_sha256"],
                        MODULE.expected_skill_marker(skill_root, name)["content_sha256"],
                    )

    def test_repeat_sync_refreshes_owned_skills(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            support = root / "global-support"
            MODULE.sync_managed_skills(source, target, support, dry_run=False)
            (source / "run-pipeline" / "SKILL.md").write_text(
                "---\nname: run-pipeline\ndescription: Updated.\n---\n\nUpdated.\n",
                encoding="utf-8",
            )

            MODULE.sync_managed_skills(source, target, support, dry_run=False)

            self.assertIn(
                "Updated.",
                (target / "run-pipeline" / "SKILL.md").read_text(encoding="utf-8"),
            )

    def test_v1_marker_upgrade_preserves_possible_user_edits(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            support = root / "global-support"
            MODULE.sync_managed_skills(source, target, support, dry_run=False)

            v1_skill = target / "run-pipeline"
            edited_text = (
                v1_skill.joinpath("SKILL.md").read_text(encoding="utf-8")
                + "\nPossible V1 user edit.\n"
            )
            v1_skill.joinpath("SKILL.md").write_text(edited_text, encoding="utf-8")
            v1_skill.joinpath(MODULE.MARKER_FILE).write_text(
                json.dumps(MODULE._legacy_marker(v1_skill, "run-pipeline")) + "\n",
                encoding="utf-8",
            )

            MODULE.sync_managed_skills(source, target, support, dry_run=False)

            backups = list(
                (target.parent / ".user-skills.agents-pipeline-backups").glob(
                    "agents-pipeline-skills-*"
                )
            )
            self.assertEqual(len(backups), 1)
            self.assertEqual(
                (backups[0] / "run-pipeline" / "SKILL.md").read_text(
                    encoding="utf-8"
                ),
                edited_text,
            )
            upgraded_marker = json.loads(
                (v1_skill / MODULE.MARKER_FILE).read_text(encoding="utf-8")
            )
            self.assertEqual(upgraded_marker["version"], 2)

    def test_dry_run_does_not_create_user_skill_root(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "missing" / "skills"

            MODULE.sync_managed_skills(
                source, target, root / "support", dry_run=True
            )

            self.assertFalse(target.exists())

    def test_sync_replaces_markerless_target_with_backup_and_refuses_linked_root(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            unowned = target / "run-pipeline"
            unowned.mkdir(parents=True)
            (unowned / "SKILL.md").write_text("user content\n", encoding="utf-8")

            MODULE.sync_managed_skills(source, target, root / "support", dry_run=False)

            self.assertTrue((unowned / MODULE.MARKER_FILE).is_file())
            self.assertEqual(
                (unowned / "SKILL.md").read_text(encoding="utf-8"),
                (source / "run-pipeline" / "SKILL.md").read_text(encoding="utf-8"),
            )
            backups = list(
                (target.parent / ".user-skills.agents-pipeline-backups").glob(
                    "agents-pipeline-skills-*"
                )
            )
            self.assertEqual(len(backups), 1)
            self.assertEqual(
                (backups[0] / "run-pipeline" / "SKILL.md").read_text(
                    encoding="utf-8"
                ),
                "user content\n",
            )

            real = root / "real-skills"
            real.mkdir()
            linked_root = root / "linked-skills"
            try:
                linked_root.symlink_to(real, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")
            with self.assertRaisesRegex(MODULE.SkillSyncError, "must not traverse"):
                MODULE.sync_managed_skills(
                    source, linked_root, root / "support", dry_run=False
                )

            linked_target_root = root / "linked-managed-target"
            linked_target_root.mkdir()
            external_target = root / "external-skill"
            external_target.mkdir()
            try:
                (linked_target_root / "run-pipeline").symlink_to(
                    external_target,
                    target_is_directory=True,
                )
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")
            with self.assertRaisesRegex(MODULE.SkillSyncError, "real directory"):
                MODULE.sync_managed_skills(
                    source, linked_target_root, root / "support", dry_run=False
                )

    def test_marker_read_error_is_opaque_stale_state(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            target = root / "user-skills" / "run-pipeline"
            target.mkdir(parents=True)
            marker_path = target / MODULE.MARKER_FILE
            marker_path.write_text("{}\n", encoding="utf-8")
            original_read_text = Path.read_text

            def deny_marker_read(path: Path, *args, **kwargs):
                if path == marker_path:
                    raise PermissionError("marker access denied")
                return original_read_text(path, *args, **kwargs)

            with mock.patch.object(
                Path, "read_text", autospec=True, side_effect=deny_marker_read
            ), mock.patch.object(MODULE, "_validate_regular_tree") as validate_tree:
                state = MODULE.validate_existing_target(
                    target,
                    "run-pipeline",
                )

            self.assertEqual(state, "stale")
            validate_tree.assert_not_called()

    def test_sync_refuses_linked_source_content(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            external = root / "external.yaml"
            external.write_text("external\n", encoding="utf-8")
            linked = source / "run-pipeline" / "agents" / "linked.yaml"
            try:
                linked.symlink_to(external)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")

            with self.assertRaisesRegex(MODULE.SkillSyncError, "must not contain"):
                MODULE.sync_managed_skills(
                    source, root / "target", root / "support", dry_run=False
                )

    def test_sync_refuses_existing_root_below_linked_ancestor(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            real_parent = root / "real-parent"
            target = real_parent / "skills"
            target.mkdir(parents=True)
            linked_parent = root / "linked-parent"
            try:
                linked_parent.symlink_to(real_parent, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")

            with self.assertRaisesRegex(MODULE.SkillSyncError, "must not traverse"):
                MODULE.sync_managed_skills(
                    source,
                    linked_parent / "skills",
                    root / "support",
                    dry_run=True,
                )
            self.assertEqual(list(target.iterdir()), [])

    def test_sync_rejects_overlapping_roots_and_name_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            with self.assertRaisesRegex(MODULE.SkillSyncError, "must not overlap"):
                MODULE.sync_managed_skills(
                    source, source / "nested", root / "support", dry_run=False
                )

            (source / "run-flow" / "SKILL.md").write_text(
                "---\nname: wrong-name\ndescription: Wrong.\n---\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(MODULE.SkillSyncError, "name mismatch"):
                MODULE.sync_managed_skills(
                    source, root / "target", root / "support", dry_run=False
                )

    def test_install_failure_restores_every_previous_skill(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            support = root / "support"
            MODULE.sync_managed_skills(source, target, support, dry_run=False)
            original = {
                name: (target / name / "SKILL.md").read_bytes()
                for name in MODULE.MANAGED_SKILL_NAMES
            }
            (source / "run-simple" / "SKILL.md").write_text(
                "---\nname: run-simple\ndescription: Changed.\n---\n",
                encoding="utf-8",
            )

            real_replace = MODULE.os.replace
            staging_installs = 0

            def fail_during_install(source_path, destination_path):
                nonlocal staging_installs
                source_text = os.fspath(source_path)
                if ".agents-pipeline-skills.staging-" in source_text:
                    staging_installs += 1
                    if staging_installs == 3:
                        raise OSError("simulated collection install failure")
                return real_replace(source_path, destination_path)

            with mock.patch.object(MODULE.os, "replace", side_effect=fail_during_install):
                with self.assertRaisesRegex(
                    MODULE.SkillSyncError, "Managed skill installation failed"
                ):
                    MODULE.sync_managed_skills(
                        source, target, support, dry_run=False
                    )

            for name, expected in original.items():
                with self.subTest(skill=name):
                    self.assertEqual((target / name / "SKILL.md").read_bytes(), expected)

    def test_rollback_cleanup_failure_reports_failed_tree(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            support = root / "support"
            real_rmtree = MODULE.shutil.rmtree

            def fail_failed_tree_cleanup(path, *args, **kwargs):
                candidate = Path(path)
                if candidate.name.startswith(".agents-pipeline-skills.failed-"):
                    raise OSError("simulated failed-tree cleanup failure")
                return real_rmtree(path, *args, **kwargs)

            with mock.patch.object(
                MODULE,
                "_verify_installed_skill",
                side_effect=MODULE.SkillSyncError("simulated verification failure"),
            ), mock.patch.object(
                MODULE.shutil,
                "rmtree",
                side_effect=fail_failed_tree_cleanup,
            ):
                with self.assertRaisesRegex(
                    RuntimeError, "recovery data is preserved at"
                ) as raised:
                    MODULE.sync_managed_skills(
                        source, target, support, dry_run=False
                    )

            reported_root = Path(str(raised.exception).rsplit(" at ", 1)[1])
            stranded_name = MODULE.MANAGED_SKILL_NAMES[0]
            self.assertTrue(reported_root.is_dir())
            self.assertTrue(
                (reported_root / stranded_name / "SKILL.md").is_file()
            )

    def test_committed_backup_cleanup_failure_preserves_backup_and_succeeds(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            support = root / "support"
            skill_name = "run-adaptive"
            MODULE.sync_managed_skills(source, target, support, dry_run=False)
            previous_text = (target / skill_name / "SKILL.md").read_text(
                encoding="utf-8"
            )
            updated_text = (
                f"---\nname: {skill_name}\ndescription: Updated.\n---\n\nUpdated.\n"
            )
            (source / skill_name / "SKILL.md").write_text(
                updated_text, encoding="utf-8"
            )
            failed_backups: list[Path] = []
            real_rmtree = MODULE.shutil.rmtree

            def fail_previous_backup_cleanup(path, *args, **kwargs):
                candidate = Path(path)
                if candidate.name.startswith(".agents-pipeline-skills.backup-"):
                    failed_backups.append(candidate)
                    raise OSError("simulated backup cleanup failure")
                return real_rmtree(path, *args, **kwargs)

            with mock.patch.object(
                MODULE.shutil,
                "rmtree",
                side_effect=fail_previous_backup_cleanup,
            ), mock.patch("builtins.print") as reported:
                result = MODULE.sync_managed_skills(
                    source, target, support, dry_run=False
                )

            self.assertIsNone(result)
            self.assertEqual(len(failed_backups), 1)
            backup_root = failed_backups[0]
            self.assertTrue(backup_root.is_dir())
            self.assertEqual(
                (backup_root / skill_name / "SKILL.md").read_text(encoding="utf-8"),
                previous_text,
            )
            self.assertEqual(
                (target / skill_name / "SKILL.md").read_text(encoding="utf-8"),
                updated_text,
            )
            reported.assert_called_once_with(
                f"Previous-version skill backup preserved at: {backup_root}"
            )

    def test_sync_rewrites_repo_support_references(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            support = root / "codex" / "agents-pipeline"
            skill_md = source / "ui-ux-workflow" / "SKILL.md"
            skill_md.write_text(
                "---\nname: ui-ux-workflow\ndescription: Test.\n---\n\n"
                "Read `../../protocols/UI_UX_WORKFLOW.md`.\n",
                encoding="utf-8",
            )

            MODULE.sync_managed_skills(source, target, support, dry_run=False)

            installed = (target / "ui-ux-workflow" / "SKILL.md").read_text(
                encoding="utf-8"
            )
            self.assertIn(
                f"`{support.resolve().as_posix()}/protocols/UI_UX_WORKFLOW.md`",
                installed,
            )
            self.assertNotIn("../../protocols/", installed)

    def test_markerless_capability_skill_is_replaced_without_migration_flag(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            support = root / "support"
            legacy = target / "artgen-scaffold"
            legacy.mkdir(parents=True)
            legacy_text = (
                "---\nname: artgen-scaffold\ndescription: Legacy copy.\n---\n\nLegacy.\n"
            )
            (legacy / "SKILL.md").write_text(legacy_text, encoding="utf-8")

            MODULE.sync_managed_skills(source, target, support, dry_run=False)

            backups = list(
                (target.parent / ".user-skills.agents-pipeline-backups").glob(
                    "agents-pipeline-skills-*"
                )
            )
            self.assertEqual(len(backups), 1)
            self.assertEqual(
                (backups[0] / "artgen-scaffold" / "SKILL.md").read_text(
                    encoding="utf-8"
                ),
                legacy_text,
            )
            self.assertTrue((legacy / MODULE.MARKER_FILE).is_file())

    def test_windows_acl_reset_is_applied_to_completed_staging_root(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            completed = mock.Mock(returncode=0, stdout="", stderr="")

            with mock.patch.object(MODULE.sys, "platform", "win32"), mock.patch.object(
                MODULE.subprocess, "run", return_value=completed
            ) as icacls:
                MODULE.sync_managed_skills(
                    source, target, root / "support", dry_run=False
                )

            icacls.assert_called_once()
            command = icacls.call_args.args[0]
            staging_root = Path(command[1])
            self.assertEqual(command[0], "icacls")
            self.assertEqual(command[2:], ["/reset", "/T", "/C"])
            self.assertEqual(staging_root.parent, target)
            self.assertTrue(
                staging_root.name.startswith(".agents-pipeline-skills.staging-")
            )

    def test_windows_acl_failure_leaves_existing_skills_untouched(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            support = root / "support"
            MODULE.sync_managed_skills(source, target, support, dry_run=False)
            original = (target / "run-adaptive" / "SKILL.md").read_bytes()
            failed_acl = mock.Mock(
                returncode=1,
                stdout="",
                stderr="Access is denied.",
            )

            with mock.patch.object(MODULE.sys, "platform", "win32"), mock.patch.object(
                MODULE.subprocess, "run", return_value=failed_acl
            ):
                with self.assertRaises(MODULE.SkillSyncError) as raised:
                    MODULE.sync_managed_skills(source, target, support, dry_run=False)

            self.assertIn(".agents-pipeline-skills.staging-", str(raised.exception))
            self.assertEqual(
                (target / "run-adaptive" / "SKILL.md").read_bytes(), original
            )

    def test_modified_owned_skill_is_preserved_and_repaired(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            support = root / "support"
            MODULE.sync_managed_skills(source, target, support, dry_run=False)
            modified = target / "ui-ux-workflow" / "SKILL.md"
            modified_text = modified.read_text(encoding="utf-8") + "\nUser edit.\n"
            modified.write_text(modified_text, encoding="utf-8")

            MODULE.sync_managed_skills(source, target, support, dry_run=False)

            self.assertNotIn(
                "User edit.", modified.read_text(encoding="utf-8")
            )
            backups = list(
                (target.parent / ".user-skills.agents-pipeline-backups").glob(
                    "agents-pipeline-skills-*"
                )
            )
            self.assertEqual(len(backups), 1)
            self.assertEqual(
                (backups[0] / "ui-ux-workflow" / "SKILL.md").read_text(
                    encoding="utf-8"
                ),
                modified_text,
            )


if __name__ == "__main__":
    unittest.main()
