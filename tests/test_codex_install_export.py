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
    def test_build_global_agents_managed_block_uses_mode_simulation_wording(
        self,
    ) -> None:
        managed_block = INSTALL_MODULE.build_global_agents_managed_block(
            REPO_ROOT / "opencode" / "commands"
        )

        self.assertIn("## Codex global mode aliases", managed_block)
        self.assertIn(
            "current/main agent to adopt the requested mode directly", managed_block
        )
        self.assertIn(
            "Do NOT first spawn the same-named orchestrator role just to enter the mode.",
            managed_block,
        )
        self.assertIn("`flow`: bounded daily engineering", managed_block)
        self.assertIn("`simple`: lightweight build-style execution", managed_block)
        self.assertIn("`pipeline`: full/high-risk/CI/PR path", managed_block)
        self.assertIn("`general`: mixed coding/planning/writing/analysis fallback", managed_block)
        self.assertIn("`opencode/agents/orchestrator-<mode>.md`", managed_block)
        self.assertIn(
            "If the summary is not enough, read the installed definition and then continue in that mode.",
            managed_block,
        )
        self.assertNotIn("routing aliases for installed Codex roles", managed_block)

    def test_build_workspace_agents_managed_block_uses_workspace_definition_path(
        self,
    ) -> None:
        managed_block = INSTALL_MODULE.build_workspace_agents_managed_block(
            REPO_ROOT / "opencode" / "commands"
        )

        self.assertIn("## Codex mode aliases", managed_block)
        self.assertIn(
            "current/main agent to adopt the requested mode directly", managed_block
        )
        self.assertIn(
            "Do NOT first spawn the same-named orchestrator role just to enter the mode.",
            managed_block,
        )
        self.assertIn("`flow`: bounded daily engineering", managed_block)
        self.assertIn("`.codex/opencode/agents/orchestrator-<mode>.md`", managed_block)
        self.assertIn(
            "If the summary is not enough, read the installed definition and then continue in that mode.",
            managed_block,
        )

    def test_merge_global_agents_text_preserves_user_content_and_replaces_block(
        self,
    ) -> None:
        managed_block = INSTALL_MODULE.build_global_agents_managed_block(
            REPO_ROOT / "opencode" / "commands"
        )
        existing = (
            "# Personal Codex Notes\n\n"
            "Keep this intro.\n\n"
            "<!-- BEGIN agents-pipeline-codex-managed -->\n"
            "stale managed content\n"
            "<!-- END agents-pipeline-codex-managed -->\n\n"
            "## Extra Notes\n\n"
            "Do not remove this.\n"
        )

        merged = INSTALL_MODULE.merge_global_agents_text(existing, managed_block)

        self.assertIn("# Personal Codex Notes", merged)
        self.assertIn("Keep this intro.", merged)
        self.assertIn("## Extra Notes", merged)
        self.assertIn("Do not remove this.", merged)
        self.assertNotIn("stale managed content", merged)
        self.assertEqual(
            merged.count(INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START), 1
        )
        self.assertIn(
            "Project/workspace `AGENTS.md` files may further refine behavior",
            merged,
        )
        self.assertIn(
            "Do NOT first spawn the same-named orchestrator role just to enter the mode.",
            merged,
        )
        self.assertIn(
            "`monetize` / `run-monetize` -> `orchestrator-general`", merged
        )

    def test_merge_global_agents_text_creates_minimal_file_when_missing(self) -> None:
        managed_block = INSTALL_MODULE.build_global_agents_managed_block(
            REPO_ROOT / "opencode" / "commands"
        )

        merged = INSTALL_MODULE.merge_global_agents_text("", managed_block)

        self.assertTrue(
            merged.startswith(f"{INSTALL_MODULE.GLOBAL_AGENTS_HEADING}\n\n")
        )
        self.assertIn(INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START, merged)
        self.assertIn(INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_END, merged)

    def test_merge_workspace_agents_text_preserves_user_content_and_replaces_block(
        self,
    ) -> None:
        managed_block = INSTALL_MODULE.build_workspace_agents_managed_block(
            REPO_ROOT / "opencode" / "commands"
        )
        existing = (
            "# Team Notes\n\n"
            "Keep this intro.\n\n"
            "<!-- BEGIN agents-pipeline-codex-managed -->\n"
            "stale managed content\n"
            "<!-- END agents-pipeline-codex-managed -->\n\n"
            "## Local Notes\n\n"
            "Do not remove this.\n"
        )

        merged = INSTALL_MODULE.merge_workspace_agents_text(existing, managed_block)

        self.assertIn("# Team Notes", merged)
        self.assertIn("Keep this intro.", merged)
        self.assertIn("## Local Notes", merged)
        self.assertIn("Do not remove this.", merged)
        self.assertNotIn("stale managed content", merged)
        self.assertEqual(
            merged.count(INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START), 1
        )
        self.assertIn(
            "`.codex/opencode/agents/orchestrator-<mode>.md`", merged
        )
        self.assertIn(
            "`monetize` / `run-monetize` -> `orchestrator-general`", merged
        )

    def test_merge_workspace_agents_text_creates_minimal_file_when_missing(self) -> None:
        managed_block = INSTALL_MODULE.build_workspace_agents_managed_block(
            REPO_ROOT / "opencode" / "commands"
        )

        merged = INSTALL_MODULE.merge_workspace_agents_text("", managed_block)

        self.assertTrue(
            merged.startswith(f"{INSTALL_MODULE.WORKSPACE_AGENTS_HEADING}\n\n")
        )
        self.assertIn(INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START, merged)
        self.assertIn(INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_END, merged)

    def test_resolve_workspace_agents_path_only_for_workspace_codex_installs(
        self,
    ) -> None:
        workspace = Path("/tmp/workspace")
        self.assertEqual(
            INSTALL_MODULE.resolve_workspace_agents_path(
                workspace / ".codex", workspace
            ),
            workspace / "AGENTS.md",
        )
        self.assertIsNone(
            INSTALL_MODULE.resolve_workspace_agents_path(
                workspace / ".codex-alt", workspace
            )
        )

    def test_resolve_global_agents_path_prefers_nonempty_override(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            target_dir = Path(temp_dir_name)
            (target_dir / "AGENTS.md").write_text("# Base\n", encoding="utf-8")
            (target_dir / "AGENTS.override.md").write_text(
                "# Override\n", encoding="utf-8"
            )

            resolved = INSTALL_MODULE.resolve_global_agents_path(target_dir)

            self.assertEqual(resolved, target_dir / "AGENTS.override.md")

    def test_resolve_global_agents_path_falls_back_to_agents_md(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            target_dir = Path(temp_dir_name)
            (target_dir / "AGENTS.override.md").write_text("   \n", encoding="utf-8")

            resolved_with_empty_override = INSTALL_MODULE.resolve_global_agents_path(
                target_dir
            )
            self.assertEqual(
                resolved_with_empty_override,
                target_dir / INSTALL_MODULE.GLOBAL_AGENTS_FILENAME,
            )

            (target_dir / "AGENTS.override.md").unlink()
            resolved_without_override = INSTALL_MODULE.resolve_global_agents_path(
                target_dir
            )
            self.assertEqual(
                resolved_without_override,
                target_dir / INSTALL_MODULE.GLOBAL_AGENTS_FILENAME,
            )

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

    def test_discover_run_command_agents_matches_current_repo_aliases(self) -> None:
        command_agents = EXPORT_MODULE.discover_run_command_agents(
            REPO_ROOT / "opencode" / "commands"
        )

        self.assertEqual(
            set(command_agents),
            {
                "run-flow",
                "run-pipeline",
                "run-general",
                "run-simple",
                "run-spec",
                "run-ci",
                "run-modernize",
                "run-analysis",
                "run-ux",
                "run-committee",
                "run-monetize",
            },
        )
        self.assertEqual(command_agents["run-monetize"], "orchestrator-general")

    def test_input_adapter_includes_natural_language_aliases(self) -> None:
        adapter = EXPORT_MODULE.make_input_adapter("orchestrator-flow", ["flow"])

        for token in (
            "/run-flow",
            "/flow",
            "use flow",
            "using flow",
            "使用 flow",
            "使用flow",
            "用 flow",
            "請用 flow",
        ):
            self.assertIn(f"`{token}`", adapter)
        self.assertIn("Do not infer a mode alias from later mentions", adapter)

    def test_input_adapter_covers_allowlisted_run_command_aliases(self) -> None:
        command_agents = EXPORT_MODULE.discover_run_command_agents(
            REPO_ROOT / "opencode" / "commands"
        )
        agent_aliases = EXPORT_MODULE.build_agent_mode_aliases(command_agents)
        adapter = EXPORT_MODULE.make_input_adapter(
            "orchestrator-general",
            agent_aliases["orchestrator-general"],
        )

        self.assertEqual(agent_aliases["orchestrator-general"], ["general", "monetize"])
        for token in (
            "/run-general",
            "/general",
            "/run-monetize",
            "/monetize",
            "use general",
            "use monetize",
            "請用 monetize",
        ):
            self.assertIn(f"`{token}`", adapter)


if __name__ == "__main__":
    unittest.main()
