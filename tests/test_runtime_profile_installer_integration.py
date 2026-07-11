from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PROFILE_WRAPPER = REPO_ROOT / "scripts/agent-profile.sh"
CODEX_INSTALLER = REPO_ROOT / "scripts/install-codex.sh"
MANIFEST_NAME = ".agents-pipeline-runtime-profile.json"


@dataclass(frozen=True)
class RuntimeCase:
    name: str
    expected_count: int
    uniform_model: str

    @property
    def installer(self) -> Path:
        return REPO_ROOT / f"scripts/install-{self.name}.sh"


RUNTIME_CASES = (
    RuntimeCase("claude", 45, "sonnet"),
    RuntimeCase("copilot", 55, "GPT-5.5"),
)


@unittest.skipUnless(
    shutil.which("bash"), "Bash is required for runtime installer integration tests"
)
class RuntimeProfileInstallerIntegrationTests(unittest.TestCase):
    def run_command(
        self, command: list[str], *, expected: int = 0
    ) -> subprocess.CompletedProcess[str]:
        completed = subprocess.run(
            command,
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            timeout=45,
            check=False,
        )
        if completed.returncode != expected:
            self.fail(
                f"Command returned {completed.returncode}, expected {expected}: {command!r}\n"
                f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
            )
        return completed

    def installer_command(self, case: RuntimeCase, target: Path, *extra: str) -> list[str]:
        command = [
            "bash",
            str(case.installer),
            "--target",
            str(target),
            "--no-backup",
        ]
        if case.name == "claude":
            command.append("--no-runner")
        command.extend(extra)
        return command

    def status(self, case: RuntimeCase, target: Path) -> dict[str, object]:
        completed = self.run_command(
            [
                "bash",
                str(PROFILE_WRAPPER),
                "status",
                "--runtime",
                case.name,
                "--target",
                str(target),
                "--asset-root",
                str(REPO_ROOT),
                "--json",
            ]
        )
        return json.loads(completed.stdout)

    def installed_profile_command(
        self,
        support_root: Path,
        action: str,
        case: RuntimeCase,
        *extra: str,
    ) -> list[str]:
        return [
            "bash",
            str(support_root / "scripts" / "agent-profile.sh"),
            action,
            "--runtime",
            case.name,
            *extra,
        ]

    def assert_status(
        self,
        case: RuntimeCase,
        target: Path,
        *,
        mode: str,
        profile: str | None,
        model_set: str | None,
        uniform_model: str | None,
    ) -> None:
        manifest_path = target / MANIFEST_NAME
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        status = self.status(case, target)
        for payload in (manifest, status):
            self.assertEqual(payload["runtime"], case.name)
            self.assertEqual(payload["managed_generated_count"], case.expected_count)
            self.assertEqual(len(payload["managed_generated_files"]), case.expected_count)
            self.assertEqual(payload["mode"], mode)
            self.assertEqual(payload["profile"], profile)
            self.assertEqual(payload["model_set"], model_set)
            self.assertEqual(payload["uniform_model"], uniform_model)
        self.assertTrue(status["installed"])

    def test_actual_install_status_and_profile_transitions_are_deterministic(self) -> None:
        for case in RUNTIME_CASES:
            with self.subTest(runtime=case.name), tempfile.TemporaryDirectory() as temp_name:
                target = Path(temp_name) / f"{case.name} target with spaces" / "agents"
                named = self.installer_command(
                    case,
                    target,
                    "--agent-profile",
                    "balanced",
                    "--model-set",
                    "default",
                )
                self.run_command(named)
                self.assert_status(
                    case,
                    target,
                    mode="profile",
                    profile="balanced",
                    model_set="default",
                    uniform_model=None,
                )
                first_manifest = (target / MANIFEST_NAME).read_bytes()

                self.run_command(named)
                self.assertEqual((target / MANIFEST_NAME).read_bytes(), first_manifest)

                self.run_command(self.installer_command(case, target))
                self.assert_status(
                    case,
                    target,
                    mode="inherit",
                    profile=None,
                    model_set=None,
                    uniform_model=None,
                )

                self.run_command(
                    self.installer_command(
                        case,
                        target,
                        "--uniform-model",
                        case.uniform_model,
                    )
                )
                self.assert_status(
                    case,
                    target,
                    mode="uniform",
                    profile="uniform",
                    model_set=None,
                    uniform_model=case.uniform_model,
                )

    def test_status_requires_only_the_selected_runtime_adapters(self) -> None:
        runtime_files = {
            "codex": (
                "scripts/codex_mode_aliases.py",
                "scripts/codex-project-profile.py",
                "scripts/export-codex-agents.py",
                "scripts/install-codex-config.py",
                "scripts/install-codex.sh",
                "scripts/install-codex.ps1",
                "scripts/sync-codex-skills.py",
            ),
            "claude": (
                "scripts/export-claude-agents.py",
                "scripts/install-claude.sh",
                "scripts/install-claude.ps1",
            ),
            "copilot": (
                "scripts/export-copilot-agents.py",
                "scripts/install-copilot.sh",
                "scripts/install-copilot.ps1",
            ),
        }
        for case in RUNTIME_CASES:
            with self.subTest(runtime=case.name), tempfile.TemporaryDirectory() as temp_name:
                target = Path(temp_name) / case.name / "agents"
                self.run_command(self.installer_command(case, target))
                support_root = target.parent / "agents-pipeline"

                for runtime, files in runtime_files.items():
                    if runtime == case.name:
                        continue
                    for relative in files:
                        (support_root / relative).unlink()

                decoupled = self.status(case, target)
                self.assertEqual(decoupled["health"], "ok")
                self.assertEqual(decoupled["missing_generated_files"], [])

                own_exporter = f"scripts/export-{case.name}-agents.py"
                (support_root / own_exporter).unlink()
                incomplete = self.status(case, target)
                self.assertEqual(incomplete["health"], "incomplete")
                self.assertTrue(
                    any(
                        str(item).endswith(own_exporter)
                        for item in incomplete["missing_generated_files"]
                    )
                )

    def test_status_requires_common_support_for_each_runtime(self) -> None:
        common_file = "scripts/agent_model_profiles.py"
        for case in RUNTIME_CASES:
            with self.subTest(runtime=case.name), tempfile.TemporaryDirectory() as temp_name:
                target = Path(temp_name) / case.name / "agents"
                self.run_command(self.installer_command(case, target))
                support_root = target.parent / "agents-pipeline"
                (support_root / common_file).unlink()

                incomplete = self.status(case, target)
                self.assertEqual(incomplete["health"], "incomplete")
                self.assertTrue(
                    any(
                        str(item).endswith(common_file)
                        for item in incomplete["missing_generated_files"]
                    )
                )

    def test_installed_codex_manager_relocates_tier2_roles_and_support(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            codex_home = root / "codex" / ".codex"
            self.run_command(
                [
                    "bash",
                    str(CODEX_INSTALLER),
                    "--target",
                    str(codex_home),
                    "--no-backup",
                ]
            )
            codex_support = codex_home / "agents-pipeline"
            wrapper = codex_support / "scripts" / "agent-profile.sh"

            for case in RUNTIME_CASES:
                target = root / case.name / "agents"
                command = [
                    "bash",
                    str(wrapper),
                    "set",
                    "balanced",
                    "--runtime",
                    case.name,
                    "--scope",
                    "global",
                    "--target",
                    str(target),
                    "--model-set",
                    "default",
                    "--no-backup",
                ]
                if case.name == "claude":
                    command.append("--no-runner")
                self.run_command(command)
                support_root = target.parent / "agents-pipeline"
                generated_flow = (
                    target / "orchestrator-flow.md"
                    if case.name == "claude"
                    else target / "orchestrator-flow.agent.md"
                )
                for path in (
                    generated_flow,
                    support_root / "agents" / "orchestrator-flow.md",
                    support_root / "protocols" / "PIPELINE_PROTOCOL.md",
                ):
                    content = path.read_text(encoding="utf-8")
                    with self.subTest(runtime=case.name, path=path):
                        self.assertNotIn(codex_support.as_posix(), content)
                        self.assertIn(support_root.as_posix(), content)

    def test_dry_run_does_not_create_manifest_target_or_support_tree(self) -> None:
        for case in RUNTIME_CASES:
            with self.subTest(runtime=case.name), tempfile.TemporaryDirectory() as temp_name:
                root = Path(temp_name) / case.name
                target = root / "agents"
                support_root = root / "agents-pipeline"
                self.run_command(
                    self.installer_command(
                        case,
                        target,
                        "--dry-run",
                        "--agent-profile",
                        "balanced",
                        "--model-set",
                        "default",
                    )
                )
                self.assertFalse((target / MANIFEST_NAME).exists())
                self.assertFalse(target.exists())
                self.assertFalse(support_root.exists())

    def test_installed_support_tree_profile_manager_lists_clears_and_reports_status(
        self,
    ) -> None:
        for case in RUNTIME_CASES:
            with self.subTest(runtime=case.name), tempfile.TemporaryDirectory() as temp_name:
                root = Path(temp_name) / case.name
                target = root / "agents"
                self.run_command(
                    self.installer_command(
                        case,
                        target,
                        "--agent-profile",
                        "balanced",
                        "--model-set",
                        "default",
                    )
                )

                support_root = root / "agents-pipeline"
                installed_wrapper = support_root / "scripts" / "agent-profile.sh"
                self.assertTrue(installed_wrapper.is_file())
                self.assertTrue(
                    (support_root / "runtimes" / case.name / "model-sets").is_dir()
                )
                self.assertTrue((support_root / "AGENTS.md").is_file())

                listing = json.loads(
                    self.run_command(
                        self.installed_profile_command(
                            support_root,
                            "list",
                            case,
                            "--json",
                        )
                    ).stdout
                )
                self.assertEqual(listing["runtime"], case.name)
                self.assertIn(
                    "balanced", {item["name"] for item in listing["profiles"]}
                )
                self.assertIn(
                    "default", {item["name"] for item in listing["model_sets"]}
                )

                installed_status = json.loads(
                    self.run_command(
                        self.installed_profile_command(
                            support_root,
                            "status",
                            case,
                            "--target",
                            str(target),
                            "--json",
                        )
                    ).stdout
                )
                self.assertTrue(installed_status["installed"])
                self.assertEqual(installed_status["health"], "ok")
                self.assertEqual(installed_status["mode"], "profile")
                self.assertEqual(installed_status["profile"], "balanced")

                clear_extra = [
                    "--target",
                    str(target),
                    "--scope",
                    "global",
                    "--no-backup",
                ]
                if case.name == "claude":
                    clear_extra.append("--no-runner")
                self.run_command(
                    self.installed_profile_command(
                        support_root,
                        "clear",
                        case,
                        *clear_extra,
                    )
                )

                cleared_status = json.loads(
                    self.run_command(
                        self.installed_profile_command(
                            support_root,
                            "status",
                            case,
                            "--target",
                            str(target),
                            "--json",
                        )
                    ).stdout
                )
                self.assertTrue(cleared_status["installed"])
                self.assertEqual(cleared_status["health"], "ok")
                self.assertEqual(cleared_status["mode"], "inherit")
                self.assertIsNone(cleared_status["profile"])
                self.assertIsNone(cleared_status["model_set"])

    @unittest.skipIf(
        os.name == "nt", "Symlink behavior is covered by the Windows Pester smoke"
    )
    def test_direct_installers_reject_symlinked_target_directories(self) -> None:
        for case in RUNTIME_CASES:
            with self.subTest(runtime=case.name), tempfile.TemporaryDirectory() as temp_name:
                root = Path(temp_name) / case.name
                root.mkdir(parents=True)
                outside = Path(temp_name) / f"{case.name}-outside"
                outside.mkdir()
                sentinel = outside / "user-owned.txt"
                sentinel.write_text("preserve target contents\n", encoding="utf-8")
                target = root / "agents"
                try:
                    target.symlink_to(outside, target_is_directory=True)
                except (OSError, NotImplementedError):
                    self.skipTest("symbolic links are unavailable")

                completed = self.run_command(
                    self.installer_command(case, target),
                    expected=2,
                )

                self.assertIn("must not be a symbolic link", completed.stderr)
                self.assertEqual(
                    sentinel.read_text(encoding="utf-8"),
                    "preserve target contents\n",
                )
                self.assertEqual(
                    sorted(path.name for path in outside.iterdir()),
                    [sentinel.name],
                )
                self.assertFalse((root / "agents-pipeline").exists())

    @unittest.skipIf(
        os.name == "nt", "Parent-junction behavior is covered by the Windows Pester smoke"
    )
    def test_direct_installers_canonicalize_symlinked_parent_before_writing(self) -> None:
        for case in RUNTIME_CASES:
            with self.subTest(runtime=case.name), tempfile.TemporaryDirectory() as temp_name:
                root = Path(temp_name) / case.name
                actual_parent = root / "actual"
                actual_parent.mkdir(parents=True)
                linked_parent = root / "linked"
                try:
                    linked_parent.symlink_to(actual_parent, target_is_directory=True)
                except (OSError, NotImplementedError):
                    self.skipTest("symbolic links are unavailable")
                lexical_target = linked_parent / "agents"
                canonical_target = actual_parent / "agents"

                self.run_command(
                    self.installer_command(
                        case,
                        lexical_target,
                        "--agent-profile",
                        "balanced",
                        "--model-set",
                        "default",
                    )
                )

                manifest = json.loads(
                    (canonical_target / MANIFEST_NAME).read_text(encoding="utf-8")
                )
                self.assertEqual(manifest["target"], canonical_target.as_posix())
                self.assertEqual(manifest["managed_generated_count"], case.expected_count)
                self.assertTrue((actual_parent / "agents-pipeline").is_dir())
                status = self.status(case, lexical_target)
                self.assertTrue(status["installed"])
                self.assertEqual(status["health"], "ok")

    @unittest.skipIf(os.name == "nt", "Junction behavior is covered by Pester")
    def test_claude_project_runner_uses_lexical_workspace_when_dot_claude_is_linked(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            workspace = root / "workspace"
            external_claude = root / "external-claude"
            workspace.mkdir()
            external_claude.mkdir()
            try:
                (workspace / ".claude").symlink_to(
                    external_claude, target_is_directory=True
                )
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")

            target = workspace / ".claude/agents"
            self.run_command(
                [
                    "bash",
                    str(REPO_ROOT / "scripts/install-claude.sh"),
                    "--target",
                    str(target),
                    "--no-backup",
                    "--agent-profile",
                    "balanced",
                    "--model-set",
                    "default",
                ]
            )

            self.assertTrue((workspace / "CLAUDE.md").is_file())
            self.assertFalse((external_claude / "CLAUDE.md").exists())
            self.assertTrue(
                (external_claude / "agents" / MANIFEST_NAME).is_file()
            )

    @unittest.skipIf(
        os.name == "nt", "Symlink behavior is covered by the Windows Pester smoke"
    )
    def test_symlinked_manifest_is_rejected_before_support_tree_mutation(self) -> None:
        for case in RUNTIME_CASES:
            with self.subTest(runtime=case.name), tempfile.TemporaryDirectory() as temp_name:
                root = Path(temp_name) / case.name
                target = root / "agents"
                target.mkdir(parents=True)
                support_root = root / "agents-pipeline"
                victim = root / "victim.json"
                victim.write_text("unchanged\n", encoding="utf-8")
                (target / MANIFEST_NAME).symlink_to(victim)

                completed = self.run_command(
                    self.installer_command(
                        case,
                        target,
                        "--agent-profile",
                        "balanced",
                        "--model-set",
                        "default",
                    ),
                    expected=2,
                )
                self.assertIn("must not be a symbolic link", completed.stderr)
                self.assertEqual(victim.read_text(encoding="utf-8"), "unchanged\n")
                self.assertTrue((target / MANIFEST_NAME).is_symlink())
                self.assertFalse(support_root.exists())
                generated_pattern = "*.md" if case.name == "claude" else "*.agent.md"
                self.assertEqual(list(target.glob(generated_pattern)), [])


if __name__ == "__main__":
    unittest.main()
