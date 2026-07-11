import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
INSTALL_SCRIPT = REPO_ROOT / "scripts" / "install-codex.sh"


@unittest.skipUnless(shutil.which("bash"), "bash is required for shell installer tests")
class CodexShellInstallerTargetValidationTest(unittest.TestCase):
    def run_installer(self, target: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "bash",
                str(INSTALL_SCRIPT),
                "--target",
                target,
                "--dry-run",
                "--no-backup",
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
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


if __name__ == "__main__":
    unittest.main()
