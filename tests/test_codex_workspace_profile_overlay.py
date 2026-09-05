from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[1]
CODEX_INSTALLER = REPO_ROOT / "scripts" / "install-codex.sh"
PROFILE_TOOL = REPO_ROOT / "tools" / "agent-profile.py"
PROJECT_PROFILE_MANIFEST = ".agents-pipeline-project-profile.json"
RELEASE_VERSION = (REPO_ROOT / "VERSION").read_text(encoding="utf-8").strip()


def load_project_profile_module():
    path = REPO_ROOT / "scripts" / "codex-project-profile.py"
    scripts_dir = path.parent.as_posix()
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    spec = importlib.util.spec_from_file_location("codex_project_profile", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


PROJECT_PROFILE = load_project_profile_module()


@unittest.skipUnless(shutil.which("bash"), "Bash is required for Codex install smoke tests")
class CodexWorkspaceProfileOverlayTests(unittest.TestCase):
    maxDiff = None

    def run_command(
        self,
        command: list[str],
        *,
        env: dict[str, str],
        expected: int = 0,
        cwd: Path = REPO_ROOT,
    ) -> subprocess.CompletedProcess[str]:
        completed = subprocess.run(
            command,
            cwd=cwd,
            env=env,
            text=True,
            capture_output=True,
            timeout=90,
            check=False,
        )
        if completed.returncode != expected:
            self.fail(
                f"Command returned {completed.returncode}, expected {expected}: {command!r}\n"
                f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
            )
        return completed

    def isolated_environment(self, home: Path) -> dict[str, str]:
        home.mkdir(parents=True, exist_ok=True)
        return {
            **os.environ,
            "HOME": home.as_posix(),
            "USERPROFILE": home.as_posix(),
            "CODEX_HOME": (home / ".codex").as_posix(),
        }

    def assert_model_free_roles(self, roles_dir: Path) -> None:
        role_paths = sorted(roles_dir.glob("*.toml"))
        self.assertTrue(role_paths)
        for role_path in role_paths:
            with self.subTest(global_role=role_path.name):
                role = tomllib.loads(role_path.read_text(encoding="utf-8"))
                self.assertNotIn("model", role)
                self.assertNotIn("model_provider", role)

    def install_global_codex(self, home: Path, env: dict[str, str]) -> tuple[Path, Path]:
        codex_home = home / ".codex"
        self.run_command(
            [
                "bash",
                CODEX_INSTALLER.as_posix(),
                "--target",
                codex_home.as_posix(),
                "--no-backup",
            ],
            env=env,
        )
        profile_wrapper = codex_home / "agents-pipeline" / "scripts" / "agent-profile.sh"
        self.assertTrue(profile_wrapper.is_file())
        self.assertTrue((codex_home / "agents").is_dir())
        self.assertTrue((codex_home / "agents-pipeline" / "skills").is_dir())
        self.assertTrue((codex_home / "agents-pipeline" / "tools").is_dir())
        self.assertTrue(self.balanced_cache(codex_home).is_dir())
        self.assert_model_free_roles(codex_home / "agents")
        global_status = json.loads(
            self.run_command(
                [
                    "bash",
                    profile_wrapper.as_posix(),
                    "status",
                    "--runtime",
                    "codex",
                    "--scope",
                    "global",
                    "--json",
                ],
                env=env,
            ).stdout
        )
        self.assertEqual(global_status["health"], "ok")
        self.assertEqual(global_status["mode"], "inherit")
        self.assertIsNone(global_status["profile"])
        self.assertIsNone(global_status["model_set"])
        self.assertIsNone(global_status["uniform_model"])
        return codex_home, profile_wrapper

    def balanced_cache(self, codex_home: Path) -> Path:
        return (
            codex_home
            / "agents-pipeline-profiles"
            / f"v{RELEASE_VERSION}"
            / "codex"
            / "openai"
            / "balanced"
            / "agents"
        )

    def set_project_trust(
        self, codex_home: Path, workspace: Path, trust_level: str
    ) -> None:
        config = codex_home / "config.toml"
        with config.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(
                "\n[projects."
                + json.dumps(str(workspace.resolve()), ensure_ascii=False)
                + "]\n"
                + f'trust_level = "{trust_level}"\n'
            )

    def run_profile(
        self,
        wrapper: Path,
        action: str,
        workspace: Path,
        *,
        env: dict[str, str],
        profile: str = "balanced",
        model_set: str = "openai",
        expected: int = 0,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            "bash",
            wrapper.as_posix(),
            action,
            profile,
            "--runtime",
            "codex",
            "--scope",
            "workspace",
            "--workspace",
            workspace.as_posix(),
        ]
        if action in ("set", "install"):
            command.extend(["--model-set", model_set])
        command.append("--no-backup")
        return self.run_command(command, env=env, expected=expected)

    def workspace_status(
        self,
        wrapper: Path,
        workspace: Path,
        *,
        env: dict[str, str],
    ) -> dict[str, object]:
        completed = self.run_command(
            [
                "bash",
                wrapper.as_posix(),
                "status",
                "--runtime",
                "codex",
                "--scope",
                "workspace",
                "--workspace",
                workspace.as_posix(),
                "--json",
            ],
            env=env,
        )
        return json.loads(completed.stdout)

    def resolve_recovery(
        self,
        wrapper: Path,
        workspace: Path,
        *,
        env: dict[str, str],
        agent: str = "executor",
        model_tier: str = "strong",
        expected: int = 0,
    ) -> subprocess.CompletedProcess[str]:
        return self.run_command(
            [
                "bash",
                wrapper.as_posix(),
                "resolve-recovery",
                "--runtime",
                "codex",
                "--scope",
                "workspace",
                "--workspace",
                workspace.as_posix(),
                "--agent",
                agent,
                "--model-tier",
                model_tier,
                "--json",
            ],
            env=env,
            expected=expected,
        )

    def read_overlay_agent_files(self, workspace: Path) -> dict[str, Path]:
        config_path = workspace / ".codex" / "config.toml"
        config = tomllib.loads(config_path.read_text(encoding="utf-8"))
        agents = config.get("agents")
        self.assertIsInstance(agents, dict)
        result: dict[str, Path] = {}
        for name, value in agents.items():
            if isinstance(value, dict) and isinstance(value.get("config_file"), str):
                result[name] = Path(value["config_file"])
        self.assertGreater(len(result), 0)
        return result

    def assert_workspace_local_profile(
        self,
        workspace: Path,
        codex_home: Path,
        status: dict[str, object],
    ) -> dict[str, Path]:
        local_codex = workspace / ".codex"
        manifest = Path(str(status["manifest"]))
        self.assertEqual(
            manifest,
            (local_codex / PROJECT_PROFILE_MANIFEST).resolve(),
        )
        self.assertTrue(manifest.is_file())
        self.assertEqual(
            {path.name for path in local_codex.iterdir()},
            {"agents", "config.toml", PROJECT_PROFILE_MANIFEST},
        )
        for forbidden in ("agents-pipeline", "skills", "scripts", "protocols"):
            self.assertFalse((local_codex / forbidden).exists())

        agent_files = self.read_overlay_agent_files(workspace)
        expected_roles = (local_codex / "agents").resolve()
        for name, config_file in agent_files.items():
            with self.subTest(agent=name):
                self.assertTrue(config_file.is_absolute())
                self.assertTrue(config_file.is_file())
                self.assertEqual(config_file.parent.resolve(), expected_roles)
                self.assertTrue(config_file.is_relative_to(workspace.resolve()))
                self.assertFalse(config_file.is_relative_to(codex_home.resolve()))
                role = tomllib.loads(config_file.read_text(encoding="utf-8"))
                self.assertNotIn("model_provider", role)
        self.assertEqual(
            {path.name for path in expected_roles.glob("*.toml")},
            {f"{name}.toml" for name in agent_files},
        )
        return agent_files

    def test_global_install_then_workspace_set_materializes_local_roles_and_clear_is_safe(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            workspace_config = workspace / ".codex" / "config.toml"
            workspace_config.parent.mkdir(parents=True)
            user_config = (
                'approval_policy = "never"\n'
                'sandbox_mode = "workspace-write"\n\n'
                'note = """\n'
                "# BEGIN agents-pipeline-codex-project-profile\n"
                "DO NOT DELETE THIS USER STRING\n"
                "# END agents-pipeline-codex-project-profile\n"
                '"""\n\n'
                "[features]\n"
                "web_search = true\n"
            )
            workspace_config.write_text(user_config, encoding="utf-8")
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            global_role_hashes = {
                path.name: PROJECT_PROFILE._sha256_file(path)
                for path in (codex_home / "agents").glob("*.toml")
            }
            global_config = (codex_home / "config.toml").read_bytes()
            cache_root = codex_home / "agents-pipeline-profiles"
            shutil.rmtree(cache_root)

            set_result = self.run_profile(wrapper, "set", workspace, env=env)
            self.assertIn("Reviewer model: gpt-6-astra", set_result.stdout)
            self.assertFalse(cache_root.exists())
            self.assertEqual(
                global_role_hashes,
                {
                    path.name: PROJECT_PROFILE._sha256_file(path)
                    for path in (codex_home / "agents").glob("*.toml")
                },
            )
            self.assertEqual((codex_home / "config.toml").read_bytes(), global_config)
            status = self.workspace_status(wrapper, workspace, env=env)
            self.assertTrue(status["installed"])
            self.assertEqual(status["runtime"], "codex")
            self.assertEqual(status["health"], "ok")
            self.assertEqual(status["mode"], "profile")
            self.assertEqual(status["profile"], "balanced")
            self.assertEqual(status["model_set"], "openai")
            manifest = Path(str(status["manifest"]))
            local_agent_files = self.assert_workspace_local_profile(
                workspace, codex_home, status
            )
            expected_balanced_models = {
                "peon": "gpt-5.6-luna",
                "generalist": "gpt-5.6-terra",
                "reviewer": "gpt-6-astra",
            }
            for role_name, expected_model in expected_balanced_models.items():
                with self.subTest(role=role_name):
                    role_config = tomllib.loads(
                        local_agent_files[role_name].read_text(encoding="utf-8")
                    )
                    self.assertEqual(role_config["name"], role_name)
                    self.assertTrue(role_config["description"])
                    self.assertEqual(role_config["model"], expected_model)
            self.assertEqual(status["managed_generated_count"], len(local_agent_files))
            self.assertEqual(
                set(status["managed_generated_files"]),
                {f"agents/{name}.toml" for name in local_agent_files},
            )

            tampered_role = next(iter(local_agent_files.values()))
            tampered_role.write_text(
                tampered_role.read_text(encoding="utf-8") + "# tampered\n",
                encoding="utf-8",
            )
            tampered_status = self.workspace_status(wrapper, workspace, env=env)
            self.assertEqual(tampered_status["health"], "incomplete")
            self.assertTrue(
                any(
                    str(item).endswith(":sha256")
                    for item in tampered_status["missing_generated_files"]
                )
            )
            self.run_profile(wrapper, "set", workspace, env=env)
            self.assertEqual(
                self.workspace_status(wrapper, workspace, env=env)["health"],
                "ok",
            )
            self.assertNotIn("# tampered", tampered_role.read_text(encoding="utf-8"))

            self.run_profile(wrapper, "clear", workspace, env=env)
            self.assertFalse(manifest.exists())
            self.assertTrue(workspace_config.is_file())
            self.assertEqual(
                tomllib.loads(workspace_config.read_text(encoding="utf-8")),
                tomllib.loads(user_config),
            )
            self.assertIn(
                "DO NOT DELETE THIS USER STRING",
                workspace_config.read_text(encoding="utf-8"),
            )
            self.assertEqual(
                {path.name for path in workspace_config.parent.iterdir()},
                {"config.toml"},
            )
            self.assertFalse((workspace / ".codex" / "agents").exists())
            for local_file in local_agent_files.values():
                self.assertFalse(local_file.exists())
            self.assertEqual(
                global_role_hashes,
                {
                    path.name: PROJECT_PROFILE._sha256_file(path)
                    for path in (codex_home / "agents").glob("*.toml")
                },
            )

            cleared = self.workspace_status(wrapper, workspace, env=env)
            self.assertFalse(cleared["installed"])

    def test_workspace_model_set_switches_persist_projection_identity_and_clear(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            self.set_project_trust(codex_home, workspace, "trusted")

            self.run_profile(
                wrapper,
                "set",
                workspace,
                env=env,
                model_set="openai-luna-sol-astra",
            )
            first_status = self.workspace_status(wrapper, workspace, env=env)
            self.assertEqual(first_status["health"], "ok")
            self.assertEqual(first_status["configuration_compatibility"], "current")
            self.assertEqual(
                first_status["configuration_identity"]["reasoning_projection"]["id"],
                "lsa-efficiency-v1",
            )
            self.assertEqual(
                first_status["resolved_configurations"]["reviewer"]["role_binding"]["model"],
                "gpt-6-astra",
            )
            manifest = workspace / ".codex" / PROJECT_PROFILE_MANIFEST
            first_manifest = manifest.read_bytes()
            self.run_profile(
                wrapper,
                "set",
                workspace,
                env=env,
                model_set="openai-luna-sol-astra",
            )
            self.assertEqual(manifest.read_bytes(), first_manifest)

            self.run_profile(
                wrapper,
                "set",
                workspace,
                env=env,
                model_set="openai-legacy",
            )
            legacy_status = self.workspace_status(wrapper, workspace, env=env)
            self.assertEqual(
                legacy_status["configuration_identity"]["reasoning_projection"]["id"],
                "legacy-v2",
            )
            self.assertEqual(
                legacy_status["resolved_configurations"]["reviewer"]["role_binding"]["model"],
                "gpt-5.6-sol",
            )
            self.run_profile(wrapper, "clear", workspace, env=env)
            self.run_profile(wrapper, "clear", workspace, env=env)
            self.assertFalse(manifest.exists())

    def test_v2_openai_manifest_uses_verified_pinned_legacy_mapping(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            self.set_project_trust(codex_home, workspace, "trusted")
            self.run_profile(
                wrapper,
                "set",
                workspace,
                env=env,
                model_set="openai-legacy",
            )

            manifest_path = workspace / ".codex" / PROJECT_PROFILE_MANIFEST
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest.update({"version": 2, "model_set": "openai"})
            for key in (
                "configuration_identity",
                "model_mapping",
                "resolved_configurations",
            ):
                manifest.pop(key)
            manifest_path.write_text(
                json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            config_path = workspace / ".codex" / "config.toml"
            config_path.write_text(
                config_path.read_text(encoding="utf-8").replace(
                    '# model_set = "openai-legacy"', '# model_set = "openai"'
                ),
                encoding="utf-8",
            )

            status = self.workspace_status(wrapper, workspace, env=env)
            self.assertEqual(status["health"], "ok")
            self.assertEqual(status["catalog_state"], "pinned")
            self.assertEqual(status["configuration_compatibility"], "pinned_legacy")
            self.assertEqual(status["model_set"], "openai")
            self.assertEqual(
                status["configuration_identity"]["model_set"]["id"], "openai-legacy"
            )
            reviewer = status["resolved_configurations"]["reviewer"]
            self.assertEqual(reviewer["role_binding"]["model"], "gpt-5.6-sol")
            self.assertEqual(reviewer["provenance"], {"source": "pinned_legacy", "override": None})

            recovery = self.resolve_recovery(wrapper, workspace, env=env, expected=2)
            self.assertIn("requires the current workspace profile catalog", recovery.stderr)

    def test_v3_manifest_missing_resolved_configuration_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            _, wrapper = self.install_global_codex(home, env)
            self.run_profile(wrapper, "set", workspace, env=env)

            manifest_path = workspace / ".codex" / PROJECT_PROFILE_MANIFEST
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest.pop("resolved_configurations")
            manifest_path.write_text(
                json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            status = self.run_command(
                [
                    "bash",
                    wrapper.as_posix(),
                    "status",
                    "--runtime",
                    "codex",
                    "--scope",
                    "workspace",
                    "--workspace",
                    workspace.as_posix(),
                    "--json",
                ],
                env=env,
                expected=2,
            )
            self.assertIn("resolved configuration", status.stderr)

    def test_v3_manifest_rejects_binding_that_disagrees_with_selected_profile(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            self.set_project_trust(codex_home, workspace, "trusted")
            self.run_profile(
                wrapper,
                "set",
                workspace,
                env=env,
                model_set="openai-luna-sol-astra",
            )

            manifest_path = workspace / ".codex" / PROJECT_PROFILE_MANIFEST
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            executor = manifest["resolved_configurations"]["executor"]["role_binding"]
            self.assertEqual(
                executor,
                {
                    "role": "executor",
                    "model_tier": "standard",
                    "model": "gpt-5.6-sol",
                    "mapping_digest": manifest["model_mapping"]["mapping_digest"],
                },
            )
            executor.update({"model_tier": "strong", "model": "gpt-6-astra"})
            manifest_path.write_text(
                json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            executor_role = tomllib.loads(
                (workspace / ".codex" / "agents" / "executor.toml").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(executor_role["model"], "gpt-5.6-sol")

            status = self.run_command(
                [
                    "bash",
                    wrapper.as_posix(),
                    "status",
                    "--runtime",
                    "codex",
                    "--scope",
                    "workspace",
                    "--workspace",
                    workspace.as_posix(),
                    "--json",
                ],
                env=env,
                expected=2,
            )
            self.assertIn("does not match generated role", status.stderr)

    def test_v3_manifest_rejects_unknown_projection_before_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            self.set_project_trust(codex_home, workspace, "trusted")
            self.run_profile(
                wrapper,
                "set",
                workspace,
                env=env,
                model_set="openai-luna-sol-astra",
            )

            manifest_path = workspace / ".codex" / PROJECT_PROFILE_MANIFEST
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            projection = {
                "id": "unknown-projection",
                "version": "1",
                "policy_version": "3",
                "digest": "sha256:" + "0" * 64,
            }
            manifest["asset_digest"] = "0" * 64
            manifest["configuration_identity"]["reasoning_projection"] = projection
            for configuration in manifest["resolved_configurations"].values():
                configuration["reasoning_projection"] = projection
            manifest_path.write_text(
                json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )

            status = self.run_command(
                [
                    "bash",
                    wrapper.as_posix(),
                    "status",
                    "--runtime",
                    "codex",
                    "--scope",
                    "workspace",
                    "--workspace",
                    workspace.as_posix(),
                    "--json",
                ],
                env=env,
                expected=2,
            )
            self.assertIn("central registry", status.stderr)

    def test_workspace_profile_reinstall_removes_legacy_managed_limits(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            _, wrapper = self.install_global_codex(home, env)

            self.run_profile(wrapper, "set", workspace, env=env)
            config_path = workspace / ".codex" / "config.toml"
            config_text = config_path.read_text(encoding="utf-8")
            self.assertIn("[agents.", config_text)
            config_path.write_text(
                config_text.replace(
                    "[agents.",
                    "[agents]\nmax_threads = 6\nmax_depth = 2\n\n[agents.",
                    1,
                ),
                encoding="utf-8",
            )

            self.run_profile(wrapper, "set", workspace, env=env)
            parsed = tomllib.loads(config_path.read_text(encoding="utf-8"))
            self.assertNotIn("max_threads", parsed["agents"])
            self.assertNotIn("max_depth", parsed["agents"])
            self.assertNotIn(
                "max_concurrent_threads_per_session", parsed["agents"]
            )

    def test_workspace_preflight_rejects_model_pinned_global_roles(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            global_role = codex_home / "agents" / "peon.toml"
            global_role.write_text(
                global_role.read_text(encoding="utf-8")
                + '\nmodel = "gpt-5.6-luna"\nmodel_provider = "openai"\n',
                encoding="utf-8",
            )

            status = self.run_command(
                [
                    "bash",
                    wrapper.as_posix(),
                    "status",
                    "--runtime",
                    "codex",
                    "--scope",
                    "workspace",
                    "--workspace",
                    workspace.as_posix(),
                    "--json",
                ],
                env=env,
                expected=2,
            )
            self.assertIn("must be model-free", status.stderr)

            profile_set = self.run_profile(
                wrapper, "set", workspace, env=env, expected=2
            )
            self.assertIn("must be model-free", profile_set.stderr)
            self.assertFalse((workspace / ".codex" / "agents").exists())

    def test_install_remains_a_compatibility_alias_for_set(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            set_workspace = root / "set-project"
            install_workspace = root / "install-project"

            self.run_profile(wrapper, "set", set_workspace, env=env)
            self.run_profile(wrapper, "install", install_workspace, env=env)

            set_status = self.workspace_status(wrapper, set_workspace, env=env)
            install_status = self.workspace_status(wrapper, install_workspace, env=env)
            self.assertEqual(
                (set_status["health"], set_status["profile"], set_status["model_set"]),
                (install_status["health"], install_status["profile"], install_status["model_set"]),
            )
            self.assertEqual(
                set(self.assert_workspace_local_profile(set_workspace, codex_home, set_status)),
                set(self.assert_workspace_local_profile(
                    install_workspace, codex_home, install_status
                )),
            )

    def test_status_rejects_orphaned_managed_block_without_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            _codex_home, wrapper = self.install_global_codex(home, env)

            self.run_profile(wrapper, "set", workspace, env=env)
            status = self.workspace_status(wrapper, workspace, env=env)
            local_roles = self.read_overlay_agent_files(workspace)
            Path(str(status["manifest"])).unlink()
            tampered_role = next(iter(local_roles.values()))
            tampered_role.write_text(
                tampered_role.read_text(encoding="utf-8") + "# orphaned tamper\n",
                encoding="utf-8",
            )

            completed = self.run_command(
                [
                    "bash",
                    wrapper.as_posix(),
                    "status",
                    "--runtime",
                    "codex",
                    "--scope",
                    "workspace",
                    "--workspace",
                    workspace.as_posix(),
                    "--json",
                ],
                env=env,
                expected=2,
            )
            self.assertIn(
                "managed profile block without its manifest",
                completed.stderr,
            )

    def test_global_status_reports_missing_support_as_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            missing_helper = (
                codex_home
                / "agents-pipeline"
                / "scripts"
                / "codex-project-profile.py"
            )
            missing_helper.unlink()

            status = json.loads(
                self.run_command(
                    [
                        "bash",
                        wrapper.as_posix(),
                        "status",
                        "--runtime",
                        "codex",
                        "--scope",
                        "global",
                        "--target",
                        codex_home.as_posix(),
                        "--json",
                    ],
                    env=env,
                ).stdout
            )
            self.assertTrue(status["installed"])
            self.assertEqual(status["health"], "incomplete")
            self.assertTrue(
                any(
                    str(item).endswith("scripts/codex-project-profile.py")
                    for item in status["missing_generated_files"]
                )
            )

    def test_codex_status_and_workspace_preflight_ignore_tier2_adapters(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            support_root = codex_home / "agents-pipeline"
            for relative in (
                "scripts/export-claude-agents.py",
                "scripts/install-claude.sh",
                "scripts/install-claude.ps1",
                "scripts/export-copilot-agents.py",
                "scripts/install-copilot.sh",
                "scripts/install-copilot.ps1",
            ):
                (support_root / relative).unlink()

            global_status = json.loads(
                self.run_command(
                    [
                        "bash",
                        wrapper.as_posix(),
                        "status",
                        "--runtime",
                        "codex",
                        "--scope",
                        "global",
                        "--target",
                        codex_home.as_posix(),
                        "--json",
                    ],
                    env=env,
                ).stdout
            )
            self.assertEqual(global_status["health"], "ok")
            self.assertEqual(global_status["missing_generated_files"], [])

            self.run_profile(wrapper, "set", workspace, env=env)
            workspace_status = self.workspace_status(wrapper, workspace, env=env)
            self.assertEqual(workspace_status["health"], "ok")
            local_roles = self.assert_workspace_local_profile(
                workspace, codex_home, workspace_status
            )
            peon = tomllib.loads(local_roles["peon"].read_text(encoding="utf-8"))
            self.assertEqual(peon["model"], "gpt-5.6-luna")

    def test_codex_status_and_workspace_preflight_require_capability_protocols(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            common_file = "protocols/UI_UX_WORKFLOW.md"
            (codex_home / "agents-pipeline" / common_file).unlink()

            global_status = json.loads(
                self.run_command(
                    [
                        "bash",
                        wrapper.as_posix(),
                        "status",
                        "--runtime",
                        "codex",
                        "--scope",
                        "global",
                        "--target",
                        codex_home.as_posix(),
                        "--json",
                    ],
                    env=env,
                ).stdout
            )
            self.assertEqual(global_status["health"], "incomplete")
            self.assertTrue(
                any(
                    str(item).endswith(common_file)
                    for item in global_status["missing_generated_files"]
                )
            )

            completed = self.run_profile(
                wrapper,
                "set",
                workspace,
                env=env,
                expected=2,
            )
            self.assertIn("Global neutral support tree is incomplete", completed.stderr)
            self.assertIn(common_file, completed.stderr)

    def test_global_status_checks_active_agents_note_and_codex_registration(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            override = codex_home / "AGENTS.override.md"
            override.write_text("# User override without managed aliases\n", encoding="utf-8")

            command = [
                "bash",
                wrapper.as_posix(),
                "status",
                "--runtime",
                "codex",
                "--scope",
                "global",
                "--target",
                codex_home.as_posix(),
                "--json",
            ]
            status = json.loads(self.run_command(command, env=env).stdout)
            self.assertEqual(status["health"], "incomplete")
            self.assertTrue(
                any(
                    str(item).endswith("AGENTS.override.md:managed-block")
                    for item in status["missing_generated_files"]
                )
            )

            override.unlink()
            config_path = codex_home / "config.toml"
            config_path.write_text(
                config_path.read_text(encoding="utf-8").replace(
                    "multi_agent_v2 = true\n",
                    "\n[features.multi_agent_v2]\nenabled = true\nmax_concurrent_threads_per_session = 3\n",
                ),
                encoding="utf-8",
            )
            status = json.loads(self.run_command(command, env=env).stdout)
            self.assertEqual(status["health"], "ok")
            PROJECT_PROFILE._validate_global_codex_registration(
                codex_home,
                sorted(
                    path.stem for path in (codex_home / "agents").glob("*.toml")
                ),
            )

            config_path.write_text(
                config_path.read_text(encoding="utf-8").replace(
                    "enabled = true\n", "enabled = false\n"
                ),
                encoding="utf-8",
            )
            status = json.loads(self.run_command(command, env=env).stdout)
            self.assertEqual(status["health"], "incomplete")
            self.assertTrue(
                any(
                    str(item) == "config:features.multi_agent_v2"
                    for item in status["missing_generated_files"]
                )
            )

            (codex_home / "config.toml").unlink()
            status = json.loads(self.run_command(command, env=env).stdout)
            self.assertEqual(status["health"], "incomplete")
            self.assertTrue(
                any(
                    str(item) == f"config:{codex_home / 'config.toml'}"
                    for item in status["missing_generated_files"]
                )
            )

    def test_workspace_status_keeps_unchanged_profile_inputs_current_across_versions(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            self.run_profile(wrapper, "set", workspace, env=env)

            major, minor, patch = (int(value) for value in RELEASE_VERSION.split("."))
            (codex_home / "agents-pipeline" / "VERSION").write_text(
                f"{major}.{minor}.{patch + 1}\n", encoding="utf-8"
            )
            status = self.workspace_status(wrapper, workspace, env=env)
            self.assertEqual(status["health"], "ok")
            self.assertEqual(status["catalog_state"], "current")
            self.assertEqual(status["source_version"], RELEASE_VERSION)

    def test_status_rejects_linked_workspace_and_global_agent_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            self.run_profile(wrapper, "set", workspace, env=env)

            local_agents = workspace / ".codex" / "agents"
            outside_local_agents = root / "outside-local-agents"
            local_agents.replace(outside_local_agents)
            try:
                local_agents.symlink_to(outside_local_agents, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")
            completed = self.run_command(
                [
                    "bash",
                    wrapper.as_posix(),
                    "status",
                    "--runtime",
                    "codex",
                    "--scope",
                    "workspace",
                    "--workspace",
                    workspace.as_posix(),
                    "--json",
                ],
                env=env,
                expected=2,
            )
            self.assertTrue(
                "symbolic link or junction" in completed.stderr
                or "escapes its workspace" in completed.stderr
            )

            local_agents.unlink()
            outside_local_agents.replace(local_agents)
            global_agents = codex_home / "agents"
            outside_global_agents = root / "outside-global-agents"
            global_agents.replace(outside_global_agents)
            global_agents.symlink_to(outside_global_agents, target_is_directory=True)
            global_status = json.loads(
                self.run_command(
                    [
                        "bash",
                        wrapper.as_posix(),
                        "status",
                        "--runtime",
                        "codex",
                        "--scope",
                        "global",
                        "--target",
                        codex_home.as_posix(),
                        "--json",
                    ],
                    env=env,
                ).stdout
            )
            self.assertEqual(global_status["health"], "incomplete")
            self.assertTrue(
                any(
                    str(item) == f"config:{global_agents}"
                    for item in global_status["missing_generated_files"]
                )
            )

    def test_global_wrapper_can_set_current_workspace_from_any_working_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "unrelated" / "new-project"
            workspace.mkdir(parents=True)
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)

            self.run_command(
                [
                    "bash",
                    wrapper.as_posix(),
                    "set",
                    "balanced",
                    "--runtime",
                    "codex",
                    "--scope",
                    "workspace",
                    "--model-set",
                    "openai",
                ],
                env=env,
                cwd=workspace,
            )
            status = json.loads(
                self.run_command(
                    [
                        "bash",
                        wrapper.as_posix(),
                        "status",
                        "--runtime",
                        "codex",
                        "--scope",
                        "workspace",
                        "--json",
                    ],
                    env=env,
                    cwd=workspace,
                ).stdout
            )

            self.assertEqual(Path(str(status["workspace"])), workspace.resolve())
            self.assertEqual(status["health"], "ok")
            self.assert_workspace_local_profile(workspace, codex_home, status)

    def test_workspace_overlay_supports_non_bmp_global_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home-😀"
            workspace = root / "project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)

            self.run_profile(wrapper, "set", workspace, env=env)
            status = self.workspace_status(wrapper, workspace, env=env)
            self.assertEqual(status["health"], "ok")
            agent_files = self.assert_workspace_local_profile(
                workspace, codex_home, status
            )
            self.assertTrue(
                any(
                    "😀" in path.read_text(encoding="utf-8")
                    for path in agent_files.values()
                )
            )

    def test_workspace_profiles_are_project_local_and_can_use_different_resource_tiers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            global_analysis = codex_home / "agents" / "analysis-correctness.toml"
            original_global_analysis = global_analysis.read_bytes()
            frugal = root / "frugal-project"
            premium = root / "premium-project"

            self.run_profile(wrapper, "set", frugal, env=env, profile="frugal")
            self.run_profile(wrapper, "set", premium, env=env, profile="premium")

            frugal_analysis = frugal / ".codex" / "agents" / "analysis-correctness.toml"
            premium_analysis = premium / ".codex" / "agents" / "analysis-correctness.toml"
            self.assertNotEqual(
                frugal_analysis.read_text(encoding="utf-8"),
                premium_analysis.read_text(encoding="utf-8"),
            )
            self.assertEqual(global_analysis.read_bytes(), original_global_analysis)
            self.assertEqual(
                self.workspace_status(wrapper, frugal, env=env)["profile"], "frugal"
            )
            self.assertEqual(
                self.workspace_status(wrapper, premium, env=env)["profile"], "premium"
            )
            frugal_paths = self.read_overlay_agent_files(frugal)
            premium_paths = self.read_overlay_agent_files(premium)
            self.assertTrue(all(path.is_relative_to(frugal) for path in frugal_paths.values()))
            self.assertTrue(all(path.is_relative_to(premium) for path in premium_paths.values()))

    def test_resolve_recovery_returns_bounded_model_without_mutating_workspace_roles(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            balanced = root / "balanced-project"
            frugal = root / "frugal-project"
            premium = root / "premium-project"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            self.set_project_trust(codex_home, balanced, "trusted")
            self.set_project_trust(codex_home, frugal, "trusted")
            self.set_project_trust(codex_home, premium, "trusted")
            self.run_profile(wrapper, "set", balanced, env=env)
            self.run_profile(wrapper, "set", frugal, env=env, profile="frugal")
            self.run_profile(wrapper, "set", premium, env=env, profile="premium")

            balanced_config = (balanced / ".codex" / "config.toml").read_bytes()
            balanced_executor = (balanced / ".codex" / "agents" / "executor.toml")
            balanced_executor_contents = balanced_executor.read_bytes()
            resolution = json.loads(
                self.resolve_recovery(wrapper, balanced, env=env).stdout
            )
            resolved_configuration = resolution.pop("resolved_configuration")
            self.assertEqual(
                resolution,
                {
                    "available": True,
                    "runtime": "codex",
                    "workspace": balanced.resolve().as_posix(),
                    "profile": "balanced",
                    "model_set": "openai",
                    "agent": "executor",
                    "base_model_tier": "standard",
                    "requested_model_tier": "strong",
                    "recovery_ceiling_model_tier": "strong",
                    "model": "gpt-5.6-sol",
                    "model_provider": "openai",
                },
            )
            self.assertEqual(
                resolved_configuration["role_binding"],
                {
                    "role": "executor",
                    "model_tier": "strong",
                    "model": "gpt-5.6-sol",
                    "mapping_digest": "sha256:0e440f876a190b7289466d766e0272d7b599b65547027b205dba72e1f16ec26f",
                },
            )
            self.assertEqual(
                resolved_configuration["provenance"],
                {
                    "source": "workspace_profile",
                    "override": {
                        "kind": "capability_recovery",
                        "version": "1",
                        "source_model_tier": "standard",
                        "target_model_tier": "strong",
                    },
                },
            )
            self.assertEqual((balanced / ".codex" / "config.toml").read_bytes(), balanced_config)
            self.assertEqual(balanced_executor.read_bytes(), balanced_executor_contents)

            premium_resolution = json.loads(
                self.resolve_recovery(wrapper, premium, env=env).stdout
            )
            self.assertEqual(premium_resolution["profile"], "premium")
            self.assertEqual(premium_resolution["base_model_tier"], "standard")
            self.assertEqual(premium_resolution["requested_model_tier"], "strong")
            self.assertEqual(premium_resolution["model"], "gpt-5.6-sol")

            rejected = self.resolve_recovery(wrapper, frugal, env=env, expected=2)
            self.assertIn("exceeds ceiling tier 'standard'", rejected.stderr)

            major, minor, patch = (int(value) for value in RELEASE_VERSION.split("."))
            (codex_home / "agents-pipeline" / "VERSION").write_text(
                f"{major}.{minor}.{patch + 1}\n", encoding="utf-8"
            )
            version_only = json.loads(
                self.resolve_recovery(wrapper, balanced, env=env).stdout
            )
            self.assertTrue(version_only["available"])

            executor_source = codex_home / "agents-pipeline" / "agents" / "executor.md"
            executor_source.write_text(
                executor_source.read_text(encoding="utf-8") + "\nProfile input changed.\n",
                encoding="utf-8",
            )
            pinned = self.resolve_recovery(wrapper, balanced, env=env, expected=2)
            self.assertIn("requires the current workspace profile catalog", pinned.stderr)

    def test_status_separates_file_health_from_trust_eligibility_and_plain_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            env = self.isolated_environment(home)
            codex_home, wrapper = self.install_global_codex(home, env)
            trusted = root / "trusted"
            untrusted = root / "untrusted"
            unknown = root / "unknown"
            self.set_project_trust(codex_home, trusted, "trusted")
            self.set_project_trust(codex_home, untrusted, "untrusted")

            trusted_set = self.run_profile(wrapper, "set", trusted, env=env)
            untrusted_set = self.run_profile(wrapper, "set", untrusted, env=env)
            unknown_set = self.run_profile(wrapper, "set", unknown, env=env)
            self.assertNotIn("Codex will ignore", trusted_set.stderr)
            self.assertIn("project trust is untrusted", untrusted_set.stderr)
            self.assertIn("project trust is unknown", unknown_set.stderr)

            expected = {
                trusted: ("trusted", "eligible"),
                untrusted: ("untrusted", "ineligible"),
                unknown: ("unknown", "ineligible"),
            }
            for workspace, (trust, eligibility) in expected.items():
                with self.subTest(workspace=workspace.name):
                    status = self.workspace_status(wrapper, workspace, env=env)
                    self.assertEqual(status["health"], "ok")
                    self.assertEqual(status["project_trust"], trust)
                    self.assertEqual(status["profile_eligibility"], eligibility)

            plain = self.run_command(
                [
                    "bash",
                    wrapper.as_posix(),
                    "status",
                    "--runtime",
                    "codex",
                    "--scope",
                    "workspace",
                    "--workspace",
                    unknown.as_posix(),
                ],
                env=env,
            )
            self.assertIn("Project profile: balanced", plain.stdout)
            self.assertIn("File health: ok", plain.stdout)
            self.assertIn(
                "Trust eligibility: ineligible (project trust: unknown)", plain.stdout
            )
            self.assertNotIn("Set project profile overlay", plain.stdout)
            self.assertIn("Mark this project as trusted in Codex", plain.stderr)

            inherited = root / "inherited"
            inherited_status = self.workspace_status(wrapper, inherited, env=env)
            self.assertEqual(inherited_status["profile_eligibility"], "not_configured")
            self.assertEqual(inherited_status["project_trust"], "unknown")

    def test_set_refuses_unowned_collision_but_clear_preserves_unrelated_local_roles(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            env = self.isolated_environment(home)
            _codex_home, wrapper = self.install_global_codex(home, env)

            collision_workspace = root / "collision"
            collision_role = collision_workspace / ".codex" / "agents" / "executor.toml"
            collision_role.parent.mkdir(parents=True)
            collision_content = 'name = "user-executor"\n'
            collision_role.write_text(collision_content, encoding="utf-8")
            completed = self.run_profile(
                wrapper,
                "set",
                collision_workspace,
                env=env,
                expected=2,
            )
            self.assertIn("unowned project-local Codex role", completed.stderr)
            self.assertEqual(collision_role.read_text(encoding="utf-8"), collision_content)
            self.assertFalse(
                (collision_workspace / ".codex" / PROJECT_PROFILE_MANIFEST).exists()
            )

            unrelated_workspace = root / "unrelated"
            unrelated_role = (
                unrelated_workspace / ".codex" / "agents" / "company-local.toml"
            )
            unrelated_role.parent.mkdir(parents=True)
            unrelated_content = 'name = "company-local"\n'
            unrelated_role.write_text(unrelated_content, encoding="utf-8")
            self.run_profile(wrapper, "set", unrelated_workspace, env=env)
            self.assertEqual(unrelated_role.read_text(encoding="utf-8"), unrelated_content)
            self.run_profile(wrapper, "clear", unrelated_workspace, env=env)
            self.assertEqual(unrelated_role.read_text(encoding="utf-8"), unrelated_content)
            self.assertEqual(
                {path.name for path in unrelated_role.parent.iterdir()},
                {"company-local.toml"},
            )

    def test_set_rolls_back_local_roles_config_and_manifest_on_commit_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            project_dir = workspace / ".codex"
            project_dir.mkdir(parents=True)
            config = project_dir / "config.toml"
            original_config = 'sandbox_mode = "read-only"\n'
            config.write_text(original_config, encoding="utf-8")
            env = self.isolated_environment(home)
            codex_home, _wrapper = self.install_global_codex(home, env)

            with mock.patch.object(
                PROJECT_PROFILE,
                "_atomic_json",
                side_effect=PermissionError("simulated manifest write failure"),
            ):
                with self.assertRaisesRegex(
                    PermissionError, "simulated manifest write failure"
                ):
                    PROJECT_PROFILE.set_profile(
                        workspace=workspace.resolve(),
                        global_target=codex_home.resolve(),
                        asset_root=(codex_home / "agents-pipeline").resolve(),
                        profile="balanced",
                        model_set="openai",
                        uniform_model=None,
                        dry_run=False,
                    )

            self.assertEqual(config.read_text(encoding="utf-8"), original_config)
            self.assertFalse((project_dir / "agents").exists())
            self.assertFalse((project_dir / PROJECT_PROFILE_MANIFEST).exists())

    def test_claude_and_copilot_workspace_profiles_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            env = self.isolated_environment(home)
            for runtime, local_path in (
                ("claude", Path(".claude")),
                ("copilot", Path(".github")),
            ):
                for action in ("set", "install"):
                    workspace = root / f"{runtime}-{action}"
                    completed = self.run_command(
                        [
                            sys.executable,
                            PROFILE_TOOL.as_posix(),
                            action,
                            "balanced",
                            "--runtime",
                            runtime,
                            "--scope",
                            "workspace",
                            "--workspace",
                            workspace.as_posix(),
                            "--model-set",
                            "default",
                            "--asset-root",
                            REPO_ROOT.as_posix(),
                        ],
                        env=env,
                        expected=2,
                    )
                    with self.subTest(runtime=runtime, action=action):
                        self.assertIn(
                            "workspace profile-only setup is not supported",
                            completed.stderr.lower(),
                        )
                        self.assertIn("use global scope", completed.stderr.lower())
                        self.assertIn("direct installer", completed.stderr.lower())
                        self.assertFalse((workspace / local_path).exists())
                        self.assertFalse((workspace / "CLAUDE.md").exists())

    def test_workspace_status_and_clear_reject_a_linked_codex_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            home = root / "home"
            workspace = root / "project"
            outside = root / "outside"
            workspace.mkdir()
            outside.mkdir()
            sentinel = outside / "config.toml"
            sentinel.write_text('sandbox_mode = "read-only"\n', encoding="utf-8")
            try:
                (workspace / ".codex").symlink_to(outside, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("symbolic links are unavailable")
            env = self.isolated_environment(home)
            _codex_home, wrapper = self.install_global_codex(home, env)

            for action in ("status", "clear"):
                completed = self.run_command(
                    [
                        "bash",
                        wrapper.as_posix(),
                        action,
                        "--runtime",
                        "codex",
                        "--scope",
                        "workspace",
                        "--workspace",
                        workspace.as_posix(),
                    ],
                    env=env,
                    expected=2,
                )
                with self.subTest(action=action):
                    self.assertIn("symbolic link or junction", completed.stderr)
                    self.assertEqual(
                        sentinel.read_text(encoding="utf-8"),
                        'sandbox_mode = "read-only"\n',
                    )

    def test_clear_rolls_back_config_when_manifest_removal_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            workspace = Path(temp_name) / "project"
            project_dir = workspace / ".codex"
            project_dir.mkdir(parents=True)
            block = PROJECT_PROFILE._build_block(
                agents_dir=project_dir / "agents",
                agent_names=["executor"],
                profile="balanced",
                model_set="openai",
                uniform_model=None,
            )
            original_config = 'sandbox_mode = "read-only"\n\n' + block
            config_path = project_dir / "config.toml"
            manifest_path = project_dir / PROJECT_PROFILE_MANIFEST
            config_path.write_text(original_config, encoding="utf-8")
            role_dir = project_dir / "agents"
            role_dir.mkdir()
            role_path = role_dir / "executor.toml"
            role_content = 'name = "executor"\n'
            role_path.write_text(role_content, encoding="utf-8")
            manifest_path.write_text(
                json.dumps(
                    {
                        "agent_names": ["executor"],
                        "agent_sha256": {
                            "executor": PROJECT_PROFILE._sha256_file(role_path)
                        },
                        "asset_digest": "0" * 64,
                        "config_file": str(config_path),
                        "global_target": str(Path(temp_name) / "global"),
                        "managed_agent_files": ["agents/executor.toml"],
                        "mode": "profile",
                        "model_set": "openai",
                        "profile": "balanced",
                        "roles_dir": str(role_dir),
                        "runtime": "codex",
                        "source_version": "0.28.0",
                        "tool": PROJECT_PROFILE.PROJECT_MANIFEST_TOOL,
                        "version": 2,
                        "uniform_model": None,
                        "workspace": str(workspace.resolve()),
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            original_unlink = Path.unlink

            def fail_manifest_unlink(path: Path, *args, **kwargs):
                if path == manifest_path:
                    raise PermissionError("simulated manifest unlink failure")
                return original_unlink(path, *args, **kwargs)

            with mock.patch.object(Path, "unlink", new=fail_manifest_unlink):
                with self.assertRaisesRegex(
                    PermissionError, "simulated manifest unlink failure"
                ):
                    PROJECT_PROFILE.clear_profile(
                        workspace=workspace.resolve(), dry_run=False
                    )

            self.assertEqual(config_path.read_text(encoding="utf-8"), original_config)
            self.assertTrue(manifest_path.is_file())
            self.assertEqual(role_path.read_text(encoding="utf-8"), role_content)


if __name__ == "__main__":
    unittest.main()
