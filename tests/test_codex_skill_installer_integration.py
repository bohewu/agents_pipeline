from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
INSTALLER = REPO_ROOT / "scripts" / "install-codex.sh"
WORKFLOW_SKILLS = (
    "run-adaptive",
    "run-simple",
    "run-flow",
    "run-pipeline",
    "run-general",
    "run-spec",
    "run-ci",
    "run-modernize",
    "run-analysis",
    "run-ux",
    "run-committee",
)
CAPABILITY_SKILLS = (
    "artgen-scaffold",
    "devtools-ux-audit",
    "frontend-aesthetic-director",
    "ui-communication-designer",
    "ui-ux-workflow",
)
MANAGED_SKILLS = WORKFLOW_SKILLS + CAPABILITY_SKILLS


class CodexSkillInstallerIntegrationTest(unittest.TestCase):
    def run_installer(
        self,
        home: Path,
        *args: str,
        check: bool = True,
        env_overrides: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        home.mkdir(parents=True, exist_ok=True)
        return subprocess.run(
            ["bash", str(INSTALLER), *args],
            cwd=REPO_ROOT,
            env={
                **os.environ,
                "HOME": str(home),
                **(env_overrides or {}),
            },
            check=check,
            capture_output=True,
            text=True,
        )

    def assert_managed_collection(self, user_skills_root: Path) -> None:
        for name in MANAGED_SKILLS:
            with self.subTest(skill=name):
                skill_root = user_skills_root / name
                self.assertTrue((skill_root / "SKILL.md").is_file())
                skill_text = (skill_root / "SKILL.md").read_text(encoding="utf-8")
                if name in WORKFLOW_SKILLS:
                    mode = name.removeprefix("run-")
                    if name == "run-adaptive":
                        for target in ("simple", "flow", "pipeline"):
                            self.assertIn(f"orchestrator-{target}.toml", skill_text)
                        self.assertNotIn("orchestrator-adaptive.toml", skill_text)
                        self.assertIn("--prompt=off|on", skill_text)
                        self.assertIn(
                            "--preset=balanced|autonomous|careful|delivery|interactive",
                            skill_text,
                        )
                    else:
                        self.assertIn(
                            "${CODEX_HOME:-$HOME/.codex}/agents/"
                            f"orchestrator-{mode}.toml",
                            skill_text,
                        )
                    self.assertIn("profile_eligibility", skill_text)
                    self.assertIn("Always query", skill_text)
                    self.assertIn("workspace without a profile reports global inheritance", skill_text)
                    self.assertIn("status cannot be verified", skill_text)
                    self.assertIn("`health` is not `ok`", skill_text)
                    self.assertIn("never dispatch through an unhealthy or orphaned profile", skill_text)
                    self.assertNotIn("Read `.codex/agents/", skill_text)
                    self.assertNotIn("first consult `.codex/agents/", skill_text)
                openai_metadata = (
                    skill_root / "agents" / "openai.yaml"
                ).read_text(encoding="utf-8")
                self.assertIn(f"${name}", openai_metadata)
                if name in WORKFLOW_SKILLS:
                    self.assertIn("allow_implicit_invocation: false", openai_metadata)
                marker = json.loads(
                    (skill_root / ".agents-pipeline-skill.json").read_text(
                        encoding="utf-8"
                    )
                )
                self.assertEqual(marker["skill_name"], name)
                self.assertEqual(marker["version"], 2)
                self.assertRegex(marker["content_sha256"], r"^[0-9a-f]{64}$")
        self.assertFalse((user_skills_root / "run-goal").exists())

    def test_default_global_install_places_formal_skills_in_user_discovery_root(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            home = Path(raw_temp) / "home"

            result = self.run_installer(home, "--no-backup")

            self.assert_managed_collection(home / ".agents" / "skills")
            self.assertIn("`$run-adaptive`", result.stdout)
            self.assertIn("`$run-pipeline <task>`", result.stdout)
            self.assertIn("compatibility aliases", result.stdout)
            manifest = json.loads(
                (home / ".codex" / ".agents-pipeline-codex-manifest.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(manifest["version"], 4)
            self.assertEqual(manifest["managed_skill_names"], sorted(MANAGED_SKILLS))
            self.assertEqual(manifest["managed_skill_sync_state"], "ready")
            self.assertEqual(
                manifest["managed_user_skills_root"],
                (home / ".agents" / "skills").resolve().as_posix(),
            )
            installed_ui_skill = (
                home / ".agents" / "skills" / "ui-ux-workflow" / "SKILL.md"
            ).read_text(encoding="utf-8")
            self.assertIn(
                (home / ".codex" / "agents-pipeline" / "protocols").as_posix(),
                installed_ui_skill,
            )
            self.assertNotIn("../../protocols/", installed_ui_skill)

    def test_explicit_custom_global_target_requires_explicit_user_skill_root(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            home = root / "home"
            target = root / "custom-codex"

            self.run_installer(home, "--target", str(target), "--no-backup")
            self.assertFalse((home / ".agents" / "skills").exists())

            user_skills = root / "custom-user-skills"
            self.run_installer(
                home,
                "--target",
                str(target),
                "--user-skills-root",
                str(user_skills),
                "--no-backup",
            )
            self.assert_managed_collection(user_skills)

    def test_direct_workspace_materialization_never_installs_user_skills(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            home = root / "home"
            workspace = root / "workspace"
            target = workspace / ".codex"

            self.run_installer(
                home,
                "--target",
                str(target),
                "--workspace-root",
                str(workspace),
                "--no-backup",
            )

            self.assertFalse((home / ".agents" / "skills").exists())
            self.assertFalse((workspace / ".agents" / "skills").exists())
            self.assertTrue((target / "agents-pipeline" / "skills").is_dir())

            rejected = self.run_installer(
                home,
                "--target",
                str(target),
                "--workspace-root",
                str(workspace),
                "--user-skills-root",
                str(root / "must-not-write"),
                "--no-backup",
                check=False,
            )
            self.assertEqual(rejected.returncode, 2)
            self.assertIn("never installs user skills", rejected.stderr)
            self.assertFalse((root / "must-not-write").exists())

    def test_unmarked_managed_skill_is_replaced_and_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            home = root / "home"
            target = root / "custom-codex"
            user_skills = root / "user-skills"
            collision = user_skills / "run-pipeline"
            collision.mkdir(parents=True)
            (collision / "SKILL.md").write_text("user-owned\n", encoding="utf-8")

            self.run_installer(
                home,
                "--target",
                str(target),
                "--user-skills-root",
                str(user_skills),
                "--no-backup",
            )

            self.assert_managed_collection(user_skills)
            self.assertTrue((target / "agents-pipeline").is_dir())
            self.assertNotEqual(
                (collision / "SKILL.md").read_text(encoding="utf-8"),
                "user-owned\n",
            )
            backups = list(
                (
                    user_skills.parent
                    / f".{user_skills.name}.agents-pipeline-backups"
                ).glob("agents-pipeline-skills-*")
            )
            self.assertEqual(len(backups), 1)
            self.assertEqual(
                (backups[0] / "run-pipeline" / "SKILL.md").read_text(
                    encoding="utf-8"
                ),
                "user-owned\n",
            )

    def test_unmarked_support_root_is_replaced_before_skill_install(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            home = root / "home"
            target = root / "custom-codex"
            support = target / "agents-pipeline"
            support.mkdir(parents=True)
            (support / "user.txt").write_text("preserve\n", encoding="utf-8")
            user_skills = root / "user-skills"

            self.run_installer(
                home,
                "--target",
                str(target),
                "--user-skills-root",
                str(user_skills),
                "--no-backup",
            )

            self.assert_managed_collection(user_skills)
            self.assertTrue((support / ".agents-pipeline-support.json").is_file())
            self.assertFalse((support / "user.txt").exists())

    def test_actual_role_export_failure_leaves_discovery_skills_untouched(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            home = root / "home"
            fake_bin = root / "bin"
            fake_bin.mkdir()
            python_wrapper = fake_bin / "python3"
            python_wrapper.write_text(
                f"""#!{sys.executable}
import os
import sys

if (
    len(sys.argv) > 1
    and sys.argv[1].endswith("/scripts/install-codex-config.py")
    and "--dry-run" not in sys.argv[2:]
):
    raise SystemExit(97)
os.execv({sys.executable!r}, [{sys.executable!r}, *sys.argv[1:]])
""",
                encoding="utf-8",
            )
            python_wrapper.chmod(0o755)

            result = self.run_installer(
                home,
                "--no-backup",
                check=False,
                env_overrides={
                    "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}"
                },
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Codex role export", result.stderr)
            self.assertFalse((home / ".agents" / "skills").exists())
            self.assertFalse((home / ".codex" / "agents-pipeline").exists())

    def test_skill_sync_failure_leaves_manifest_pending_and_health_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            home = root / "home"
            self.run_installer(home, "--no-backup")
            fake_bin = root / "bin"
            fake_bin.mkdir()
            python_wrapper = fake_bin / "python3"
            python_wrapper.write_text(
                f"""#!{sys.executable}
import os
import sys

if (
    len(sys.argv) > 1
    and sys.argv[1].endswith("/scripts/sync-codex-skills.py")
    and "--dry-run" not in sys.argv[2:]
):
    raise SystemExit(98)
os.execv({sys.executable!r}, [{sys.executable!r}, *sys.argv[1:]])
""",
                encoding="utf-8",
            )
            python_wrapper.chmod(0o755)

            failed = self.run_installer(
                home,
                "--no-backup",
                check=False,
                env_overrides={
                    "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}"
                },
            )

            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("Codex skill sync failed", failed.stderr)
            target = home / ".codex"
            manifest = json.loads(
                (target / ".agents-pipeline-codex-manifest.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(manifest["managed_skill_sync_state"], "pending")
            status = subprocess.run(
                [
                    sys.executable,
                    str(target / "agents-pipeline" / "tools" / "agent-profile.py"),
                    "status",
                    "--runtime",
                    "codex",
                    "--scope",
                    "global",
                    "--target",
                    str(target),
                    "--json",
                ],
                cwd=REPO_ROOT,
                env={**os.environ, "HOME": str(home)},
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(status.stdout)
            self.assertEqual(payload["health"], "incomplete")
            self.assertIn("skills:sync-pending", payload["missing_generated_files"])

    def test_legacy_capability_skill_is_replaced_without_migration_flag(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            home = root / "home"
            legacy = home / ".agents" / "skills" / "artgen-scaffold"
            legacy.mkdir(parents=True)
            legacy_text = (
                "---\nname: artgen-scaffold\ndescription: Legacy copy.\n---\n\nLegacy.\n"
            )
            (legacy / "SKILL.md").write_text(legacy_text, encoding="utf-8")

            self.run_installer(home, "--no-backup")
            self.assert_managed_collection(home / ".agents" / "skills")
            backups = list(
                (home / ".agents" / ".skills.agents-pipeline-backups").glob(
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

    def test_global_status_detects_modified_discovery_skill(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            home = Path(raw_temp) / "home"
            self.run_installer(home, "--no-backup")
            target = home / ".codex"
            profile_tool = target / "agents-pipeline" / "tools" / "agent-profile.py"

            def status() -> dict[str, object]:
                result = subprocess.run(
                    [
                        sys.executable,
                        str(profile_tool),
                        "status",
                        "--runtime",
                        "codex",
                        "--scope",
                        "global",
                        "--target",
                        str(target),
                        "--json",
                    ],
                    cwd=REPO_ROOT,
                    env={**os.environ, "HOME": str(home)},
                    check=True,
                    capture_output=True,
                    text=True,
                )
                return json.loads(result.stdout)

            healthy = status()
            self.assertEqual(healthy["health"], "ok")
            self.assertEqual(healthy["managed_skill_count"], len(MANAGED_SKILLS))

            modified = home / ".agents" / "skills" / "ui-ux-workflow" / "SKILL.md"
            modified.write_text(
                modified.read_text(encoding="utf-8") + "\nlocal mutation\n",
                encoding="utf-8",
            )
            unhealthy = status()
            self.assertEqual(unhealthy["health"], "incomplete")
            self.assertIn(
                "skills:ui-ux-workflow/integrity",
                unhealthy["missing_generated_files"],
            )

            self.run_installer(home, "--no-backup")
            repaired = status()
            self.assertEqual(repaired["health"], "ok")
            backups = list(
                (home / ".agents" / ".skills.agents-pipeline-backups").glob(
                    "agents-pipeline-skills-*"
                )
            )
            self.assertEqual(len(backups), 1)
            self.assertIn(
                "local mutation",
                (backups[0] / "ui-ux-workflow" / "SKILL.md").read_text(
                    encoding="utf-8"
                ),
            )


if __name__ == "__main__":
    unittest.main()
