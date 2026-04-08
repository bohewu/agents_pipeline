import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[1]
EXPORT_SCRIPT_PATH = REPO_ROOT / "scripts" / "export-codex-agents.py"
INSTALL_SCRIPT_PATH = REPO_ROOT / "scripts" / "install-codex-config.py"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


EXPORT_MODULE = load_module("export_codex_agents", EXPORT_SCRIPT_PATH)
INSTALL_MODULE = load_module("install_codex_config", INSTALL_SCRIPT_PATH)


class CodexInstallExportTest(unittest.TestCase):
    def test_exporter_default_max_depth_is_two(self) -> None:
        self.assertEqual(EXPORT_MODULE.DEFAULT_MAX_DEPTH, 2)

    def test_installer_default_max_depth_is_two(self) -> None:
        self.assertEqual(INSTALL_MODULE.DEFAULT_MAX_DEPTH, 2)

    def test_resolve_temp_root_defaults_to_repo_tmp(self) -> None:
        repo_root = Path("C:/tmp/repo")
        self.assertEqual(
            INSTALL_MODULE.resolve_temp_root(repo_root=repo_root, temp_dir=None),
            repo_root / ".tmp",
        )

    def test_resolve_temp_root_honors_override(self) -> None:
        repo_root = Path("C:/tmp/repo")
        override = Path("C:/override/temp")
        self.assertEqual(
            INSTALL_MODULE.resolve_temp_root(
                repo_root=repo_root, temp_dir=override.as_posix()
            ),
            override,
        )

    def test_run_export_creates_temp_dir_under_requested_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_root = Path(temp_dir_name) / "workspace-temp"
            fake_result = mock.Mock(returncode=0, stdout="", stderr="")

            with mock.patch.object(INSTALL_MODULE.subprocess, "run", return_value=fake_result):
                generated_dir = INSTALL_MODULE.run_export(
                    Path("export-codex-agents.py"),
                    Path("opencode/agents"),
                    Path("AGENTS.md"),
                    strict=True,
                    max_threads=6,
                    max_depth=2,
                    job_max_runtime_seconds=None,
                    temp_root=temp_root,
                )

            self.assertEqual(generated_dir.parent, temp_root)
            self.assertTrue(generated_dir.exists())

    def test_run_export_wraps_temp_root_creation_failures(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_root = Path(temp_dir_name) / "not-a-directory"
            temp_root.write_text("x", encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, r"Unable to create temp dir under"):
                INSTALL_MODULE.run_export(
                    Path("export-codex-agents.py"),
                    Path("opencode/agents"),
                    Path("AGENTS.md"),
                    strict=True,
                    max_threads=6,
                    max_depth=2,
                    job_max_runtime_seconds=None,
                    temp_root=temp_root,
                )


if __name__ == "__main__":
    unittest.main()
