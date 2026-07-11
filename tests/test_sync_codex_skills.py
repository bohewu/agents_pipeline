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

            MODULE.sync_managed_skills(source, target, dry_run=False)

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

    def test_repeat_sync_refreshes_owned_skills(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            MODULE.sync_managed_skills(source, target, dry_run=False)
            (source / "run-pipeline" / "SKILL.md").write_text(
                "---\nname: run-pipeline\ndescription: Updated.\n---\n\nUpdated.\n",
                encoding="utf-8",
            )

            MODULE.sync_managed_skills(source, target, dry_run=False)

            self.assertIn(
                "Updated.",
                (target / "run-pipeline" / "SKILL.md").read_text(encoding="utf-8"),
            )

    def test_dry_run_does_not_create_user_skill_root(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "missing" / "skills"

            MODULE.sync_managed_skills(source, target, dry_run=True)

            self.assertFalse(target.exists())

    def test_sync_refuses_unowned_and_linked_targets(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            unowned = target / "run-pipeline"
            unowned.mkdir(parents=True)
            (unowned / "SKILL.md").write_text("user content\n", encoding="utf-8")

            with self.assertRaisesRegex(MODULE.SkillSyncError, "unowned skill"):
                MODULE.sync_managed_skills(source, target, dry_run=False)
            self.assertEqual(
                (unowned / "SKILL.md").read_text(encoding="utf-8"), "user content\n"
            )

            unowned.rename(target / "saved")
            real = root / "real-skills"
            real.mkdir()
            linked_root = root / "linked-skills"
            try:
                linked_root.symlink_to(real, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")
            with self.assertRaisesRegex(MODULE.SkillSyncError, "must not traverse"):
                MODULE.sync_managed_skills(source, linked_root, dry_run=False)

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
                MODULE.sync_managed_skills(source, root / "target", dry_run=False)

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
                    dry_run=True,
                )
            self.assertEqual(list(target.iterdir()), [])

    def test_sync_rejects_overlapping_roots_and_name_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            with self.assertRaisesRegex(MODULE.SkillSyncError, "must not overlap"):
                MODULE.sync_managed_skills(source, source / "nested", dry_run=False)

            (source / "run-flow" / "SKILL.md").write_text(
                "---\nname: wrong-name\ndescription: Wrong.\n---\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(MODULE.SkillSyncError, "name mismatch"):
                MODULE.sync_managed_skills(source, root / "target", dry_run=False)

    def test_install_failure_restores_every_previous_skill(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            source = self.make_source(root)
            target = root / "user-skills"
            MODULE.sync_managed_skills(source, target, dry_run=False)
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
                    MODULE.sync_managed_skills(source, target, dry_run=False)

            for name, expected in original.items():
                with self.subTest(skill=name):
                    self.assertEqual((target / name / "SKILL.md").read_bytes(), expected)


if __name__ == "__main__":
    unittest.main()
