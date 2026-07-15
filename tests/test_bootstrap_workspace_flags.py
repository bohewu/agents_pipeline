from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]


class BootstrapWorkspaceFlagTests(unittest.TestCase):
    def _write_fake_release(
        self,
        temp_root: Path,
        *,
        release_tag: str = "v0.28.0",
        include_child_trace: bool = False,
    ) -> tuple[dict[str, str], Path]:
        bundle_root = temp_root / "bundle"
        required_dirs = (
            "agents",
            "protocols",
            "skills",
            "tools/status-runtime",
            "tools/agent-profiles",
            "runtimes/codex/model-sets",
            "runtimes/claude/model-sets",
            "scripts",
        )
        for relative in required_dirs:
            (bundle_root / relative).mkdir(parents=True, exist_ok=True)

        required_files = [
            "AGENTS.md",
            "modes.json",
            "protocols/reasoning-policy.json",
            "tools/agent-profile.py",
            "tools/reasoning-policy.js",
            "tools/reasoning-vocabulary.js",
            "tools/status-event.js",
            "scripts/agent_model_profiles.py",
            "scripts/codex-project-profile.py",
            "scripts/codex_skill_catalog.py",
            "scripts/codex_mode_aliases.py",
            "scripts/export-codex-agents.py",
            "scripts/export-claude-agents.py",
            "scripts/install-codex-config.py",
            "scripts/path_safety.py",
            "scripts/sync-codex-skills.py",
            "scripts/sync-runtime-support.py",
        ]
        if include_child_trace:
            required_files.append("tools/codex-child-trace.js")
        for relative in required_files:
            (bundle_root / relative).write_text("fixture\n", encoding="utf-8")

        installer = textwrap.dedent(
            """\
            #!/usr/bin/env bash
            set -eu
            : > "${ARG_LOG}"
            for argument in "$@"; do
              printf '%s\\n' "${argument}" >> "${ARG_LOG}"
            done
            """
        )
        for runtime in ("codex", "claude"):
            path = bundle_root / "scripts" / f"install-{runtime}.sh"
            path.write_text(installer, encoding="utf-8")
            path.chmod(0o755)

        bundle_name = f"agents-pipeline-bundle-{release_tag}"
        archive_name = f"{bundle_name}.tar.gz"
        archive_path = temp_root / archive_name
        with tarfile.open(archive_path, "w:gz") as archive:
            archive.add(bundle_root, arcname=bundle_name)

        checksum_name = f"{bundle_name}.SHA256SUMS.txt"
        checksum_path = temp_root / checksum_name
        checksum = hashlib.sha256(archive_path.read_bytes()).hexdigest()
        checksum_path.write_text(f"{checksum}  {archive_name}\n", encoding="utf-8")

        release_path = temp_root / "release.json"
        release_path.write_text(
            json.dumps(
                {
                    "tag_name": release_tag,
                    "assets": [
                        {
                            "name": archive_name,
                            "browser_download_url": f"https://example.invalid/{archive_name}",
                        },
                        {
                            "name": checksum_name,
                            "browser_download_url": f"https://example.invalid/{checksum_name}",
                        },
                    ],
                }
            ),
            encoding="utf-8",
        )

        fake_bin = temp_root / "bin"
        fake_bin.mkdir()
        fake_curl = fake_bin / "curl"
        fake_curl.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -eu
                output=""
                url=""
                while [ "$#" -gt 0 ]; do
                  case "$1" in
                    -o) output="$2"; shift 2 ;;
                    -H) shift 2 ;;
                    -*) shift ;;
                    *) url="$1"; shift ;;
                  esac
                done
                if [ -z "${output}" ]; then
                  cat "${FAKE_RELEASE_JSON}"
                elif [ "${url##*/}" = "${FAKE_ARCHIVE##*/}" ]; then
                  cp "${FAKE_ARCHIVE}" "${output}"
                else
                  cp "${FAKE_CHECKSUMS}" "${output}"
                fi
                """
            ),
            encoding="utf-8",
        )
        fake_curl.chmod(0o755)

        fake_gh = fake_bin / "gh"
        fake_gh.write_text("#!/usr/bin/env sh\nexit 1\n", encoding="utf-8")
        fake_gh.chmod(0o755)

        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{fake_bin}{os.pathsep}{env['PATH']}",
                "FAKE_RELEASE_JSON": str(release_path),
                "FAKE_ARCHIVE": str(archive_path),
                "FAKE_CHECKSUMS": str(checksum_path),
            }
        )
        return env, temp_root / "forwarded-arguments.txt"

    def test_codex_bash_bootstrap_requires_child_trace_after_v0320(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            temp_root = Path(raw_temp)
            env, _ = self._write_fake_release(
                temp_root,
                release_tag="v0.32.1",
            )

            result = subprocess.run(
                [
                    "bash",
                    str(ROOT / "scripts/bootstrap-install-codex.sh"),
                    "--repo",
                    "example/project",
                    "--version",
                    "v0.32.1",
                    "--target",
                    str(temp_root / "codex-home"),
                ],
                cwd=ROOT,
                env=env,
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("missing: tools/codex-child-trace.js", result.stderr)

    def test_codex_bash_bootstrap_forwards_workspace_targets(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            temp_root = Path(raw_temp)
            env, argument_log = self._write_fake_release(temp_root)
            env["ARG_LOG"] = str(argument_log)
            target = temp_root / "workspace with spaces" / ".codex"
            workspace = temp_root / "workspace with spaces"
            global_agents = temp_root / "global config" / "AGENTS.md"

            subprocess.run(
                [
                    "bash",
                    str(ROOT / "scripts/bootstrap-install-codex.sh"),
                    "--repo",
                    "example/project",
                    "--version",
                    "v0.28.0",
                    "--target",
                    str(target),
                    "--workspace-root",
                    str(workspace),
                    "--global-agents-target",
                    str(global_agents),
                    "--agent-profile",
                    "balanced",
                    "--model-set",
                    "openai",
                ],
                cwd=ROOT,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )

            self.assertEqual(
                argument_log.read_text(encoding="utf-8").splitlines(),
                [
                    "--target",
                    str(target),
                    "--workspace-root",
                    str(workspace),
                    "--global-agents-target",
                    str(global_agents),
                    "--agent-profile",
                    "balanced",
                    "--model-set",
                    "openai",
                ],
            )

    def test_codex_bash_bootstrap_rejects_global_model_profile_before_network(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            target = Path(raw_temp) / "global-codex"
            result = subprocess.run(
                [
                    "bash",
                    str(ROOT / "scripts/bootstrap-install-codex.sh"),
                    "--target",
                    str(target),
                    "--agent-profile",
                    "balanced",
                    "--model-set",
                    "openai",
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 2, result.stdout)
            self.assertIn("workspace-only", result.stderr)
            self.assertFalse(target.exists())

    def test_codex_bash_bootstrap_forwards_custom_user_skills_root(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            temp_root = Path(raw_temp)
            env, argument_log = self._write_fake_release(temp_root)
            env["ARG_LOG"] = str(argument_log)
            target = temp_root / "custom codex home"
            user_skills = temp_root / "user skills"

            subprocess.run(
                [
                    "bash",
                    str(ROOT / "scripts/bootstrap-install-codex.sh"),
                    "--repo",
                    "example/project",
                    "--version",
                    "v0.28.0",
                    "--target",
                    str(target),
                    "--user-skills-root",
                    str(user_skills),
                    "--migrate-legacy-skills",
                ],
                cwd=ROOT,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )

            self.assertEqual(
                argument_log.read_text(encoding="utf-8").splitlines(),
                [
                    "--target",
                    str(target),
                    "--user-skills-root",
                    str(user_skills),
                    "--migrate-legacy-skills",
                ],
            )

    def test_claude_bash_bootstrap_forwards_runner_targets(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            temp_root = Path(raw_temp)
            env, argument_log = self._write_fake_release(temp_root)
            env["ARG_LOG"] = str(argument_log)
            target = temp_root / "workspace with spaces" / ".claude" / "agents"
            claude_md = temp_root / "workspace with spaces" / "CLAUDE.md"

            subprocess.run(
                [
                    "bash",
                    str(ROOT / "scripts/bootstrap-install-claude.sh"),
                    "--repo",
                    "example/project",
                    "--version",
                    "v0.28.0",
                    "--target",
                    str(target),
                    "--claude-md",
                    str(claude_md),
                    "--no-runner",
                ],
                cwd=ROOT,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )

            self.assertEqual(
                argument_log.read_text(encoding="utf-8").splitlines(),
                [
                    "--target",
                    str(target),
                    "--claude-md",
                    str(claude_md),
                    "--no-runner",
                ],
            )

    def test_powershell_bootstraps_expose_and_forward_project_flags(self) -> None:
        codex = (ROOT / "scripts/bootstrap-install-codex.ps1").read_text(encoding="utf-8")
        claude = (ROOT / "scripts/bootstrap-install-claude.ps1").read_text(encoding="utf-8")

        for expected in (
            "[string]$WorkspaceRoot",
            "[string]$GlobalAgentsTarget",
            "[string]$UserSkillsRoot",
            "$installParams.WorkspaceRoot = $WorkspaceRoot",
            "$installParams.GlobalAgentsTarget = $GlobalAgentsTarget",
            "$installParams.UserSkillsRoot = $UserSkillsRoot",
            "Codex agent model profiles are workspace-only",
        ):
            self.assertIn(expected, codex)
        for expected in (
            "[string]$ClaudeMd",
            "[switch]$NoRunner",
            "$installParams.ClaudeMd = $ClaudeMd",
            "$installParams.NoRunner = $true",
        ):
            self.assertIn(expected, claude)

    def test_bash_bootstraps_document_and_validate_project_flags(self) -> None:
        cases = (
            (
                "bootstrap-install-codex.sh",
                "--workspace-root",
                "Workspace root must not be empty.",
            ),
            (
                "bootstrap-install-codex.sh",
                "--global-agents-target",
                "Global AGENTS.md target must not be empty.",
            ),
            (
                "bootstrap-install-codex.sh",
                "--user-skills-root",
                "User skills root must not be empty.",
            ),
            (
                "bootstrap-install-claude.sh",
                "--claude-md",
                "CLAUDE.md path must not be empty.",
            ),
        )
        for script_name, flag, expected_error in cases:
            with self.subTest(flag=flag):
                help_result = subprocess.run(
                    ["bash", str(ROOT / "scripts" / script_name), "--help"],
                    cwd=ROOT,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                self.assertIn(flag, help_result.stdout)
                invalid = subprocess.run(
                    ["bash", str(ROOT / "scripts" / script_name), flag, "   "],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(invalid.returncode, 2)
                self.assertIn(expected_error, invalid.stderr)

    @unittest.skipUnless(shutil.which("pwsh"), "PowerShell 7 is not installed")
    def test_powershell_bootstraps_parse(self) -> None:
        for script_name in (
            "bootstrap-install-codex.ps1",
            "bootstrap-install-claude.ps1",
            "bootstrap-install-copilot.ps1",
        ):
            with self.subTest(script=script_name):
                result = subprocess.run(
                    [
                        "pwsh",
                        "-NoLogo",
                        "-NoProfile",
                        "-Command",
                        "$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile($env:PS_PARSE_FILE, [ref]$null, [ref]$errors) > $null; if ($errors.Count) { $errors | Out-String | Write-Error; exit 1 }",
                    ],
                    cwd=ROOT,
                    env={
                        **os.environ,
                        "PS_PARSE_FILE": str(ROOT / "scripts" / script_name),
                    },
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which("pwsh"), "PowerShell 7 is not installed")
    def test_powershell_bootstraps_validate_project_paths_before_network(self) -> None:
        cases = (
            (
                "bootstrap-install-codex.ps1",
                "-WorkspaceRoot",
                "Workspace root must not be empty.",
            ),
            (
                "bootstrap-install-codex.ps1",
                "-GlobalAgentsTarget",
                "Global AGENTS.md target must not be empty.",
            ),
            (
                "bootstrap-install-codex.ps1",
                "-UserSkillsRoot",
                "User skills root must not be empty.",
            ),
            (
                "bootstrap-install-claude.ps1",
                "-ClaudeMd",
                "CLAUDE.md path must not be empty.",
            ),
        )
        for script_name, parameter, expected_error in cases:
            with self.subTest(parameter=parameter):
                result = subprocess.run(
                    [
                        "pwsh",
                        "-NoLogo",
                        "-NoProfile",
                        "-File",
                        str(ROOT / "scripts" / script_name),
                        parameter,
                        "   ",
                    ],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected_error, result.stderr)

    def test_bash_bootstraps_reject_shell_active_targets_before_network(self) -> None:
        for runtime in ("codex", "claude", "copilot"):
            with self.subTest(runtime=runtime):
                result = subprocess.run(
                    [
                        "bash",
                        str(ROOT / "scripts" / f"bootstrap-install-{runtime}.sh"),
                        "--target",
                        "/tmp/unsafe$target",
                    ],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, 2)
                self.assertIn("unsafe in generated shell instructions", result.stderr)

    @unittest.skipUnless(shutil.which("pwsh"), "PowerShell 7 is not installed")
    def test_powershell_bootstraps_reject_shell_active_targets_before_network(self) -> None:
        for runtime in ("codex", "claude", "copilot"):
            with self.subTest(runtime=runtime):
                result = subprocess.run(
                    [
                        "pwsh",
                        "-NoLogo",
                        "-NoProfile",
                        "-File",
                        str(ROOT / "scripts" / f"bootstrap-install-{runtime}.ps1"),
                        "-Target",
                        "/tmp/unsafe$target",
                    ],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("unsafe", result.stderr)
                self.assertIn("generated shell instructions", result.stderr)


if __name__ == "__main__":
    unittest.main()
