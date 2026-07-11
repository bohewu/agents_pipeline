import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[1]
EXPORT_SCRIPT_PATH = REPO_ROOT / "scripts" / "export-codex-agents.py"
INSTALL_SCRIPT_PATH = REPO_ROOT / "scripts" / "install-codex-config.py"
RELEASE_BUNDLE_WORKFLOW_PATH = (
    REPO_ROOT / ".github" / "workflows" / "release-bundle.yml"
)
INSTALL_SH_PATH = REPO_ROOT / "scripts" / "install-codex.sh"
INSTALL_PS1_PATH = REPO_ROOT / "scripts" / "install-codex.ps1"
BOOTSTRAP_SH_PATH = REPO_ROOT / "scripts" / "bootstrap-install-codex.sh"
BOOTSTRAP_PS1_PATH = REPO_ROOT / "scripts" / "bootstrap-install-codex.ps1"
MODES_PATH = REPO_ROOT / "modes.json"
CODEX_MAPPING_DOC_PATH = REPO_ROOT / "docs" / "codex-mapping.md"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


EXPORT_MODULE = load_module("export_codex_agents", EXPORT_SCRIPT_PATH)
INSTALL_MODULE = load_module("install_codex_config", INSTALL_SCRIPT_PATH)


class CodexInstallExportTest(unittest.TestCase):
    MODE_ALIAS_SKILL_EQUIVALENCE_LINE = (
        "Treat each recognized compatibility alias as the matching formal "
        "`$run-<mode>` skill invocation and apply that skill's preflight and "
        "workflow semantics."
    )
    WORKSPACE_PROFILE_PREFLIGHT_LINE = (
        "Before adopting the workflow, always query the globally installed "
        "profile manager for current-workspace JSON status. A normal workspace "
        "without a profile reports global inheritance and may continue. If status "
        "cannot be verified or a configured profile's `health` is not `ok`, stop "
        "before dispatch and ask the user to rerun workspace `set` or `clear`; "
        "never bypass an unhealthy or orphaned profile. If a configured profile's "
        "`profile_eligibility` is not `eligible`, warn that Codex is ignoring the "
        "workspace layer and continue with global role routing."
    )
    MODE_ALIAS_AUTHORIZATION_GUARD_LINE = (
        "A mode alias changes the current/main agent's working style only. It does "
        "not automatically spawn subagents and does not override higher-priority "
        "rules for `spawn_agent` authorization."
    )
    MODE_ALIAS_DEFINITION_LOOKUP_LINE = (
        "1. On a recognized mode alias, read the globally installed "
        "`$CODEX_HOME/agents/orchestrator-<mode>.toml` (default "
        "`~/.codex/agents/orchestrator-<mode>.toml`) as the authoritative workflow "
        "definition. Do not manually adopt a repository `.codex/agents/` role; "
        "effective Codex configuration controls trusted workspace role routing."
    )
    MODE_ALIAS_OBEY_DEFINITION_LINE = (
        "3. After applying that definition, the current/main agent must obey "
        "that definition's hard constraints and delegation rules as if it were "
        "that orchestrator."
    )
    MODE_ALIAS_NO_BYPASS_LINE = (
        "4. If the applied definition forbids direct implementation or routes "
        "scouting/implementation to helper roles, the current/main agent must "
        "not bypass those helpers by doing that work inline. It should delegate "
        "those work items when separately authorized."
    )
    MODE_ALIAS_SUBAGENT_LINE = (
        "5. Use subagents according to that installed definition for real work "
        "items when separately authorized."
    )
    MODE_ALIAS_SUBAGENT_SENTENCE = (
        "Use subagents according to that installed definition for real work items "
        "when separately authorized."
    )
    MODE_ALIAS_OBEY_DEFINITION_SENTENCE = (
        "After applying that definition, the current/main agent must obey that "
        "definition's hard constraints and delegation rules as if it were that "
        "orchestrator."
    )
    MODE_ALIAS_NO_BYPASS_SENTENCE = (
        "If the applied definition forbids direct implementation or routes "
        "scouting/implementation to helper roles, the current/main agent must "
        "not bypass those helpers by doing that work inline. It should delegate "
        "those work items when separately authorized."
    )
    SAME_SESSION_NO_RELOAD_LINE = (
        "Same-session reuse rule: repeated use of the same mode in the same session "
        "does NOT need to reload the definition when the mode and global definition "
        "source are unchanged."
    )
    SAME_SESSION_EXCEPTIONS_LINE = (
        "Reload/re-read when the mode changes, the globally installed definition "
        "changes, the user explicitly asks to reload/refresh/re-read, or the agent "
        "is no longer confident it still has the relevant mode details. Recheck "
        "effective role routing and workspace profile status whenever the workspace "
        "changes."
    )

    def test_build_global_agents_managed_block_uses_mode_simulation_wording(
        self,
    ) -> None:
        managed_block = INSTALL_MODULE.build_global_agents_managed_block(
            MODES_PATH
        )

        self.assertIn("## Codex global mode aliases", managed_block)
        self.assertIn(
            "current/main agent to adopt the requested mode directly", managed_block
        )
        self.assertIn("`$run-pipeline`", managed_block)
        self.assertIn("formal mode entry points", managed_block)
        self.assertIn("compatibility aliases", managed_block)
        self.assertIn("primary full-pipeline entry point", managed_block)
        self.assertIn(self.MODE_ALIAS_SKILL_EQUIVALENCE_LINE, managed_block)
        self.assertIn(self.WORKSPACE_PROFILE_PREFLIGHT_LINE, managed_block)
        self.assertNotIn("`$run-goal`", managed_block)
        self.assertIn(
            "Do NOT first spawn the same-named orchestrator role just to enter the mode.",
            managed_block,
        )
        self.assertIn(
            "Definition-first order for an explicit mode alias in a fresh/new session:",
            managed_block,
        )
        self.assertIn(
            self.MODE_ALIAS_AUTHORIZATION_GUARD_LINE,
            managed_block,
        )
        self.assertIn(
            self.MODE_ALIAS_DEFINITION_LOOKUP_LINE,
            managed_block,
        )
        self.assertIn(
            "2. The current/main agent simulates that mode itself from the installed definition.",
            managed_block,
        )
        self.assertIn(self.MODE_ALIAS_OBEY_DEFINITION_LINE, managed_block)
        self.assertIn(self.MODE_ALIAS_NO_BYPASS_LINE, managed_block)
        self.assertIn(self.MODE_ALIAS_SUBAGENT_LINE, managed_block)
        self.assertIn(self.SAME_SESSION_NO_RELOAD_LINE, managed_block)
        self.assertIn(self.SAME_SESSION_EXCEPTIONS_LINE, managed_block)
        self.assertIn(
            "When reading the installed definition for Codex mode simulation, focus on mode behavior, task decomposition, delegation rules, and output style; ignore adapter details for other runtimes.",
            managed_block,
        )
        self.assertNotIn("Quick orientation:", managed_block)
        self.assertNotIn(
            "`flow`: bounded daily engineering; small task set; concise final status.",
            managed_block,
        )
        self.assertNotIn(
            "`simple`: smallest safe completion path; stay lightweight; use direct execution or one helper lane when useful.",
            managed_block,
        )
        self.assertNotIn(
            "`pipeline`: fuller path for multi-file/high-risk/CI/PR work",
            managed_block,
        )
        self.assertNotIn(
            "`general`: mixed coding/planning/writing/analysis fallback; can redirect to a stronger mode when task risk demands it.",
            managed_block,
        )
        self.assertNotIn(
            "- Installed definition precedence: `.codex/agents/orchestrator-<mode>.toml` first for the current workspace when available, then `~/.codex/agents/orchestrator-<mode>.toml`.",
            managed_block,
        )
        self.assertNotIn(
            "- Summary is quick orientation only; for explicit mode aliases in fresh/new sessions, the installed definition remains the default source of truth.",
            managed_block,
        )
        self.assertNotIn("Available subagents (practical set):", managed_block)
        self.assertNotIn("routing aliases for installed Codex roles", managed_block)

    def test_build_workspace_agents_managed_block_uses_workspace_definition_path(
        self,
    ) -> None:
        managed_block = INSTALL_MODULE.build_workspace_agents_managed_block(
            MODES_PATH
        )

        self.assertIn("## Codex mode aliases", managed_block)
        self.assertIn(
            "current/main agent to adopt the requested mode directly", managed_block
        )
        self.assertIn("`$run-pipeline`", managed_block)
        self.assertIn("formal mode entry points", managed_block)
        self.assertIn("compatibility aliases", managed_block)
        self.assertIn(self.MODE_ALIAS_SKILL_EQUIVALENCE_LINE, managed_block)
        self.assertIn(self.WORKSPACE_PROFILE_PREFLIGHT_LINE, managed_block)
        self.assertNotIn("`$run-goal`", managed_block)
        self.assertIn(
            "Do NOT first spawn the same-named orchestrator role just to enter the mode.",
            managed_block,
        )
        self.assertIn(
            "Definition-first order for an explicit mode alias in a fresh/new session:",
            managed_block,
        )
        self.assertIn(
            self.MODE_ALIAS_AUTHORIZATION_GUARD_LINE,
            managed_block,
        )
        self.assertIn(
            self.MODE_ALIAS_DEFINITION_LOOKUP_LINE,
            managed_block,
        )
        self.assertIn(
            "2. The current/main agent simulates that mode itself from the installed definition.",
            managed_block,
        )
        self.assertIn(self.MODE_ALIAS_OBEY_DEFINITION_LINE, managed_block)
        self.assertIn(self.MODE_ALIAS_NO_BYPASS_LINE, managed_block)
        self.assertIn(self.MODE_ALIAS_SUBAGENT_LINE, managed_block)
        self.assertIn(self.SAME_SESSION_NO_RELOAD_LINE, managed_block)
        self.assertIn(self.SAME_SESSION_EXCEPTIONS_LINE, managed_block)
        self.assertIn(
            "When reading the installed definition for Codex mode simulation, focus on mode behavior, task decomposition, delegation rules, and output style; ignore adapter details for other runtimes.",
            managed_block,
        )
        self.assertNotIn("Quick orientation:", managed_block)
        self.assertNotIn(
            "`flow`: bounded daily engineering; small task set; concise final status.",
            managed_block,
        )
        self.assertNotIn(
            "`simple`: smallest safe completion path; stay lightweight; use direct execution or one helper lane when useful.",
            managed_block,
        )
        self.assertNotIn(
            "`pipeline`: fuller path for multi-file/high-risk/CI/PR work",
            managed_block,
        )
        self.assertNotIn(
            "`general`: mixed coding/planning/writing/analysis fallback; can redirect to a stronger mode when task risk demands it.",
            managed_block,
        )
        self.assertNotIn(
            "- Installed definition precedence: `.codex/agents/orchestrator-<mode>.toml` first for the current workspace when available, then `~/.codex/agents/orchestrator-<mode>.toml`.",
            managed_block,
        )
        self.assertNotIn(
            "- Summary is quick orientation only; for explicit mode aliases in fresh/new sessions, the installed definition remains the default source of truth.",
            managed_block,
        )
        self.assertNotIn("Available subagents (practical set):", managed_block)

    def test_codex_mapping_manual_snippet_matches_generated_global_guidance(
        self,
    ) -> None:
        managed_lines = INSTALL_MODULE.build_global_agents_managed_block(
            MODES_PATH
        ).splitlines()
        expected = "\n".join(managed_lines[1:-1]).strip()
        document = CODEX_MAPPING_DOC_PATH.read_text(encoding="utf-8")
        section = document.split(
            "## Global Custom Instructions Snippet", 1
        )[1].split("## Frontmatter Mapping", 1)[0]
        snippet = section.split("```text\n", 1)[1].split("\n```", 1)[0].strip()

        self.assertEqual(snippet, expected)

    def test_merge_global_agents_text_preserves_user_content_and_replaces_block(
        self,
    ) -> None:
        managed_block = INSTALL_MODULE.build_global_agents_managed_block(
            MODES_PATH
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
            self.MODE_ALIAS_SUBAGENT_SENTENCE,
            merged,
        )
        self.assertIn(self.MODE_ALIAS_OBEY_DEFINITION_SENTENCE, merged)
        self.assertIn(self.MODE_ALIAS_NO_BYPASS_SENTENCE, merged)
        self.assertIn(self.SAME_SESSION_NO_RELOAD_LINE, merged)
        self.assertIn(self.SAME_SESSION_EXCEPTIONS_LINE, merged)
        self.assertNotIn("Available subagents (practical set):", merged)
        self.assertIn(
            "`$CODEX_HOME/agents/orchestrator-<mode>.toml`", merged
        )
        self.assertIn(
            "`~/.codex/agents/orchestrator-<mode>.toml`", merged
        )
        self.assertNotIn(
            "read `.codex/agents/orchestrator-<mode>.toml`", merged
        )
        self.assertIn(self.SAME_SESSION_NO_RELOAD_LINE, merged)
        self.assertIn(self.SAME_SESSION_EXCEPTIONS_LINE, merged)
        self.assertIn(
            "`monetize` / `run-monetize` -> `orchestrator-general`", merged
        )

    def test_merge_global_agents_text_creates_minimal_file_when_missing(self) -> None:
        managed_block = INSTALL_MODULE.build_global_agents_managed_block(
            MODES_PATH
        )

        merged = INSTALL_MODULE.merge_global_agents_text("", managed_block)

        self.assertTrue(
            merged.startswith(f"{INSTALL_MODULE.GLOBAL_AGENTS_HEADING}\n\n")
        )
        self.assertIn(INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START, merged)
        self.assertIn(INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_END, merged)

    def test_merge_global_agents_text_rejects_malformed_managed_markers(self) -> None:
        managed_block = INSTALL_MODULE.build_global_agents_managed_block(MODES_PATH)
        malformed_values = (
            f"notes\n{INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START}\n",
            f"{INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_END}\nnotes\n",
            (
                f"{INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_END}\n"
                f"{INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START}\n"
            ),
        )
        for existing in malformed_values:
            with self.subTest(existing=existing):
                with self.assertRaisesRegex(ValueError, "markers"):
                    INSTALL_MODULE.merge_global_agents_text(existing, managed_block)

    def test_merge_global_agents_text_ignores_markers_in_markdown_code(self) -> None:
        managed_block = INSTALL_MODULE.build_global_agents_managed_block(MODES_PATH)
        example = (
            "# User notes\n\n"
            "```md\n"
            f"{INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START}\n"
            "DO NOT DELETE FENCED EXAMPLE\n"
            f"{INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_END}\n"
            "```\n\n"
            f"    {INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START}\n"
            "    DO NOT DELETE INDENTED EXAMPLE\n"
            f"    {INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_END}\n"
        )
        merged = INSTALL_MODULE.merge_global_agents_text(example, managed_block)
        self.assertIn("DO NOT DELETE FENCED EXAMPLE", merged)
        self.assertIn("DO NOT DELETE INDENTED EXAMPLE", merged)
        self.assertEqual(
            merged.count(INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START), 3
        )
        self.assertTrue(merged.rstrip().endswith(INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_END))

    def test_merge_workspace_agents_text_preserves_user_content_and_replaces_block(
        self,
    ) -> None:
        managed_block = INSTALL_MODULE.build_workspace_agents_managed_block(
            MODES_PATH
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
            "`$CODEX_HOME/agents/orchestrator-<mode>.toml`", merged
        )
        self.assertIn(
            "`~/.codex/agents/orchestrator-<mode>.toml`", merged
        )
        self.assertNotIn(
            "read `.codex/agents/orchestrator-<mode>.toml`", merged
        )
        self.assertIn(
            "`monetize` / `run-monetize` -> `orchestrator-general`", merged
        )

    def test_merge_workspace_agents_text_creates_minimal_file_when_missing(self) -> None:
        managed_block = INSTALL_MODULE.build_workspace_agents_managed_block(
            MODES_PATH
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

    def test_resolve_catalog_path_anchors_default_to_asset_root(self) -> None:
        asset_root = Path("/tmp/agents-pipeline")

        resolved_default = INSTALL_MODULE.resolve_catalog_path(
            "AGENTS.md", asset_root=asset_root
        )
        resolved_explicit_relative = INSTALL_MODULE.resolve_catalog_path(
            "docs/custom-catalog.md", asset_root=asset_root
        )

        self.assertEqual(resolved_default, asset_root / "AGENTS.md")
        self.assertEqual(resolved_explicit_relative, Path("docs/custom-catalog.md"))

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

    def test_release_bundle_contains_and_smokes_neutral_codex_adapter(self) -> None:
        workflow = RELEASE_BUNDLE_WORKFLOW_PATH.read_text(encoding="utf-8")

        self.assertIn(
            'cp -R agents protocols runtimes scripts skills tools "dist/${BUNDLE_DIR}/"',
            workflow,
        )
        self.assertIn(
            'test -f "${BUNDLE_DIR}/runtimes/codex/model-sets/openai.json"',
            workflow,
        )
        self.assertIn(
            'test -f "${BUNDLE_DIR}/modes.json"',
            workflow,
        )
        self.assertIn(
            'cp docs/status-writer-spec.md "dist/${BUNDLE_DIR}/docs/"',
            workflow,
        )
        self.assertIn(
            'python3 "${BUNDLE_DIR}/scripts/export-codex-agents.py" --source-agents "${BUNDLE_DIR}/agents"',
            workflow,
        )
        self.assertIn(
            'bash "${BUNDLE_DIR}/scripts/install-codex.sh"',
            workflow,
        )

    def test_codex_installers_use_neutral_asset_layout(self) -> None:
        install_sh = INSTALL_SH_PATH.read_text(encoding="utf-8")
        install_ps1 = INSTALL_PS1_PATH.read_text(encoding="utf-8")

        for content in (install_sh, install_ps1):
            self.assertIn("tools/agent-profiles", content)
            self.assertIn("runtimes/codex/model-sets", content)
            self.assertIn("modes.json", content)
            self.assertNotIn("opencode/agents", content)
            self.assertNotIn("opencode/tools/agent-profiles", content)

    def test_codex_bootstrap_accepts_neutral_bundle_names(self) -> None:
        bootstrap_sh = BOOTSTRAP_SH_PATH.read_text(encoding="utf-8")
        bootstrap_ps1 = BOOTSTRAP_PS1_PATH.read_text(encoding="utf-8")

        self.assertIn("agents-pipeline-bundle-", bootstrap_sh)
        self.assertIn("agents-pipeline-bundle-", bootstrap_ps1)
        self.assertIn("supports v0.28.0 or newer", bootstrap_sh)
        self.assertIn("supports v0.28.0 or newer", bootstrap_ps1)
        self.assertNotIn("opencode-bundle", bootstrap_sh)
        self.assertNotIn("opencode-bundle", bootstrap_ps1)
        self.assertIn('"scripts/sync-runtime-support.py"', bootstrap_sh)
        self.assertIn('"scripts/sync-runtime-support.py"', bootstrap_ps1)
        self.assertIn('"scripts/sync-codex-skills.py"', bootstrap_sh)
        self.assertIn('"scripts/sync-codex-skills.py"', bootstrap_ps1)
        for required_path in (
            "AGENTS.md",
            "modes.json",
            "tools/agent-profile.py",
            "tools/status-event.js",
            "tools/status-runtime",
            "runtimes/codex/model-sets",
            "scripts/install-codex-config.py",
        ):
            self.assertIn(required_path, bootstrap_sh)
            self.assertIn(required_path, bootstrap_ps1)

    def test_codex_installers_support_explicit_global_agents_target(self) -> None:
        install_sh = (REPO_ROOT / "scripts/install-codex.sh").read_text(
            encoding="utf-8"
        )
        install_ps1 = (REPO_ROOT / "scripts/install-codex.ps1").read_text(
            encoding="utf-8"
        )
        install_py = INSTALL_SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn("--global-agents-target", install_sh)
        self.assertIn("GLOBAL_AGENTS_TARGET", install_sh)
        self.assertIn("[string]$GlobalAgentsTarget", install_ps1)
        self.assertIn('"--global-agents-target"', install_ps1)
        self.assertIn("--global-agents-target", install_py)

    def test_codex_installers_expose_managed_user_skill_sync(self) -> None:
        install_sh = INSTALL_SH_PATH.read_text(encoding="utf-8")
        install_ps1 = INSTALL_PS1_PATH.read_text(encoding="utf-8")
        bootstrap_sh = BOOTSTRAP_SH_PATH.read_text(encoding="utf-8")
        bootstrap_ps1 = BOOTSTRAP_PS1_PATH.read_text(encoding="utf-8")

        self.assertIn("--user-skills-root", install_sh)
        self.assertIn("scripts/sync-codex-skills.py", install_sh)
        self.assertIn("[string]$UserSkillsRoot", install_ps1)
        self.assertIn("scripts/sync-codex-skills.py", install_ps1)
        self.assertIn("--user-skills-root", bootstrap_sh)
        self.assertIn("[string]$UserSkillsRoot", bootstrap_ps1)
        for content in (install_sh, install_ps1):
            self.assertIn("`$run-pipeline", content)
            self.assertIn("compatibility aliases", content)

    def test_codex_manifest_records_runtime_profile_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            target_dir = Path(temp_dir_name) / ".codex"
            manifest_path = target_dir / INSTALL_MODULE.MANIFEST_FILENAME

            INSTALL_MODULE.write_manifest(
                manifest_path,
                agent_names=["orchestrator-flow"],
                agent_files=["agents/orchestrator-flow.toml"],
                profile="premium",
                model_set="openai",
                uniform_model=None,
                source_agents_dir=REPO_ROOT / "agents",
                target_dir=target_dir,
            )

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["profile"], "premium")
            self.assertEqual(manifest["mode"], "profile")
            self.assertEqual(manifest["model_set"], "openai")
            self.assertEqual(manifest["version"], 3)
            self.assertEqual(manifest["managed_support_root"], "agents-pipeline")
            self.assertNotIn("source_agents_dir", manifest)
            self.assertEqual(
                manifest["managed_agent_names"], ["orchestrator-flow"]
            )

            first = manifest_path.read_bytes()
            INSTALL_MODULE.write_manifest(
                manifest_path,
                agent_names=["orchestrator-flow"],
                agent_files=["agents/orchestrator-flow.toml"],
                profile="premium",
                model_set="openai",
                uniform_model=None,
                source_agents_dir=Path(temp_dir_name) / "ephemeral-extract" / "agents",
                target_dir=target_dir,
            )
            self.assertEqual(manifest_path.read_bytes(), first)

    def test_manifest_rejects_managed_files_outside_agents_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            manifest_path = Path(temp_dir_name) / INSTALL_MODULE.MANIFEST_FILENAME
            manifest_path.write_text(
                json.dumps(
                    {
                        "tool": INSTALL_MODULE.MANIFEST_TOOL,
                        "version": INSTALL_MODULE.MANIFEST_VERSION,
                        "target_dir": str(Path(temp_dir_name).resolve()),
                        "managed_support_root": INSTALL_MODULE.SUPPORT_TREE_DIRNAME,
                        "managed_agent_names": ["executor"],
                        "managed_agent_files": ["../victim.toml"],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "agents/<name>.toml"):
                INSTALL_MODULE.parse_manifest(manifest_path)

    def test_installer_does_not_delete_through_a_crafted_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            target = root / ".codex"
            target.mkdir()
            victim = root / "victim.toml"
            victim.write_text("preserve", encoding="utf-8")
            (target / INSTALL_MODULE.MANIFEST_FILENAME).write_text(
                json.dumps(
                    {
                        "tool": INSTALL_MODULE.MANIFEST_TOOL,
                        "version": INSTALL_MODULE.MANIFEST_VERSION,
                        "managed_support_root": INSTALL_MODULE.SUPPORT_TREE_DIRNAME,
                        "managed_agent_names": ["victim"],
                        "managed_agent_files": ["../victim.toml"],
                    }
                ),
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    INSTALL_SCRIPT_PATH.as_posix(),
                    "--target-dir",
                    target.as_posix(),
                    "--workspace-root",
                    root.as_posix(),
                    "--strict",
                    "--temp-dir",
                    (root / "tmp").as_posix(),
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 2)
            self.assertEqual(victim.read_text(encoding="utf-8"), "preserve")

    def test_managed_agent_leaf_symlinks_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            target = Path(temp_dir_name) / ".codex"
            agents_dir = target / "agents"
            agents_dir.mkdir(parents=True)
            user_file = agents_dir / "user-owned.toml"
            user_file.write_text("preserve", encoding="utf-8")
            managed_link = agents_dir / "executor.toml"
            try:
                managed_link.symlink_to(user_file.name)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")

            with self.assertRaisesRegex(ValueError, "must not be a symbolic link"):
                INSTALL_MODULE.resolve_managed_agent_path(
                    target, "agents/executor.toml"
                )
            self.assertEqual(user_file.read_text(encoding="utf-8"), "preserve")

    def test_legacy_support_cleanup_requires_pre_v3_owned_tree(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            legacy_root = Path(temp_dir_name) / "opencode"
            for marker in INSTALL_MODULE.LEGACY_SUPPORT_TREE_MARKERS:
                marker_path = legacy_root / marker
                marker_path.parent.mkdir(parents=True, exist_ok=True)
                marker_path.write_text("legacy", encoding="utf-8")

            current_manifest = {
                "manifest_version": INSTALL_MODULE.MANIFEST_VERSION,
                "managed_agent_names": [],
                "managed_agent_files": [],
            }
            legacy_manifest = {
                "manifest_version": 2,
                "managed_agent_names": [],
                "managed_agent_files": [],
            }

            self.assertFalse(
                INSTALL_MODULE.should_remove_legacy_support(
                    current_manifest,
                    manifest_exists=True,
                    legacy_support_path=legacy_root,
                )
            )
            self.assertTrue(
                INSTALL_MODULE.should_remove_legacy_support(
                    legacy_manifest,
                    manifest_exists=True,
                    legacy_support_path=legacy_root,
                )
            )

    def test_exporter_default_max_depth_is_two(self) -> None:
        self.assertEqual(EXPORT_MODULE.DEFAULT_MAX_DEPTH, 2)

    def test_installer_default_max_depth_is_two(self) -> None:
        self.assertEqual(INSTALL_MODULE.DEFAULT_MAX_DEPTH, 2)

    def test_workspace_profile_target_inherits_global_agent_limits(self) -> None:
        workspace_target = Path("/work/repo/.codex")
        global_target = Path("/home/user/.codex")
        self.assertTrue(
            INSTALL_MODULE.is_workspace_profile_target(workspace_target, global_target)
        )
        self.assertFalse(
            INSTALL_MODULE.is_workspace_profile_target(global_target, global_target)
        )

        merged = INSTALL_MODULE.merge_config_text(
            "[agents]\nmax_threads = 6\nmax_depth = 2\ninterrupt_message = false\n",
            {
                "executor": INSTALL_MODULE.Block(
                    "table",
                    "agents.executor",
                    ["[agents.executor]", 'description = "Execute work."'],
                )
            },
            previous_agent_names=[],
            max_threads=6,
            max_depth=2,
            job_max_runtime_seconds=None,
            manage_agent_limits=False,
            remove_legacy_agent_limits=True,
        )

        self.assertNotIn("max_threads", merged)
        self.assertNotIn("max_depth", merged)
        self.assertIn("interrupt_message = false", merged)
        self.assertIn("[agents.executor]", merged)

    def test_merge_ignores_table_and_assignment_text_inside_multiline_strings(self) -> None:
        existing = (
            '[features]\nmessage = """\n'
            "[agents.executor]\n"
            "multi_agent = false\n"
            '"""\nweb_search = true\n'
        )
        merged = INSTALL_MODULE.merge_config_text(
            existing,
            {
                "executor": INSTALL_MODULE.Block(
                    "table",
                    "agents.executor",
                    ["[agents.executor]", 'description = "Execute work."'],
                )
            },
            previous_agent_names=[],
            max_threads=6,
            max_depth=2,
            job_max_runtime_seconds=None,
            manage_agent_limits=True,
            remove_legacy_agent_limits=False,
        )
        parsed = INSTALL_MODULE.tomllib.loads(merged)
        self.assertIn("[agents.executor]\nmulti_agent = false", parsed["features"]["message"])
        self.assertTrue(parsed["features"]["multi_agent"])
        self.assertEqual(parsed["agents"]["executor"]["description"], "Execute work.")

    def test_merge_replaces_quoted_managed_agent_table(self) -> None:
        merged = INSTALL_MODULE.merge_config_text(
            '[agents."executor"]\ndescription = "Old value."\n',
            {
                "executor": INSTALL_MODULE.Block(
                    "table",
                    "agents.executor",
                    ["[agents.executor]", 'description = "New value."'],
                )
            },
            previous_agent_names=["executor"],
            max_threads=6,
            max_depth=2,
            job_max_runtime_seconds=None,
            manage_agent_limits=True,
            remove_legacy_agent_limits=False,
        )
        parsed = INSTALL_MODULE.tomllib.loads(merged)
        self.assertEqual(parsed["agents"]["executor"]["description"], "New value.")
        self.assertNotIn("Old value", merged)

    def test_merge_preserves_valid_root_dotted_configuration(self) -> None:
        merged = INSTALL_MODULE.merge_config_text(
            'features.web_search = true\nagents.custom = { description = "Keep" }\n',
            {
                "executor": INSTALL_MODULE.Block(
                    "table",
                    "agents.executor",
                    ["[agents.executor]", 'description = "Execute work."'],
                )
            },
            previous_agent_names=[],
            max_threads=6,
            max_depth=2,
            job_max_runtime_seconds=None,
            manage_agent_limits=True,
            remove_legacy_agent_limits=False,
        )
        parsed = INSTALL_MODULE.tomllib.loads(merged)
        self.assertTrue(parsed["features"]["web_search"])
        self.assertTrue(parsed["features"]["multi_agent"])
        self.assertEqual(parsed["agents"]["custom"]["description"], "Keep")
        self.assertEqual(parsed["agents"]["max_threads"], 6)
        self.assertEqual(parsed["agents"]["executor"]["description"], "Execute work.")

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

    def test_resolve_asset_layout_uses_neutral_root_for_repo_and_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            neutral_root = Path(temp_dir_name)
            for dirname in INSTALL_MODULE.SUPPORT_TREE_DIRS:
                (neutral_root / dirname).mkdir(parents=True, exist_ok=True)
            (neutral_root / "modes.json").write_text(
                '{"modes":[{"name":"flow","agent":"orchestrator-flow"}]}',
                encoding="utf-8",
            )
            (neutral_root / "AGENTS.md").write_text(
                "# Agent catalog\n", encoding="utf-8"
            )
            (neutral_root / "VERSION").write_text("0.28.0\n", encoding="utf-8")
            (neutral_root / "scripts" / "install-codex-config.py").write_text(
                "", encoding="utf-8"
            )
            (neutral_root / "scripts" / "export-codex-agents.py").write_text(
                "", encoding="utf-8"
            )

            layout = INSTALL_MODULE.resolve_asset_layout(
                neutral_root / "scripts" / "install-codex-config.py"
            )

            self.assertEqual(layout.name, "neutral")
            self.assertEqual(layout.asset_root, neutral_root)
            self.assertEqual(layout.support_tree_source, neutral_root)
            self.assertTrue(INSTALL_MODULE.has_support_tree(neutral_root))
            self.assertEqual(
                layout.export_script,
                neutral_root / "scripts" / "export-codex-agents.py",
            )

    def test_sync_support_tree_copies_only_neutral_managed_assets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source = root / "source"
            target = root / "target" / "agents-pipeline"
            for dirname in INSTALL_MODULE.SUPPORT_TREE_DIRS:
                (source / dirname).mkdir(parents=True, exist_ok=True)
                (source / dirname / "sentinel.txt").write_text(
                    dirname, encoding="utf-8"
                )
            (source / "modes.json").write_text(
                '{"modes":[{"name":"flow","agent":"orchestrator-flow"}]}',
                encoding="utf-8",
            )
            (source / "AGENTS.md").write_text(
                "# Agent catalog\n", encoding="utf-8"
            )
            (source / "VERSION").write_text("0.28.0\n", encoding="utf-8")
            (source / "README.md").write_text("do not copy", encoding="utf-8")
            (source / "protocols" / "contract.md").write_text(
                "See `./protocols/schemas/example.json`.\n"
                "Run `node tools/status-event.js --help`.\n",
                encoding="utf-8",
            )
            INSTALL_MODULE.sync_support_tree(source, target)
            (target / "stale.txt").write_text("stale", encoding="utf-8")
            INSTALL_MODULE.sync_support_tree(source, target)

            self.assertFalse((target / "stale.txt").exists())
            self.assertFalse((target / "README.md").exists())
            self.assertTrue((target / "AGENTS.md").is_file())
            self.assertEqual(
                (target / "VERSION").read_text(encoding="utf-8"), "0.28.0\n"
            )
            self.assertTrue((target / "modes.json").is_file())
            self.assertTrue((target / ".agents-pipeline-support.json").is_file())
            for dirname in INSTALL_MODULE.SUPPORT_TREE_DIRS:
                self.assertTrue((target / dirname / "sentinel.txt").is_file())
            installed_contract = (target / "protocols" / "contract.md").read_text(
                encoding="utf-8"
            )
            self.assertIn(
                f"{target.as_posix()}/protocols/schemas/example.json",
                installed_contract,
            )
            self.assertIn(
                f'node "{target.as_posix()}/tools/status-event.js" --help',
                installed_contract,
            )

    def test_sync_support_tree_preserves_an_unowned_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            source = root / "source"
            target = root / "target" / "agents-pipeline"
            for dirname in INSTALL_MODULE.SUPPORT_TREE_DIRS:
                (source / dirname).mkdir(parents=True, exist_ok=True)
            (source / "modes.json").write_text("{}", encoding="utf-8")
            (source / "AGENTS.md").write_text(
                "# Agent catalog\n", encoding="utf-8"
            )
            (source / "VERSION").write_text("0.28.0\n", encoding="utf-8")
            target.mkdir(parents=True)
            sentinel = target / "user-owned.txt"
            sentinel.write_text("preserve me", encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, "unowned support directory"):
                INSTALL_MODULE.sync_support_tree(source, target)

            self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve me")

    def test_installed_support_tree_executes_status_cli_from_other_workdir(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            target = root / ".codex"
            install = subprocess.run(
                [
                    sys.executable,
                    INSTALL_SCRIPT_PATH.as_posix(),
                    "--target-dir",
                    target.as_posix(),
                    "--workspace-root",
                    root.as_posix(),
                    "--strict",
                    "--temp-dir",
                    (root / "tmp").as_posix(),
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(install.returncode, 0, install.stderr)

            support_root = target / INSTALL_MODULE.SUPPORT_TREE_DIRNAME
            status_help = subprocess.run(
                [
                    "node",
                    (support_root / "tools" / "status-event.js").as_posix(),
                    "--help",
                ],
                cwd=root,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(status_help.returncode, 0, status_help.stderr)
            self.assertIn("node tools/status-event.js --event", status_help.stdout)

            installed_protocol = (
                support_root / "protocols" / "PIPELINE_PROTOCOL.md"
            ).read_text(encoding="utf-8")
            self.assertIn(
                f'node "{support_root.as_posix()}/tools/status-event.js"',
                installed_protocol,
            )

    def test_install_helper_rejects_shell_active_target_before_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            target = root / "unsafe$codex"
            result = subprocess.run(
                [
                    sys.executable,
                    INSTALL_SCRIPT_PATH.as_posix(),
                    "--target-dir",
                    target.as_posix(),
                    "--strict",
                    "--temp-dir",
                    (root / "tmp").as_posix(),
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            self.assertIn("unsafe in generated shell instructions", result.stderr)
            self.assertFalse(target.exists())
            self.assertFalse((root / "tmp").exists())

    def test_install_helper_rejects_linked_target_before_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            outside = root / "outside"
            outside.mkdir()
            sentinel = outside / "user-owned.txt"
            sentinel.write_text("preserve me", encoding="utf-8")
            target = root / "codex-link"
            try:
                target.symlink_to(outside, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")

            result = subprocess.run(
                [
                    sys.executable,
                    INSTALL_SCRIPT_PATH.as_posix(),
                    "--target-dir",
                    target.as_posix(),
                    "--strict",
                    "--dry-run",
                    "--temp-dir",
                    (root / "tmp").as_posix(),
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            self.assertIn("symbolic link or junction", result.stderr)
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve me")
            self.assertEqual([path.name for path in outside.iterdir()], [sentinel.name])
            self.assertFalse((root / "tmp").exists())

    def test_malformed_global_agents_markers_fail_before_any_install_mutation(self) -> None:
        for dry_run in (False, True):
            with self.subTest(dry_run=dry_run), tempfile.TemporaryDirectory() as temp_name:
                root = Path(temp_name)
                target = root / ".codex"
                target.mkdir()
                agents_notes = target / "AGENTS.md"
                agents_notes.write_text(
                    "# User notes\n\n"
                    f"{INSTALL_MODULE.WORKSPACE_AGENTS_MANAGED_START}\n"
                    "missing end marker\n",
                    encoding="utf-8",
                )
                command = [
                    sys.executable,
                    INSTALL_SCRIPT_PATH.as_posix(),
                    "--target-dir",
                    target.as_posix(),
                    "--strict",
                    "--temp-dir",
                    (root / "tmp").as_posix(),
                ]
                if dry_run:
                    command.append("--dry-run")
                result = subprocess.run(
                    command,
                    cwd=REPO_ROOT,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 2)
                self.assertIn("malformed", result.stderr)
                self.assertEqual(
                    {path.name for path in target.iterdir()},
                    {"AGENTS.md"},
                )
                self.assertIn("missing end marker", agents_notes.read_text(encoding="utf-8"))

    def test_install_refuses_to_overwrite_an_unmarked_role_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            target = root / ".codex"
            role = target / "agents" / "executor.toml"
            role.parent.mkdir(parents=True)
            role.write_text('name = "user-owned"\n', encoding="utf-8")
            result = subprocess.run(
                [
                    sys.executable,
                    INSTALL_SCRIPT_PATH.as_posix(),
                    "--target-dir",
                    target.as_posix(),
                    "--strict",
                    "--temp-dir",
                    (root / "tmp").as_posix(),
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("without the generated ownership marker", result.stderr)
            self.assertEqual(role.read_text(encoding="utf-8"), 'name = "user-owned"\n')
            self.assertFalse((target / "agents-pipeline").exists())
            self.assertFalse((target / "config.toml").exists())

    def test_legacy_untrusted_manifest_does_not_claim_unmarked_roles(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / ".codex"
            role = target / "agents" / "custom.toml"
            role.parent.mkdir(parents=True)
            role.write_text('name = "custom"\n', encoding="utf-8")
            (target / INSTALL_MODULE.MANIFEST_FILENAME).write_text(
                json.dumps(
                    {
                        "managed_agent_names": ["custom"],
                        "managed_agent_files": ["agents/custom.toml"],
                    }
                ),
                encoding="utf-8",
            )
            inferred = INSTALL_MODULE.infer_previous_managed(target)
            self.assertEqual(inferred["managed_agent_names"], [])
            self.assertEqual(inferred["managed_agent_files"], [])

    @unittest.skipUnless(shutil.which("bash"), "Bash is required for this smoke test")
    def test_installed_codex_support_tree_profile_manager_lists_and_clears(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            target = root / "codex"
            environment = {**os.environ, "HOME": (root / "home").as_posix()}
            (root / "home").mkdir()

            def run(command: list[str]) -> subprocess.CompletedProcess[str]:
                completed = subprocess.run(
                    command,
                    cwd=REPO_ROOT,
                    env=environment,
                    text=True,
                    capture_output=True,
                    timeout=45,
                    check=False,
                )
                self.assertEqual(
                    completed.returncode,
                    0,
                    f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}",
                )
                return completed

            run(
                [
                    "bash",
                    INSTALL_SH_PATH.as_posix(),
                    "--target",
                    target.as_posix(),
                    "--no-backup",
                    "--agent-profile",
                    "balanced",
                    "--model-set",
                    "openai",
                ]
            )
            installed_wrapper = (
                target / INSTALL_MODULE.SUPPORT_TREE_DIRNAME / "scripts" / "agent-profile.sh"
            )
            self.assertTrue(installed_wrapper.is_file())

            listing = json.loads(
                run(
                    [
                        "bash",
                        installed_wrapper.as_posix(),
                        "list",
                        "--runtime",
                        "codex",
                        "--json",
                    ]
                ).stdout
            )
            self.assertIn("balanced", {item["name"] for item in listing["profiles"]})
            self.assertIn("openai", {item["name"] for item in listing["model_sets"]})

            before = json.loads(
                run(
                    [
                        "bash",
                        installed_wrapper.as_posix(),
                        "status",
                        "--runtime",
                        "codex",
                        "--scope",
                        "global",
                        "--target",
                        target.as_posix(),
                        "--json",
                    ]
                ).stdout
            )
            self.assertEqual((before["installed"], before["health"], before["mode"]), (True, "ok", "profile"))

            run(
                [
                    "bash",
                    installed_wrapper.as_posix(),
                    "clear",
                    "--runtime",
                    "codex",
                    "--scope",
                    "global",
                    "--target",
                    target.as_posix(),
                    "--no-backup",
                ]
            )
            after = json.loads(
                run(
                    [
                        "bash",
                        installed_wrapper.as_posix(),
                        "status",
                        "--runtime",
                        "codex",
                        "--scope",
                        "global",
                        "--target",
                        target.as_posix(),
                        "--json",
                    ]
                ).stdout
            )
            self.assertEqual((after["installed"], after["health"], after["mode"]), (True, "ok", "inherit"))

    def test_run_export_creates_temp_dir_under_requested_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_root = Path(temp_dir_name) / "workspace-temp"
            fake_result = mock.Mock(returncode=0, stdout="", stderr="")

            with mock.patch.object(
                INSTALL_MODULE.subprocess, "run", return_value=fake_result
            ):
                generated_dir = INSTALL_MODULE.run_export(
                    Path("export-codex-agents.py"),
                    Path("agents"),
                    Path("modes.json"),
                    Path("AGENTS.md"),
                    strict=True,
                    max_threads=6,
                    max_depth=2,
                    job_max_runtime_seconds=None,
                    temp_root=temp_root,
                    resolve_support_refs_to=None,
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
                    Path("agents"),
                    Path("modes.json"),
                    Path("AGENTS.md"),
                    strict=True,
                    max_threads=6,
                    max_depth=2,
                    job_max_runtime_seconds=None,
                    temp_root=temp_root,
                    resolve_support_refs_to=None,
                )

    def test_exporter_rewrites_neutral_refs_without_touching_source_comments(
        self,
    ) -> None:
        body = (
            "# Source: C:/repo/agents/orchestrator-pipeline.md\n"
            "Use `protocols/PIPELINE_PROTOCOL.md` and `skills/frontend-aesthetic-director/SKILL.md`.\n"
        )
        rewritten = EXPORT_MODULE.rewrite_neutral_refs(
            body, "/home/test/.codex/agents-pipeline"
        )
        self.assertIn(
            "# Source: C:/repo/agents/orchestrator-pipeline.md", rewritten
        )
        self.assertIn(
            "`/home/test/.codex/agents-pipeline/protocols/PIPELINE_PROTOCOL.md`", rewritten
        )
        self.assertIn(
            "`/home/test/.codex/agents-pipeline/skills/frontend-aesthetic-director/SKILL.md`", rewritten
        )

    def test_build_export_command_forwards_neutral_manifest_and_support_root(self) -> None:
        command = INSTALL_MODULE.build_export_command(
            Path("scripts/export-codex-agents.py"),
            Path("agents"),
            Path("modes.json"),
            Path("AGENTS.md"),
            Path(".codex"),
            strict=True,
            max_threads=6,
            max_depth=2,
            job_max_runtime_seconds=None,
            resolve_support_refs_to=Path("/home/test/.codex/agents-pipeline"),
        )
        self.assertIn("--modes-file", command)
        self.assertIn("modes.json", command)
        self.assertIn("--resolve-support-refs-to", command)
        self.assertIn("/home/test/.codex/agents-pipeline", command)

    def test_build_export_command_forwards_model_profile_flags(self) -> None:
        command = INSTALL_MODULE.build_export_command(
            Path("scripts/export-codex-agents.py"),
            Path("agents"),
            Path("modes.json"),
            Path("AGENTS.md"),
            Path(".codex"),
            strict=True,
            max_threads=6,
            max_depth=2,
            job_max_runtime_seconds=None,
            resolve_support_refs_to=None,
            agent_profile="balanced",
            model_set="openai",
            profile_dir=Path("tools/agent-profiles"),
            model_set_dir=Path("runtimes/codex/model-sets"),
            uniform_model="gpt-5.6-terra",
        )

        self.assertIn("--agent-profile", command)
        self.assertIn("balanced", command)
        self.assertIn("--model-set", command)
        self.assertIn("openai", command)
        self.assertIn("--profile-dir", command)
        self.assertIn("tools/agent-profiles", command)
        self.assertIn("--model-set-dir", command)
        self.assertIn("runtimes/codex/model-sets", command)
        self.assertIn("--uniform-model", command)
        self.assertIn("gpt-5.6-terra", command)

    def test_mode_manifest_matches_current_repo_aliases(self) -> None:
        mode_agents = EXPORT_MODULE.load_mode_agents(MODES_PATH)

        self.assertEqual(
            set(mode_agents),
            {
                "flow",
                "pipeline",
                "general",
                "simple",
                "spec",
                "ci",
                "modernize",
                "analysis",
                "ux",
                "committee",
                "monetize",
            },
        )
        self.assertEqual(mode_agents["monetize"], "orchestrator-general")

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
            "用 flow 做",
            "請用 flow",
            "請用 flow 去執行",
        ):
            self.assertIn(f"`{token}`", adapter)
        self.assertIn(self.MODE_ALIAS_AUTHORIZATION_GUARD_LINE, adapter)
        self.assertIn(self.MODE_ALIAS_SKILL_EQUIVALENCE_LINE, adapter)
        self.assertIn(self.WORKSPACE_PROFILE_PREFLIGHT_LINE, adapter)
        self.assertIn(
            "On a recognized mode alias, read the globally installed `$CODEX_HOME/agents/orchestrator-<mode>.toml` (default `~/.codex/agents/orchestrator-<mode>.toml`) as the authoritative workflow definition. Do not manually adopt a repository `.codex/agents/` role; effective Codex configuration controls trusted workspace role routing.",
            adapter,
        )
        self.assertIn(self.MODE_ALIAS_OBEY_DEFINITION_SENTENCE, adapter)
        self.assertIn(self.MODE_ALIAS_NO_BYPASS_SENTENCE, adapter)
        self.assertIn(self.SAME_SESSION_NO_RELOAD_LINE, adapter)
        self.assertIn(self.SAME_SESSION_EXCEPTIONS_LINE, adapter)
        self.assertIn(
            "When reading the installed definition for Codex mode simulation, focus on mode behavior, task decomposition, delegation rules, and output style; ignore adapter details for other runtimes.",
            adapter,
        )
        self.assertIn("Do not infer a mode alias from later mentions", adapter)

    def test_input_adapter_covers_allowlisted_mode_aliases(self) -> None:
        mode_agents = EXPORT_MODULE.load_mode_agents(MODES_PATH)
        agent_aliases = EXPORT_MODULE.build_agent_mode_aliases(mode_agents)
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

    def test_codex_native_goal_aliases_remain_reserved(self) -> None:
        self.assertEqual(EXPORT_MODULE.build_slash_mode_aliases(["goal"]), [])
        self.assertEqual(
            EXPORT_MODULE.build_natural_language_mode_aliases(["goal"]), []
        )

    def test_mode_manifest_rejects_reserved_goal_alias_routing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "modes.json"
            path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "modes": [
                            {
                                "name": "general",
                                "agent": "orchestrator-general",
                                "aliases": ["general", "run-general", "run-goal"],
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "reserved alias 'goal'"):
                EXPORT_MODULE.load_mode_agents(path)

    def test_mode_manifest_missing_file_fails_clearly(self) -> None:
        with self.assertRaisesRegex(ValueError, "Mode manifest not found"):
            EXPORT_MODULE.load_mode_agents(Path("missing-modes.json"))

    def test_mode_manifest_rejects_unknown_version(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "modes.json"
            path.write_text(
                json.dumps(
                    {
                        "version": 2,
                        "modes": [
                            {"name": "flow", "agent": "orchestrator-flow"}
                        ],
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "version must be 1"):
                EXPORT_MODULE.load_mode_agents(path)


if __name__ == "__main__":
    unittest.main()
