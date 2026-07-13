from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
INSTALLER = REPO_ROOT / "scripts" / "install-codex.sh"
MANAGED_SKILLS = (
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


class CodexSkillInstallerIntegrationTest(unittest.TestCase):
    def run_installer(
        self, home: Path, *args: str, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        home.mkdir(parents=True, exist_ok=True)
        return subprocess.run(
            ["bash", str(INSTALLER), *args],
            cwd=REPO_ROOT,
            env={**os.environ, "HOME": str(home)},
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
                self.assertIn("allow_implicit_invocation: false", openai_metadata)
                marker = json.loads(
                    (skill_root / ".agents-pipeline-skill.json").read_text(
                        encoding="utf-8"
                    )
                )
                self.assertEqual(marker["skill_name"], name)
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

    def test_unowned_skill_collision_fails_before_codex_target_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            home = root / "home"
            target = root / "custom-codex"
            user_skills = root / "user-skills"
            collision = user_skills / "run-pipeline"
            collision.mkdir(parents=True)
            (collision / "SKILL.md").write_text("user-owned\n", encoding="utf-8")

            result = self.run_installer(
                home,
                "--target",
                str(target),
                "--user-skills-root",
                str(user_skills),
                "--no-backup",
                check=False,
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("unowned skill directory", result.stderr)
            self.assertFalse(target.exists())
            self.assertEqual(
                (collision / "SKILL.md").read_text(encoding="utf-8"),
                "user-owned\n",
            )


if __name__ == "__main__":
    unittest.main()
