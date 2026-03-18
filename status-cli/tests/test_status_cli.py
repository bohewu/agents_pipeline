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

    def test_task_list_reads_expanded_task_files(self) -> None:
        result = run_cli("task", "list", "--project-dir", str(EXPANDED_FIXTURE_DIR))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Tasks (4):", result.stdout)
        self.assertIn(
            "task-local-server-smoke [blocked] Run a local preview server smoke check and verify teardown evidence. (agent=agent-server-01, resource=cleanup_failed)",
            result.stdout,
        )
        self.assertIn(
            "task-browser-resume [stale] Resume a browser-based validation after an executor crash left ownership uncertain. (agent=agent-browser-02, resource=unknown)",
            result.stdout,
        )

    def test_task_list_supports_optional_status_filter(self) -> None:
        result = run_cli(
            "task",
            "list",
            "--status",
            "done",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Tasks (2) [status=done]:", result.stdout)
        self.assertIn("task-doc-summary [done]", result.stdout)
        self.assertIn("task-process-build [done]", result.stdout)
        self.assertNotIn("task-local-server-smoke [blocked]", result.stdout)

    def test_task_list_reports_clear_error_when_layout_has_no_task_files(self) -> None:
        result = run_cli("task", "list", "--status-file", str(RUN_ONLY_FIXTURE))
        self.assertEqual(result.returncode, 1)
        self.assertIn("Task files are not available for this run", result.stderr)

    def test_task_list_reports_missing_referenced_files_clearly(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_copy = Path(temp_dir) / "status-layout.expanded.valid"
            shutil.copytree(EXPANDED_FIXTURE_DIR, fixture_copy)
            missing_task = fixture_copy / "tasks" / "task-browser-resume.json"
            missing_task.unlink()

            result = run_cli("task", "list", "--project-dir", str(fixture_copy))

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Warnings:", result.stdout)
        self.assertIn(
            "Missing task file for task-browser-resume: status/tasks/task-browser-resume.json",
            result.stdout,
        )

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

    def test_agent_list_reads_expanded_agent_files(self) -> None:
        result = run_cli("agent", "list", "--project-dir", str(EXPANDED_FIXTURE_DIR))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Agents (4):", result.stdout)
        self.assertIn(
            "agent-server-01 [blocked] task=task-local-server-smoke agent=executor-core attempt=1 cleanup=failed",
            result.stdout,
        )
        self.assertIn(
            "agent-doc-01 [done] task=task-doc-summary agent=doc-writer attempt=1",
            result.stdout,
        )

    def test_agent_list_supports_status_and_task_filters(self) -> None:
        result = run_cli(
            "agent",
            "list",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
            "--status",
            "blocked",
            "--task-id",
            "task-local-server-smoke",
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn(
            "Agents (1) [status=blocked, task_id=task-local-server-smoke]:",
            result.stdout,
        )
        self.assertIn("agent-server-01 [blocked]", result.stdout)
        self.assertNotIn("agent-doc-01", result.stdout)

    def test_agent_list_reports_clear_error_when_layout_has_no_agent_files(
        self,
    ) -> None:
        result = run_cli("agent", "list", "--status-file", str(RUN_ONLY_FIXTURE))
        self.assertEqual(result.returncode, 1)
        self.assertIn("Agent files are not available for this run", result.stderr)

    def test_agent_list_reports_missing_referenced_files_clearly(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_copy = Path(temp_dir) / "status-layout.expanded.valid"
            shutil.copytree(EXPANDED_FIXTURE_DIR, fixture_copy)
            missing_agent = fixture_copy / "agents" / "agent-browser-02.json"
            missing_agent.unlink()

            result = run_cli("agent", "list", "--project-dir", str(fixture_copy))

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Warnings:", result.stdout)
        self.assertIn(
            "Missing agent file for agent-browser-02: status/agents/agent-browser-02.json",
            result.stdout,
        )

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

    def test_dashboard_with_run_only_fixture_shows_local_read_only_summary(
        self,
    ) -> None:
        result = run_cli("dashboard", "--status-file", str(RUN_ONLY_FIXTURE))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("READ-ONLY DASHBOARD", result.stdout)
        self.assertIn(
            "This dashboard only reads existing status artifacts.", result.stdout
        )
        self.assertIn("Layout: run-only", result.stdout)
        self.assertIn("count=1 (details unavailable in run-only layout)", result.stdout)
        self.assertIn(
            "none (agent files unavailable in run-only layout)", result.stdout
        )

    def test_dashboard_with_expanded_fixture_shows_triage_sections(self) -> None:
        result = run_cli("dashboard", "--project-dir", str(EXPANDED_FIXTURE_DIR))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("READ-ONLY DASHBOARD", result.stdout)
        self.assertIn("Layout: expanded", result.stdout)
        self.assertIn("Blocked tasks:", result.stdout)
        self.assertIn("Stale tasks:", result.stdout)
        self.assertIn("Active work:", result.stdout)
        self.assertIn(
            "task-local-server-smoke [blocked] Run a local preview server smoke check and verify teardown evidence.",
            result.stdout,
        )
        self.assertIn(
            "task-browser-resume [stale] Resume a browser-based validation after an executor crash left ownership uncertain.",
            result.stdout,
        )
        self.assertIn(
            "executor-core: count=1; active=1; statuses=blocked=1; cleanup_issues=1; tasks=task-local-server-smoke",
            result.stdout,
        )

    def test_dashboard_focus_modes_filter_triage_output(self) -> None:
        blocked_result = run_cli(
            "dashboard",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
            "--focus",
            "blocked",
        )
        self.assertEqual(blocked_result.returncode, 0, msg=blocked_result.stderr)
        self.assertIn("READ-ONLY DASHBOARD [focus=blocked]", blocked_result.stdout)
        self.assertIn("task-local-server-smoke [blocked]", blocked_result.stdout)
        self.assertIn("Stale tasks:\n  - none", blocked_result.stdout)
        self.assertNotIn("executor-advanced:", blocked_result.stdout)

        stale_result = run_cli(
            "dashboard",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
            "--focus",
            "stale",
        )
        self.assertEqual(stale_result.returncode, 0, msg=stale_result.stderr)
        self.assertIn("READ-ONLY DASHBOARD [focus=stale]", stale_result.stdout)
        self.assertIn("Blocked tasks:\n  - none", stale_result.stdout)
        self.assertIn("task-browser-resume [stale]", stale_result.stdout)
        self.assertIn("executor-advanced:", stale_result.stdout)
        self.assertNotIn("executor-core:", stale_result.stdout)

        active_result = run_cli(
            "dashboard",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
            "--focus",
            "active",
        )
        self.assertEqual(active_result.returncode, 0, msg=active_result.stderr)
        self.assertIn("READ-ONLY DASHBOARD [focus=active]", active_result.stdout)
        self.assertIn("task-local-server-smoke [blocked]", active_result.stdout)
        self.assertIn("task-browser-resume [stale]", active_result.stdout)
        self.assertIn("Agent hotspots:\n  - none", active_result.stdout)

    def test_dashboard_invalid_focus_mode_reports_parser_error(self) -> None:
        result = run_cli(
            "dashboard",
            "--project-dir",
            str(EXPANDED_FIXTURE_DIR),
            "--focus",
            "done",
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("invalid choice: 'done'", result.stderr)

    def test_dashboard_reports_missing_referenced_files_as_warnings(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_copy = Path(temp_dir) / "status-layout.expanded.valid"
            shutil.copytree(EXPANDED_FIXTURE_DIR, fixture_copy)
            (fixture_copy / "tasks" / "task-browser-resume.json").unlink()
            (fixture_copy / "agents" / "agent-server-01.json").unlink()

            result = run_cli("dashboard", "--project-dir", str(fixture_copy))

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Warnings:", result.stdout)
        self.assertIn(
            "Missing task file for task-browser-resume: status/tasks/task-browser-resume.json",
            result.stdout,
        )
        self.assertIn(
            "Missing agent file for agent-server-01: status/agents/agent-server-01.json",
            result.stdout,
        )
        self.assertIn(
            "Missing task file for active task task-browser-resume.", result.stdout
        )

    def test_dashboard_is_read_only_and_does_not_mutate_expanded_fixture(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_copy = Path(temp_dir) / "status-layout.expanded.valid"
            shutil.copytree(EXPANDED_FIXTURE_DIR, fixture_copy)

            before = snapshot_tree(fixture_copy)
            result = run_cli("dashboard", "--project-dir", str(fixture_copy))
            after = snapshot_tree(fixture_copy)

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(after, before)


if __name__ == "__main__":
    unittest.main()
