from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "status-cli" / "status_cli.py"
RUN_ONLY_FIXTURE = (
    REPO_ROOT
    / "opencode"
    / "protocols"
    / "examples"
    / "status-layout.run-only.valid"
    / "run-status.json"
)
EXPANDED_FIXTURE_DIR = (
    REPO_ROOT / "opencode" / "protocols" / "examples" / "status-layout.expanded.valid"
)


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
    )


class StatusCliTests(unittest.TestCase):
    def test_summary_with_explicit_status_file_on_run_only_fixture(self) -> None:
        result = run_cli("summary", "--status-file", str(RUN_ONLY_FIXTURE))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Run ID: run_status_examples_run_only_01", result.stdout)
        self.assertIn("Layout: run-only", result.stdout)
        self.assertIn("Status: stale", result.stdout)
        self.assertIn("Task counts: pending=0", result.stdout)

    def test_run_show_with_project_dir_on_expanded_fixture(self) -> None:
        result = run_cli("run", "show", "--project-dir", str(EXPANDED_FIXTURE_DIR))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Run ID: run_status_examples_expanded_01", result.stdout)
        self.assertIn("Task refs:", result.stdout)
        self.assertIn("Agent refs:", result.stdout)

    def test_task_show_reads_expanded_task_file(self) -> None:
        result = run_cli(
            "task",
            "show",
            "task-local-server-smoke",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Task: task-local-server-smoke", result.stdout)
        self.assertIn("status: blocked", result.stdout)
        self.assertIn("resource_status: cleanup_failed", result.stdout)

    def test_agent_show_reports_clear_error_when_layout_has_no_agent_files(
        self,
    ) -> None:
        result = run_cli(
            "agent", "show", "agent-doc-01", "--status-file", str(RUN_ONLY_FIXTURE)
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Agent files are not available for this run", result.stderr)


if __name__ == "__main__":
    unittest.main()
