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

    def test_resolve_asset_layout_uses_installed_support_tree_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            installed_root = Path(temp_dir_name)
            for dirname in ("agents", "commands", "protocols", "tools", "scripts"):
                (installed_root / dirname).mkdir(parents=True, exist_ok=True)
            (installed_root / "scripts" / "install-codex-config.py").write_text(
                "", encoding="utf-8"
            )
            (installed_root / "scripts" / "export-codex-agents.py").write_text(
                "", encoding="utf-8"
            )

            layout = INSTALL_MODULE.resolve_asset_layout(
                installed_root / "scripts" / "install-codex-config.py"
            )

            self.assertEqual(layout.name, "installed")
            self.assertEqual(layout.asset_root, installed_root)
            self.assertEqual(layout.support_tree_source, installed_root)
            self.assertEqual(
                layout.export_script,
                installed_root / "scripts" / "export-codex-agents.py",
            )
            self.assertNotEqual(
                layout.support_tree_source,
                installed_root / "opencode",
            )

    def test_resolve_asset_layout_preserves_repo_bundle_support_tree(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            repo_root = Path(temp_dir_name)
            for dirname in ("agents", "commands", "protocols", "tools"):
                (repo_root / "opencode" / dirname).mkdir(parents=True, exist_ok=True)
            (repo_root / "scripts").mkdir(parents=True, exist_ok=True)
            (repo_root / "scripts" / "install-codex-config.py").write_text(
                "", encoding="utf-8"
            )
            (repo_root / "scripts" / "export-codex-agents.py").write_text(
                "", encoding="utf-8"
            )

            layout = INSTALL_MODULE.resolve_asset_layout(
                repo_root / "scripts" / "install-codex-config.py"
            )

            self.assertEqual(layout.name, "repo")
            self.assertEqual(layout.asset_root, repo_root)
            self.assertEqual(layout.support_tree_source, repo_root / "opencode")
            self.assertEqual(
                layout.export_script,
                repo_root / "scripts" / "export-codex-agents.py",
            )

    def test_run_export_creates_temp_dir_under_requested_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_root = Path(temp_dir_name) / "workspace-temp"
            fake_result = mock.Mock(returncode=0, stdout="", stderr="")

            with mock.patch.object(
                INSTALL_MODULE.subprocess, "run", return_value=fake_result
            ):
                generated_dir = INSTALL_MODULE.run_export(
                    Path("export-codex-agents.py"),
                    Path("opencode/agents"),
                    Path("AGENTS.md"),
                    strict=True,
                    max_threads=6,
                    max_depth=2,
                    job_max_runtime_seconds=None,
                    temp_root=temp_root,
                    resolve_opencode_refs_to=None,
                )

            self.assertEqual(generated_dir.parent, temp_root)
            self.assertTrue(generated_dir.exists())

    def test_run_export_wraps_temp_root_creation_failures(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_root = Path(temp_dir_name) / "not-a-directory"
            temp_root.write_text("x", encoding="utf-8")

            with self.assertRaisesRegex(
                RuntimeError, r"Unable to create temp dir under"
            ):
                INSTALL_MODULE.run_export(
                    Path("export-codex-agents.py"),
                    Path("opencode/agents"),
                    Path("AGENTS.md"),
                    strict=True,
                    max_threads=6,
                    max_depth=2,
                    job_max_runtime_seconds=None,
                    temp_root=temp_root,
                    resolve_opencode_refs_to=None,
                )

    def test_exporter_rewrites_repo_managed_refs_without_touching_source_comments(
        self,
    ) -> None:
        body = (
            "# Source: C:/repo/opencode/agents/orchestrator-pipeline.md\n"
            "Use `opencode/protocols/PIPELINE_PROTOCOL.md` and `opencode/skills/codex-imagegen/SKILL.md`.\n"
        )
        rewritten = EXPORT_MODULE.rewrite_opencode_refs(
            body, "/home/test/.codex/opencode"
        )
        self.assertIn(
            "# Source: C:/repo/opencode/agents/orchestrator-pipeline.md", rewritten
        )
        self.assertIn(
            "`/home/test/.codex/opencode/protocols/PIPELINE_PROTOCOL.md`", rewritten
        )
        self.assertIn(
            "`/home/test/.codex/opencode/skills/codex-imagegen/SKILL.md`", rewritten
        )

    def test_build_export_command_forwards_opencode_ref_root(self) -> None:
        command = INSTALL_MODULE.build_export_command(
            Path("scripts/export-codex-agents.py"),
            Path("opencode/agents"),
            Path("AGENTS.md"),
            Path(".codex"),
            strict=True,
            max_threads=6,
            max_depth=2,
            job_max_runtime_seconds=None,
            resolve_opencode_refs_to=Path("/home/test/.codex/opencode"),
        )
        self.assertIn("--resolve-opencode-refs-to", command)
        self.assertIn("/home/test/.codex/opencode", command)

    def test_build_export_command_forwards_model_profile_flags(self) -> None:
        command = INSTALL_MODULE.build_export_command(
            Path("scripts/export-codex-agents.py"),
            Path("opencode/agents"),
            Path("AGENTS.md"),
            Path(".codex"),
            strict=True,
            max_threads=6,
            max_depth=2,
            job_max_runtime_seconds=None,
            resolve_opencode_refs_to=None,
            agent_profile="balanced",
            model_set="openai",
            profile_dir=Path("opencode/tools/agent-profiles"),
            model_set_dir=Path("codex/tools/model-sets"),
            uniform_model="gpt-5.5",
        )

        self.assertIn("--agent-profile", command)
        self.assertIn("balanced", command)
        self.assertIn("--model-set", command)
        self.assertIn("openai", command)
        self.assertIn("--profile-dir", command)
        self.assertIn("opencode/tools/agent-profiles", command)
        self.assertIn("--model-set-dir", command)
        self.assertIn("codex/tools/model-sets", command)
        self.assertIn("--uniform-model", command)
        self.assertIn("gpt-5.5", command)


if __name__ == "__main__":
    unittest.main()
