from __future__ import annotations

import argparse
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[1]
TOOL_PATH = REPO_ROOT / "tools/agent-profile.py"
SPEC = importlib.util.spec_from_file_location("agent_profile_cli", TOOL_PATH)
assert SPEC and SPEC.loader
PROFILE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PROFILE
SPEC.loader.exec_module(PROFILE)


class TtyStringIO(io.StringIO):
    def isatty(self) -> bool:
        return True


class NonTtyStringIO(io.StringIO):
    def isatty(self) -> bool:
        return False


def parse(*values: str) -> argparse.Namespace:
    return PROFILE.build_parser().parse_args(list(values))


class AgentProfileTargetTests(unittest.TestCase):
    def test_link_detection_covers_legacy_python_windows_reparse_points(self) -> None:
        class ReparsePath:
            @staticmethod
            def is_symlink() -> bool:
                return False

            @staticmethod
            def lstat():
                return mock.Mock(st_file_attributes=0x400)

        self.assertTrue(PROFILE._is_linklike(ReparsePath()))

    def test_workspace_targets_match_each_runtime_layout(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            workspace = Path(temp_name) / "project"
            expected = {
                "codex": workspace / ".codex",
                "claude": workspace / ".claude/agents",
                "copilot": workspace / ".github/agents",
            }
            for runtime, target in expected.items():
                with self.subTest(runtime=runtime):
                    self.assertEqual(
                        PROFILE.resolve_target(
                            runtime,
                            "workspace",
                            workspace=workspace,
                            explicit_target=None,
                        ),
                        target.resolve(),
                    )

    def test_global_targets_match_each_runtime_layout(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            home = Path(temp_name) / "home"
            expected = {
                "codex": home / ".codex",
                "claude": home / ".claude/agents",
                "copilot": home / ".copilot/agents",
            }
            for runtime, target in expected.items():
                with self.subTest(runtime=runtime):
                    self.assertEqual(
                        PROFILE.resolve_target(
                            runtime,
                            "global",
                            workspace=Path(temp_name) / "unused",
                            explicit_target=None,
                            home=home,
                        ),
                        target.resolve(),
                    )

    def test_explicit_target_overrides_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / "custom"
            resolved = PROFILE.resolve_target(
                "codex",
                "global",
                workspace=Path(temp_name) / "workspace",
                explicit_target=str(target),
                home=Path(temp_name) / "home",
            )
            self.assertEqual(resolved, target.resolve())

    def test_explicit_target_canonicalizes_symlinked_parent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            actual_parent = root / "actual"
            actual_parent.mkdir()
            linked_parent = root / "linked"
            try:
                linked_parent.symlink_to(actual_parent, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")

            resolved = PROFILE.resolve_target(
                "claude",
                "workspace",
                workspace=root,
                explicit_target=str(linked_parent / "agents"),
            )

            self.assertEqual(resolved, actual_parent / "agents")

    def test_workspace_target_rejects_symlinked_scope_components(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            workspace = Path(temp_name) / "project"
            outside = Path(temp_name) / "outside"
            workspace.mkdir()
            outside.mkdir()
            try:
                (workspace / ".github").symlink_to(outside, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")
            with self.assertRaisesRegex(PROFILE.ProfileError, "symbolic link or junction"):
                PROFILE.resolve_target(
                    "copilot",
                    "workspace",
                    workspace=workspace.resolve(),
                    explicit_target=None,
                )

    def test_explicit_target_rejects_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            outside = root / "outside"
            outside.mkdir()
            target = root / "target"
            try:
                target.symlink_to(outside, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")
            with self.assertRaisesRegex(PROFILE.ProfileError, "symbolic link or junction"):
                PROFILE.resolve_target(
                    "claude",
                    "workspace",
                    workspace=root,
                    explicit_target=str(target),
                )


class AgentProfileInteractionTests(unittest.TestCase):
    def test_non_tty_missing_action_fails_without_reading(self) -> None:
        args = parse("--asset-root", str(REPO_ROOT))
        with self.assertRaisesRegex(PROFILE.ProfileError, "Missing required action in non-interactive mode"):
            PROFILE.resolve_request(
                args,
                stdin=NonTtyStringIO("1\n"),
                stdout=NonTtyStringIO(),
            )

    def test_non_tty_missing_runtime_fails_clearly(self) -> None:
        args = parse("list", "--asset-root", str(REPO_ROOT))
        with self.assertRaisesRegex(PROFILE.ProfileError, "pass --runtime explicitly"):
            PROFILE.resolve_request(
                args,
                stdin=NonTtyStringIO(),
                stdout=NonTtyStringIO(),
            )

    def test_non_tty_set_and_install_alias_require_complete_choices(self) -> None:
        for action in ("set", "install"):
            base = [action, "--runtime", "codex", "--asset-root", str(REPO_ROOT)]
            with self.subTest(action=action, missing="profile"), self.assertRaisesRegex(
                PROFILE.ProfileError, "pass --profile explicitly"
            ):
                PROFILE.resolve_request(
                    parse(*base),
                    stdin=NonTtyStringIO(),
                    stdout=NonTtyStringIO(),
                )
            with self.subTest(action=action, missing="model-set"), self.assertRaisesRegex(
                PROFILE.ProfileError, "pass --model-set explicitly"
            ):
                PROFILE.resolve_request(
                    parse(*base, "--profile", "balanced"),
                    stdin=NonTtyStringIO(),
                    stdout=NonTtyStringIO(),
                )

    def test_non_tty_codex_set_defaults_to_workspace_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            workspace = Path(temp_name) / "project"
            request = PROFILE.resolve_request(
                parse(
                    "set",
                    "balanced",
                    "--runtime",
                    "codex",
                    "--workspace",
                    str(workspace),
                    "--model-set",
                    "openai",
                    "--asset-root",
                    str(REPO_ROOT),
                ),
                stdin=NonTtyStringIO(),
                stdout=NonTtyStringIO(),
            )
            self.assertEqual(request.scope, "workspace")
            self.assertEqual(request.target, (workspace / ".codex").resolve())

    def test_interactive_defaults_choose_codex_workspace_balanced_openai(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            workspace = Path(temp_name) / "project"
            home = Path(temp_name) / "home"
            args = parse(
                "--workspace",
                str(workspace),
                "--asset-root",
                str(REPO_ROOT),
            )
            output = TtyStringIO()
            request = PROFILE.resolve_request(
                args,
                stdin=TtyStringIO("\n\n\n\n"),
                stdout=output,
                home=home,
            )
            self.assertEqual(request.action, "set")
            self.assertEqual(request.runtime, "codex")
            self.assertEqual(request.scope, "workspace")
            self.assertEqual(request.profile, "balanced")
            self.assertEqual(request.model_set, "openai")
            self.assertEqual(request.target, (workspace / ".codex").resolve())
            self.assertIn("Codex (recommended)", output.getvalue())
            self.assertNotIn("Choose a profile scope", output.getvalue())
            self.assertNotIn("Workspace path", output.getvalue())

    def test_interactive_workspace_path_can_be_selected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            workspace = Path(temp_name) / "selected project"
            args = parse("--asset-root", str(REPO_ROOT))
            output = TtyStringIO()
            request = PROFILE.resolve_request(
                args,
                stdin=TtyStringIO(f"\n\n{workspace}\n\n\n"),
                stdout=output,
            )
            self.assertEqual(request.workspace, workspace.resolve())
            self.assertEqual(request.target, (workspace / ".codex").resolve())
            self.assertIn("Workspace path", output.getvalue())

    def test_non_tty_custom_codex_target_must_be_the_workspace_codex_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            args = parse(
                "install",
                "balanced",
                "--runtime",
                "codex",
                "--target",
                str(Path(temp_name) / "custom-codex"),
                "--model-set",
                "openai",
                "--asset-root",
                str(REPO_ROOT),
            )
            with self.assertRaisesRegex(
                PROFILE.ProfileError, "always target <workspace>/.codex"
            ):
                PROFILE.resolve_request(
                    args, stdin=NonTtyStringIO(), stdout=NonTtyStringIO()
                )

    def test_canonical_global_codex_target_rejects_model_profile(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            home = Path(temp_name) / "home"
            args = parse(
                "install",
                "balanced",
                "--runtime",
                "codex",
                "--target",
                str(home / ".codex"),
                "--model-set",
                "openai",
                "--asset-root",
                str(REPO_ROOT),
            )
            with self.assertRaisesRegex(PROFILE.ProfileError, "workspace-only"):
                PROFILE.resolve_request(
                    args,
                    stdin=NonTtyStringIO(),
                    stdout=NonTtyStringIO(),
                    home=home,
                )

    def test_explicit_codex_global_set_rejects_named_and_uniform_profiles(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            home = Path(temp_name) / "home"
            cases = (
                ("balanced", "--model-set", "openai"),
                ("uniform", "--uniform-model", "gpt-5.6-terra"),
            )
            for values in cases:
                with self.subTest(profile=values[0]), self.assertRaisesRegex(
                    PROFILE.ProfileError, "workspace-only"
                ):
                    PROFILE.resolve_request(
                        parse(
                            "set",
                            *values,
                            "--runtime",
                            "codex",
                            "--scope",
                            "global",
                            "--asset-root",
                            str(REPO_ROOT),
                        ),
                        stdin=NonTtyStringIO(),
                        stdout=NonTtyStringIO(),
                        home=home,
                    )

    def test_codex_workspace_profile_rejects_a_noncanonical_explicit_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            with self.assertRaisesRegex(
                PROFILE.ProfileError, "always target <workspace>/.codex"
            ):
                PROFILE.resolve_request(
                    parse(
                        "set",
                        "balanced",
                        "--runtime",
                        "codex",
                        "--scope",
                        "workspace",
                        "--workspace",
                        str(root / "project"),
                        "--target",
                        str(root / "ignored-target"),
                        "--model-set",
                        "openai",
                        "--asset-root",
                        str(REPO_ROOT),
                    ),
                    stdin=NonTtyStringIO(),
                    stdout=NonTtyStringIO(),
                    home=root / "home",
                )

    def test_codex_global_scope_honors_codex_home_outside_user_home(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            custom_home = Path(temp_name) / "custom-codex-home"
            with mock.patch.dict(
                os.environ, {"CODEX_HOME": str(custom_home)}, clear=False
            ):
                request = PROFILE.resolve_request(
                    parse(
                        "status",
                        "--runtime",
                        "codex",
                        "--scope",
                        "global",
                        "--asset-root",
                        str(REPO_ROOT),
                    ),
                    stdin=NonTtyStringIO(),
                    stdout=NonTtyStringIO(),
                )
            self.assertEqual(request.target, custom_home.resolve())

    def test_codex_status_explicit_target_defaults_to_global_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / "custom-codex"
            request = PROFILE.resolve_request(
                parse(
                    "status",
                    "--runtime",
                    "codex",
                    "--target",
                    str(target),
                    "--asset-root",
                    str(REPO_ROOT),
                ),
                stdin=NonTtyStringIO(),
                stdout=NonTtyStringIO(),
            )
            self.assertEqual(request.scope, "global")
            self.assertEqual(request.target, target.resolve())

    def test_installed_wrapper_owner_precedes_ambient_codex_home(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            installed_home = root / "installed"
            asset_root = installed_home / "agents-pipeline"
            asset_root.mkdir(parents=True)
            (installed_home / PROFILE.CODEX_MANIFEST_FILENAME).write_text(
                "{}\n", encoding="utf-8"
            )
            with mock.patch.dict(
                os.environ, {"CODEX_HOME": str(root / "ambient")}, clear=False
            ):
                resolved = PROFILE._default_codex_target(
                    home=None, asset_root=asset_root
                )
            self.assertEqual(resolved, installed_home.resolve())

    def test_list_needs_no_scope_in_non_interactive_mode(self) -> None:
        request = PROFILE.resolve_request(
            parse("list", "--runtime", "claude", "--asset-root", str(REPO_ROOT)),
            stdin=NonTtyStringIO(),
            stdout=NonTtyStringIO(),
        )
        self.assertEqual(request.action, "list")
        self.assertEqual(request.scope, "global")
        self.assertEqual(request.runtime, "claude")


class AgentProfileCommandTests(unittest.TestCase):
    def resolve(self, *values: str, home: Path | None = None) -> tuple[argparse.Namespace, object]:
        args = parse(*values, "--asset-root", str(REPO_ROOT))
        request = PROFILE.resolve_request(
            args,
            stdin=NonTtyStringIO(),
            stdout=NonTtyStringIO(),
            home=home,
        )
        return args, request

    def test_codex_workspace_set_uses_thin_project_profile_helper(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            installed_helper = (
                home
                / ".codex"
                / "agents-pipeline"
                / "scripts"
                / "codex-project-profile.py"
            )
            installed_helper.parent.mkdir(parents=True)
            installed_helper.write_text("# fixture\n", encoding="utf-8")
            args, request = self.resolve(
                "set",
                "balanced",
                "--runtime",
                "codex",
                "--scope",
                "workspace",
                "--workspace",
                str(root / "project"),
                "--model-set",
                "openai",
                home=home,
            )
            with mock.patch.dict(
                os.environ, {"CODEX_HOME": str((home / ".codex").resolve())}
            ):
                command = PROFILE.build_project_profile_command(request, args, home=home)
            self.assertEqual(Path(command[1]), installed_helper.resolve())
            self.assertEqual(command[2], "set")
            self.assertIn("--global-target", command)
            global_index = command.index("--global-target")
            self.assertEqual(command[global_index + 1], str((home / ".codex").resolve()))
            self.assertIn("--profile", command)
            self.assertIn("balanced", command)
            self.assertIn("--model-set", command)
            self.assertIn("openai", command)
            self.assertNotIn("install-codex.sh", " ".join(command))

    def test_clear_reruns_installer_without_profile_flags(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            args, request = self.resolve(
                "clear",
                "--runtime",
                "copilot",
                "--scope",
                "global",
                home=Path(temp_name),
            )
            command = PROFILE.build_install_command(request, args, windows=False)
            joined = " ".join(command)
            self.assertNotIn("--agent-profile", joined)
            self.assertNotIn("--model-set", joined)
            self.assertNotIn("--uniform-model", joined)
            self.assertIn(str((Path(temp_name) / ".copilot/agents").resolve()), command)

    def test_codex_global_clear_preserves_manifest_user_skill_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            target = (root / "custom-codex").resolve()
            user_skills = (root / "custom-user-skills").resolve()
            target.mkdir(parents=True)
            (target / PROFILE.CODEX_MANIFEST_FILENAME).write_text(
                json.dumps(
                    {
                        "managed_skill_marker_version": PROFILE.SKILL_MARKER_VERSION,
                        "managed_skill_names": sorted(PROFILE.MANAGED_SKILL_NAMES),
                        "managed_skill_sync_state": PROFILE.SKILL_SYNC_STATE_READY,
                        "managed_user_skills_root": user_skills.as_posix(),
                        "target_dir": target.as_posix(),
                        "tool": PROFILE.CODEX_MANIFEST_TOOL,
                        "version": PROFILE.CODEX_MANIFEST_VERSION,
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            args, request = self.resolve(
                "clear",
                "--runtime",
                "codex",
                "--scope",
                "global",
                "--target",
                str(target),
            )

            for windows, flag in (
                (False, "--user-skills-root"),
                (True, "-UserSkillsRoot"),
            ):
                with self.subTest(windows=windows):
                    command = PROFILE.build_install_command(
                        request, args, windows=windows
                    )
                    self.assertIn(flag, command)
                    self.assertEqual(command[command.index(flag) + 1], user_skills.as_posix())

    def test_windows_command_dispatches_powershell_installer(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            args, request = self.resolve(
                "install",
                "uniform",
                "--runtime",
                "claude",
                "--scope",
                "global",
                "--uniform-model",
                "sonnet",
                home=Path(temp_name),
            )
            with mock.patch.object(PROFILE.shutil, "which", return_value="C:/Tools/pwsh.exe"):
                command = PROFILE.build_install_command(request, args, windows=True)
            self.assertEqual(command[:3], ["C:/Tools/pwsh.exe", "-NoProfile", "-File"])
            self.assertTrue(command[3].endswith("install-claude.ps1"))
            self.assertIn("-UniformModel", command)
            self.assertIn("sonnet", command)

    def test_claude_workspace_profile_only_set_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            workspace = Path(temp_name) / "project"
            with self.assertRaisesRegex(
                PROFILE.ProfileError,
                "Workspace profile-only setup is not supported",
            ):
                self.resolve(
                    "set",
                    "balanced",
                    "--runtime",
                    "claude",
                    "--scope",
                    "workspace",
                    "--workspace",
                    str(workspace),
                    "--model-set",
                    "default",
                )

    def test_explicit_claude_target_leaves_runner_autodetection_to_installer(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / ".claude" / "agents"
            args, request = self.resolve(
                "install",
                "balanced",
                "--runtime",
                "claude",
                "--scope",
                "global",
                "--target",
                str(target),
                "--model-set",
                "default",
            )
            command = PROFILE.build_install_command(request, args, windows=False)
            self.assertNotIn("--claude-md", command)

    def test_execute_uses_constructed_installer_command(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            args, request = self.resolve(
                "clear",
                "--runtime",
                "claude",
                "--scope",
                "global",
                "--target",
                str(Path(temp_name) / "agents"),
            )
            seen: list[list[str]] = []

            def runner(command: list[str]) -> subprocess.CompletedProcess[str]:
                seen.append(command)
                return subprocess.CompletedProcess(command, 0)

            self.assertEqual(PROFILE.execute(args, request, runner=runner), 0)
            self.assertEqual(len(seen), 1)
            self.assertTrue(seen[0][1].endswith("install-claude.sh"))


class AgentProfileManifestTests(unittest.TestCase):
    def resolve_record(self, target: Path, *extra: str) -> tuple[argparse.Namespace, object]:
        args = parse(
            "record",
            "--runtime",
            "claude",
            "--target",
            str(target),
            "--asset-root",
            str(REPO_ROOT),
            *extra,
        )
        request = PROFILE.resolve_request(
            args,
            stdin=NonTtyStringIO(),
            stdout=NonTtyStringIO(),
        )
        return args, request

    def test_record_is_deterministic_and_status_is_normalized(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / "agents"
            target.mkdir(parents=True)
            generated = target / "executor.md"
            generated.write_text(
                "<!-- Generated by scripts/export-claude-agents.py -->\nbody\n",
                encoding="utf-8",
            )
            args, request = self.resolve_record(
                target,
                "--profile",
                "balanced",
                "--model-set",
                "default",
            )
            manifest_path = PROFILE.record_manifest(request, args)
            first = manifest_path.read_bytes()
            PROFILE.record_manifest(request, args)
            self.assertEqual(first, manifest_path.read_bytes())

            status_args = parse(
                "status",
                "--runtime",
                "claude",
                "--target",
                str(target),
                "--asset-root",
                str(REPO_ROOT),
            )
            status_request = PROFILE.resolve_request(
                status_args,
                stdin=NonTtyStringIO(),
                stdout=NonTtyStringIO(),
            )
            status = PROFILE.read_status(status_request)
            assert status is not None
            self.assertEqual(status["runtime"], "claude")
            self.assertEqual(status["profile"], "balanced")
            self.assertEqual(status["model_set"], "default")
            self.assertEqual(status["managed_generated_files"], ["executor.md"])
            self.assertEqual(status["managed_generated_count"], 1)
            self.assertEqual(status["health"], "incomplete")
            self.assertTrue(
                any(
                    str(item).startswith("support:")
                    for item in status["missing_generated_files"]
                )
            )
            raw = json.loads(first)
            self.assertNotIn("timestamp", raw)
            self.assertNotIn("generated_at", raw)

    def test_record_rejects_symlink_manifest_without_touching_victim(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            target = root / "agents"
            target.mkdir()
            victim = root / "victim.json"
            victim.write_text("unchanged\n", encoding="utf-8")
            (target / PROFILE.COMMON_MANIFEST_FILENAME).symlink_to(victim)
            args, request = self.resolve_record(target)
            with self.assertRaisesRegex(PROFILE.ProfileError, "must not be a symbolic link"):
                PROFILE.record_manifest(request, args)
            self.assertEqual(victim.read_text(encoding="utf-8"), "unchanged\n")

    def test_record_dry_run_validates_leaf_without_writing_or_existing_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / "missing" / "agents"
            args, request = self.resolve_record(
                target,
                "--dry-run",
                "--managed-file",
                "not-created-yet.md",
            )
            path = PROFILE.record_manifest(request, args)
            self.assertEqual(path, target.resolve() / PROFILE.COMMON_MANIFEST_FILENAME)
            self.assertFalse(path.exists())
            self.assertFalse(target.exists())

    def test_record_dry_run_rejects_invalid_argument_combinations(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / "agents"
            args, request = self.resolve_record(
                target,
                "--dry-run",
                "--profile",
                "balanced",
            )
            with self.assertRaisesRegex(PROFILE.ProfileError, "requires --model-set"):
                PROFILE.record_manifest(request, args)

    def test_record_dry_run_rejects_escaping_managed_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / "agents"
            args, request = self.resolve_record(
                target,
                "--dry-run",
                "--managed-file",
                "../victim.md",
            )
            with self.assertRaisesRegex(PROFILE.ProfileError, "escapes target"):
                PROFILE.record_manifest(request, args)

    def test_record_rejects_explicit_symlink_managed_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            target = root / "agents"
            target.mkdir()
            victim = root / "victim.md"
            victim.write_text("content", encoding="utf-8")
            (target / "executor.md").symlink_to(victim)
            args, request = self.resolve_record(target, "--managed-file", "executor.md")
            with self.assertRaisesRegex(PROFILE.ProfileError, "must not be a symbolic link"):
                PROFILE.record_manifest(request, args)

    def test_status_rejects_wrong_runtime_and_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / "agents"
            target.mkdir()
            args, request = self.resolve_record(target)
            manifest_path = PROFILE.record_manifest(request, args)
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            data["runtime"] = "copilot"
            manifest_path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(PROFILE.ProfileError, "invalid runtime"):
                PROFILE.read_status(request)
            data["runtime"] = "claude"
            data["target"] = str(target.parent / "elsewhere")
            manifest_path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(PROFILE.ProfileError, "manifest target does not match"):
                PROFILE.read_status(request)

    def test_status_rejects_escaping_common_managed_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / "agents"
            target.mkdir()
            args, request = self.resolve_record(target)
            manifest_path = PROFILE.record_manifest(request, args)
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            data["managed_generated_count"] = 1
            data["managed_generated_files"] = ["../../victim"]
            manifest_path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(PROFILE.ProfileError, "unsafe managed generated file"):
                PROFILE.read_status(request)

    def test_codex_native_manifest_is_read_and_validated(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / ".codex"
            target.mkdir()
            manifest = {
                "tool": PROFILE.CODEX_MANIFEST_TOOL,
                "version": PROFILE.CODEX_MANIFEST_VERSION,
                "managed_support_root": "agents-pipeline",
                "managed_user_skills_root": None,
                "managed_skill_names": [],
                "managed_skill_marker_version": None,
                "managed_skill_sync_state": None,
                "target_dir": target.resolve().as_posix(),
                "mode": "profile",
                "profile": "balanced",
                "model_set": "openai",
                "uniform_model": None,
                "managed_agent_names": ["executor"],
                "managed_agent_files": ["agents/executor.toml"],
            }
            (target / PROFILE.CODEX_MANIFEST_FILENAME).write_text(
                json.dumps(manifest), encoding="utf-8"
            )
            args = parse(
                "status",
                "--runtime",
                "codex",
                "--target",
                str(target),
                "--asset-root",
                str(REPO_ROOT),
            )
            request = PROFILE.resolve_request(
                args, stdin=NonTtyStringIO(), stdout=NonTtyStringIO()
            )
            status = PROFILE.read_status(request)
            assert status is not None
            self.assertEqual(status["profile"], "balanced")
            self.assertEqual(status["managed_generated_count"], 1)
            self.assertEqual(status["health"], "incomplete")

            manifest["managed_agent_names"] = ["reviewer"]
            (target / PROFILE.CODEX_MANIFEST_FILENAME).write_text(
                json.dumps(manifest), encoding="utf-8"
            )
            with self.assertRaisesRegex(PROFILE.ProfileError, "names do not match"):
                PROFILE.read_status(request)

    def test_codex_health_helpers_report_invalid_utf8_without_traceback(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / ".codex"
            (target / "agents").mkdir(parents=True)
            (target / "config.toml").write_bytes(b"\xff\xfe")
            self.assertEqual(
                PROFILE._missing_codex_config_registration(target, ["executor"]),
                [f"config:{target / 'config.toml'}:invalid"],
            )
            (target / "AGENTS.override.md").write_bytes(b"\xff\xfe")
            self.assertEqual(
                PROFILE._missing_codex_global_agents(target),
                [f"global-agents:{target / 'AGENTS.override.md'}:unreadable"],
            )

    def test_status_accepts_previous_codex_v2_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            target = Path(temp_name) / ".codex"
            target.mkdir()
            manifest = {
                "tool": PROFILE.CODEX_MANIFEST_TOOL,
                "version": 2,
                "target_dir": target.resolve().as_posix(),
                "mode": "default",
                "profile": None,
                "model_set": None,
                "uniform_model": None,
                "managed_agent_names": ["executor"],
                "managed_agent_files": ["agents/executor.toml"],
            }
            (target / PROFILE.CODEX_MANIFEST_FILENAME).write_text(
                json.dumps(manifest), encoding="utf-8"
            )
            args = parse(
                "status",
                "--runtime",
                "codex",
                "--target",
                str(target),
                "--asset-root",
                str(REPO_ROOT),
            )
            request = PROFILE.resolve_request(
                args, stdin=NonTtyStringIO(), stdout=NonTtyStringIO()
            )
            status = PROFILE.read_status(request)
            assert status is not None
            self.assertEqual(status["mode"], "inherit")


class AgentProfileSurfaceTests(unittest.TestCase):
    def test_cli_sources_do_not_reference_retired_runtime(self) -> None:
        forbidden = "open" + "code"
        for relative in (
            "tools/agent-profile.py",
            "scripts/agent-profile.sh",
            "scripts/agent-profile.ps1",
        ):
            with self.subTest(path=relative):
                content = (REPO_ROOT / relative).read_text(encoding="utf-8").lower()
                self.assertNotIn(forbidden, content)

    def test_subprocess_non_tty_never_waits_for_input(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(TOOL_PATH)],
            input="",
            text=True,
            capture_output=True,
            timeout=5,
            cwd=REPO_ROOT,
        )
        self.assertEqual(completed.returncode, 2)
        self.assertIn("Missing required action in non-interactive mode", completed.stderr)


if __name__ == "__main__":
    unittest.main()
