import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
INSTALL_SCRIPT = REPO_ROOT / "scripts" / "install-codex.sh"


@unittest.skipUnless(shutil.which("bash"), "bash is required for shell installer tests")
class CodexShellInstallerTargetValidationTest(unittest.TestCase):
    def run_installer(
        self, target: str, *extra: str, env: dict[str, str] | None = None
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "bash",
                str(INSTALL_SCRIPT),
                "--target",
                target,
                "--dry-run",
                "--no-backup",
                *extra,
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )

    def assert_target_error(self, target: str, expected_message: str) -> None:
        result = self.run_installer(target)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(expected_message, result.stderr)

    def test_rejects_explicit_empty_or_whitespace_target(self) -> None:
        for target in ("", "   "):
            with self.subTest(target=target):
                self.assert_target_error(
                    target, "Target path must not be empty or whitespace."
                )

    def test_rejects_switch_like_target(self) -> None:
        for target in ("--dry-run", "  --dry-run"):
            with self.subTest(target=target):
                self.assert_target_error(target, "looks like a switch")

    def test_rejects_existing_file_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "target-file"
            target.write_text("not a directory", encoding="utf-8")
            self.assert_target_error(str(target), "Target path is not a directory:")

    def test_dry_run_preserves_and_rejects_unowned_support_tree(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "codex home"
            support = target / "agents-pipeline"
            support.mkdir(parents=True)
            sentinel = support / "user-owned.txt"
            sentinel.write_text("preserve me", encoding="utf-8")

            self.assert_target_error(str(target), "unowned support directory")
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve me")

    def test_dry_run_rejects_symlinked_config_before_support_sync(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            target = root / "codex home"
            target.mkdir()
            victim = root / "victim.toml"
            victim.write_text("preserve = true\n", encoding="utf-8")
            try:
                (target / "config.toml").symlink_to(victim)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")

            self.assert_target_error(str(target), "must not be a symbolic link")
            self.assertFalse((target / "agents-pipeline").exists())
            self.assertEqual(
                victim.read_text(encoding="utf-8"), "preserve = true\n"
            )

    def test_global_install_rejects_named_and_uniform_model_profiles(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "global-codex"
            cases = (
                ("--agent-profile", "balanced", "--model-set", "openai"),
                ("--uniform-model", "gpt-5.6-terra"),
            )
            for flags in cases:
                with self.subTest(flags=flags):
                    result = self.run_installer(str(target), *flags)
                    self.assertEqual(result.returncode, 2, result.stdout)
                    self.assertIn("workspace-only", result.stderr)
                    self.assertFalse(target.exists())

    def test_global_agents_target_does_not_bypass_workspace_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            target = root / "global-codex"
            result = self.run_installer(
                str(target),
                "--global-agents-target",
                str(root / "other-global-target"),
                "--agent-profile",
                "balanced",
                "--model-set",
                "openai",
            )
            self.assertEqual(result.returncode, 2, result.stdout)
            self.assertIn("workspace-only", result.stderr)
            self.assertFalse(target.exists())

    def test_default_global_target_cannot_be_disguised_as_a_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir) / "home"
            target = home / ".codex"
            env = {**os.environ, "HOME": str(home), "CODEX_HOME": str(target)}
            result = self.run_installer(
                str(target),
                "--workspace-root",
                str(home),
                "--agent-profile",
                "balanced",
                "--model-set",
                "openai",
                env=env,
            )
            self.assertEqual(result.returncode, 2, result.stdout)
            self.assertIn("workspace-only", result.stderr)
            self.assertFalse(target.exists())

    def test_canonical_workspace_materialization_accepts_model_profile(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir) / "project"
            target = workspace / ".codex"
            result = self.run_installer(
                str(target),
                "--workspace-root",
                str(workspace),
                "--agent-profile",
                "balanced",
                "--model-set",
                "openai",
            )
            self.assertEqual(
                result.returncode,
                0,
                f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}",
            )
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
