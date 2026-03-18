from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import shutil


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


def snapshot_tree(root: Path) -> dict[str, int]:
    return {
        str(path.relative_to(root)): path.stat().st_mtime_ns
        for path in root.rglob("*")
        if path.is_file()
    }


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

    def test_agent_show_reads_expanded_agent_file(self) -> None:
        result = run_cli(
            "agent",
            "show",
            "agent-server-01",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Agent: agent-server-01", result.stdout)
        self.assertIn("task_id: task-local-server-smoke", result.stdout)
        self.assertIn("cleanup_status: failed", result.stdout)

    def test_agent_show_reports_clear_error_when_layout_has_no_agent_files(
        self,
    ) -> None:
        result = run_cli(
            "agent", "show", "agent-doc-01", "--status-file", str(RUN_ONLY_FIXTURE)
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Agent files are not available for this run", result.stderr)

    def test_visual_with_run_only_fixture_stays_read_only(self) -> None:
        result = run_cli("visual", "--status-file", str(RUN_ONLY_FIXTURE))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("READ-ONLY VISUAL INSPECTION", result.stdout)
        self.assertIn(
            "This view only reads existing status artifacts and never writes files.",
            result.stdout,
        )
        self.assertIn("Run [stale] run_status_examples_run_only_01", result.stdout)
        self.assertIn("Tasks: not available in run-only layout", result.stdout)

    def test_visual_selected_run_is_read_only_and_does_not_mutate_run_only_fixture(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_copy = Path(temp_dir) / "run-status.json"
            shutil.copy2(RUN_ONLY_FIXTURE, fixture_copy)

            before = snapshot_tree(Path(temp_dir))
            result = run_cli(
                "visual",
                "--status-file",
                str(fixture_copy),
                "--select",
                "run",
            )
            after = snapshot_tree(Path(temp_dir))

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Selected node: run", result.stdout)
        self.assertIn("NODE DETAILS", result.stdout)
        self.assertEqual(after, before)

    def test_visual_selected_agent_is_read_only_and_does_not_mutate_expanded_fixture(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_copy = Path(temp_dir) / "status-layout.expanded.valid"
            shutil.copytree(EXPANDED_FIXTURE_DIR, fixture_copy)

            before = snapshot_tree(fixture_copy)
            result = run_cli(
                "visual",
                "--project-dir",
                str(fixture_copy),
                "--select",
                "agent:agent-server-01",
            )
            after = snapshot_tree(fixture_copy)

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Selected node: agent:agent-server-01", result.stdout)
        self.assertEqual(after, before)

    def test_visual_with_expanded_fixture_shows_run_task_agent_tree(self) -> None:
        result = run_cli("visual", "--project-dir", str(EXPANDED_FIXTURE_DIR))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn(
            "Run [waiting_for_user] run_status_examples_expanded_01", result.stdout
        )
        self.assertIn(
            "Task [blocked] task-local-server-smoke - Run a local preview server smoke check and verify teardown evidence.",
            result.stdout,
        )
        self.assertIn("Agent [blocked] agent-server-01 (executor-core)", result.stdout)

    def test_visual_can_select_run_node_details(self) -> None:
        result = run_cli(
            "visual",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
            "--select",
            "run",
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Selected node: run", result.stdout)
        self.assertIn("NODE DETAILS", result.stdout)
        self.assertIn("Completed stages:", result.stdout)
        self.assertIn("Task refs:", result.stdout)

    def test_visual_can_select_task_node_details(self) -> None:
        result = run_cli(
            "visual",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
            "--select",
            "task:task-local-server-smoke",
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Selected node: task:task-local-server-smoke", result.stdout)
        self.assertIn("Task: task-local-server-smoke", result.stdout)
        self.assertIn(
            "result_summary: Smoke assertions passed, but shutdown verification failed for the temporary server.",
            result.stdout,
        )

    def test_visual_can_select_agent_node_details(self) -> None:
        result = run_cli(
            "visual",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
            "--select",
            "agent:agent-server-01",
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Selected node: agent:agent-server-01", result.stdout)
        self.assertIn("Agent: agent-server-01", result.stdout)
        self.assertIn("resource_handles:", result.stdout)

    def test_visual_selection_fails_gracefully_when_node_is_missing(self) -> None:
        result = run_cli(
            "visual",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
            "--select",
            "task:task-missing",
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Could not find task file for task-missing.", result.stderr)

    def test_visual_selection_fails_gracefully_when_layout_is_run_only(self) -> None:
        result = run_cli(
            "visual",
            "--status-file",
            str(RUN_ONLY_FIXTURE),
            "--select",
            "agent:agent-doc-01",
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Agent files are not available for this run", result.stderr)


if __name__ == "__main__":
    unittest.main()
