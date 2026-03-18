from __future__ import annotations

import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from contextlib import redirect_stdout
from pathlib import Path
import shutil
from typing import Any
from html.parser import HTMLParser


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


def extract_embedded_status_data(html: str) -> dict[str, Any]:
    start_marker = '<script id="status-data" type="application/json">'
    end_marker = "</script>"
    start = html.index(start_marker) + len(start_marker)
    end = html.index(end_marker, start)
    return json.loads(html[start:end])


class InlineScriptExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._capture_depth = 0
        self._chunks: list[str] = []
        self.scripts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "script":
            return
        attributes = dict(attrs)
        if attributes.get("src") is None:
            self._capture_depth += 1
            if self._capture_depth == 1:
                self._chunks = []

    def handle_data(self, data: str) -> None:
        if self._capture_depth == 1:
            self._chunks.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "script" or self._capture_depth == 0:
            return
        if self._capture_depth == 1:
            self.scripts.append("".join(self._chunks))
            self._chunks = []
        self._capture_depth -= 1


def extract_inline_scripts(html: str) -> list[str]:
    parser = InlineScriptExtractor()
    parser.feed(html)
    return parser.scripts


def assert_inline_javascript_parses(test_case: unittest.TestCase, html: str) -> None:
    node = shutil.which("node")
    if node is None:
        test_case.skipTest("Node.js is required for generated-JS syntax validation")

    scripts = extract_inline_scripts(html)
    test_case.assertGreaterEqual(
        len(scripts), 3, msg="Expected embedded JSON plus viewer scripts"
    )

    with tempfile.TemporaryDirectory() as temp_dir:
        js_path = Path(temp_dir) / "viewer-inline.js"
        js_path.write_text("\n\n".join(scripts[1:]), encoding="utf-8")
        result = subprocess.run(
            [node, "--check", str(js_path)],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
        )

    test_case.assertEqual(
        result.returncode,
        0,
        msg=f"Generated inline JavaScript failed syntax check:\n{result.stderr}",
    )


def load_status_cli_module() -> Any:
    spec = importlib.util.spec_from_file_location("status_cli_under_test", SCRIPT)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load module from {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def wait_for_text(buffer: io.StringIO, needle: str, timeout: float = 5.0) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = buffer.getvalue()
        if needle in value:
            return value
        time.sleep(0.05)
    raise AssertionError(
        f"Timed out waiting for {needle!r}. Current output: {buffer.getvalue()!r}"
    )


def request_url(url: str, *, method: str = "GET") -> tuple[int, bytes, dict[str, str]]:
    request = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.getcode(), response.read(), dict(response.headers.items())
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(), dict(exc.headers.items())


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

    def test_web_export_with_run_only_fixture_writes_self_contained_html(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "run-only-view.html"
            fixture_copy = Path(temp_dir) / "run-status.json"
            shutil.copy2(RUN_ONLY_FIXTURE, fixture_copy)

            before = snapshot_tree(Path(temp_dir))
            result = run_cli(
                "web",
                "export",
                "--status-file",
                str(fixture_copy),
                "--output",
                str(output_path),
                "--refresh-interval",
                "30",
            )
            after = snapshot_tree(Path(temp_dir))
            output_exists = output_path.is_file()
            html = output_path.read_text(encoding="utf-8")
            status_data = extract_embedded_status_data(html)

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("READ-ONLY WEB EXPORT WRITTEN", result.stdout)
        self.assertIn(str(output_path), result.stdout)
        self.assertIn("Theme: auto", result.stdout)
        self.assertIn("Focus: all", result.stdout)
        self.assertIn("Refresh interval: 30s", result.stdout)
        self.assertTrue(output_exists)
        self.assertIn("Read-only web export", html)
        self.assertIn("Bounded live refresh", html)
        self.assertIn("run_status_examples_run_only_01", html)
        self.assertIn("details unavailable in run-only layout", html)
        self.assertIn('id="status-data"', html)
        self.assertIn("Refresh now", html)
        self.assertIn(
            "Read-only only: this viewer never controls the pipeline and never writes back to status artifacts.",
            html,
        )
        self.assertIn(
            "Live refresh is read-only and attempts to re-read the original local status files. Some browsers block local file fetches for exported HTML.",
            html,
        )
        self.assertEqual(status_data["meta"]["refresh"]["default_interval_seconds"], 30)
        self.assertEqual(
            status_data["meta"]["refresh"]["interval_options_seconds"],
            [5, 10, 15, 30, 60],
        )
        self.assertTrue(status_data["meta"]["read_only"])
        self.assertEqual(
            {key: value for key, value in after.items() if key != "run-only-view.html"},
            before,
        )

    def test_web_export_with_expanded_fixture_writes_graph_like_html(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "expanded-view.html"
            fixture_copy = Path(temp_dir) / "status-layout.expanded.valid"
            shutil.copytree(EXPANDED_FIXTURE_DIR, fixture_copy)

            before = snapshot_tree(fixture_copy)
            result = run_cli(
                "web",
                "export",
                "--project-dir",
                str(fixture_copy),
                "--output",
                str(output_path),
                "--focus",
                "blocked",
                "--theme",
                "dark",
            )
            after = snapshot_tree(fixture_copy)
            html = output_path.read_text(encoding="utf-8")
            status_data = extract_embedded_status_data(html)

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Theme: dark", result.stdout)
        self.assertIn("Focus: blocked", result.stdout)
        self.assertIn("Refresh interval: 15s", result.stdout)
        self.assertIn("Run → tasks → agents", html)
        self.assertIn("task-local-server-smoke", html)
        self.assertIn("agent-server-01", html)
        self.assertIn("Agent hotspots", html)
        self.assertIn("Status graph", html)
        self.assertIn("blocked", html)
        self.assertIn('id="refresh-interval"', html)
        self.assertIn("Auto refresh every", html)
        self.assertEqual(status_data["meta"]["refresh"]["default_interval_seconds"], 15)
        self.assertEqual(after, before)

    def test_web_export_generated_inline_javascript_passes_syntax_check(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "expanded-view.html"
            fixture_copy = Path(temp_dir) / "status-layout.expanded.valid"
            shutil.copytree(EXPANDED_FIXTURE_DIR, fixture_copy)

            result = run_cli(
                "web",
                "export",
                "--project-dir",
                str(fixture_copy),
                "--output",
                str(output_path),
                "--theme",
                "dark",
            )
            html = output_path.read_text(encoding="utf-8")

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Status graph", html)
        self.assertIn("Refresh now", html)
        assert_inline_javascript_parses(self, html)

    def test_web_export_surfaces_missing_referenced_files_as_warnings(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "warnings-view.html"
            fixture_copy = Path(temp_dir) / "status-layout.expanded.valid"
            shutil.copytree(EXPANDED_FIXTURE_DIR, fixture_copy)
            (fixture_copy / "tasks" / "task-browser-resume.json").unlink()
            (fixture_copy / "agents" / "agent-server-01.json").unlink()

            before = snapshot_tree(fixture_copy)
            result = run_cli(
                "web",
                "export",
                "--project-dir",
                str(fixture_copy),
                "--output",
                str(output_path),
            )
            after = snapshot_tree(fixture_copy)
            html = output_path.read_text(encoding="utf-8")

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("READ-ONLY WEB EXPORT WRITTEN", result.stdout)
        self.assertIn("Warnings", html)
        self.assertIn(
            "Missing task file for task-browser-resume: status/tasks/task-browser-resume.json",
            html,
        )
        self.assertIn(
            "Missing agent file for agent-server-01: status/agents/agent-server-01.json",
            html,
        )
        self.assertIn("Missing task file for active task task-browser-resume.", html)
        self.assertEqual(after, before)

    def test_web_export_requires_existing_output_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "missing" / "view.html"
            result = run_cli(
                "web",
                "export",
                "--status-file",
                str(RUN_ONLY_FIXTURE),
                "--output",
                str(output_path),
            )

        self.assertEqual(result.returncode, 1)
        self.assertIn("Output directory does not exist", result.stderr)
        self.assertFalse(output_path.exists())

    def test_web_export_requires_explicit_output_argument(self) -> None:
        result = run_cli("web", "export", "--status-file", str(RUN_ONLY_FIXTURE))

        self.assertEqual(result.returncode, 2)
        self.assertIn("the following arguments are required: --output", result.stderr)

    def test_web_export_rejects_refresh_interval_outside_allowed_bounds(self) -> None:
        result = run_cli(
            "web",
            "export",
            "--status-file",
            str(RUN_ONLY_FIXTURE),
            "--output",
            str(REPO_ROOT / "status-cli" / "tests" / "ignored.html"),
            "--refresh-interval",
            "12",
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn("invalid choice: '12'", result.stderr)

    def test_web_serve_rejects_non_loopback_host_choice(self) -> None:
        result = run_cli(
            "web",
            "serve",
            "--status-file",
            str(RUN_ONLY_FIXTURE),
            "--host",
            "0.0.0.0",
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn("invalid choice: '0.0.0.0'", result.stderr)

    def test_web_serve_rejects_refresh_interval_outside_allowed_bounds(self) -> None:
        result = run_cli(
            "web",
            "serve",
            "--status-file",
            str(RUN_ONLY_FIXTURE),
            "--refresh-interval",
            "12",
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn("invalid choice: '12'", result.stderr)

    def test_web_serve_lifecycle_is_read_only_and_cleanup_safe(self) -> None:
        status_cli = load_status_cli_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_copy = Path(temp_dir) / "run-status.json"
            shutil.copy2(RUN_ONLY_FIXTURE, fixture_copy)
            before = snapshot_tree(Path(temp_dir))

            server_ready = threading.Event()
            server_box: dict[str, Any] = {}
            result_box: dict[str, Any] = {}
            stdout = io.StringIO()
            original_server_class = status_cli.LoopbackOnlyStatusServer

            class TrackingLoopbackServer(original_server_class):
                def __init__(self, *args: Any, **kwargs: Any) -> None:
                    super().__init__(*args, **kwargs)
                    server_box["server"] = self
                    server_ready.set()

            def run_server() -> None:
                args = status_cli.argparse.Namespace(
                    status_file=str(fixture_copy),
                    status_dir=None,
                    output_dir=None,
                    project_dir=None,
                    host="127.0.0.1",
                    port=0,
                    focus="blocked",
                    theme="dark",
                    refresh_interval=30,
                    open_browser=False,
                )
                try:
                    with redirect_stdout(stdout):
                        result_box["result"] = status_cli.command_web_serve(args)
                except (
                    BaseException
                ) as exc:  # pragma: no cover - surfaced by assertions below
                    result_box["error"] = exc

            status_cli.LoopbackOnlyStatusServer = TrackingLoopbackServer
            worker = threading.Thread(target=run_server, daemon=True)
            worker.start()
            try:
                self.assertTrue(
                    server_ready.wait(timeout=5), msg="localhost viewer did not start"
                )
                startup_output = wait_for_text(
                    stdout, "READ-ONLY LOCALHOST VIEWER STARTED"
                )
                server = server_box["server"]
                viewer_url = (
                    f"http://{server.server_address[0]}:{server.server_address[1]}/"
                )

                html_status, html_body, _ = request_url(viewer_url)
                payload_status, payload_body, payload_headers = request_url(
                    viewer_url + "api/payload"
                )
                poll_status, poll_body, _ = request_url(viewer_url + "api/payload")
                head_status, head_body, head_headers = request_url(
                    viewer_url + "api/payload", method="HEAD"
                )
                post_status, post_body, post_headers = request_url(
                    viewer_url + "api/payload", method="POST"
                )

                html = html_body.decode("utf-8")
                payload = json.loads(payload_body)
                polled_payload = json.loads(poll_body)

                self.assertIn("READ-ONLY LOCALHOST VIEWER STARTED", startup_output)
                self.assertIn(f"Viewer URL: {viewer_url}", startup_output)
                self.assertIn(f"Payload URL: {viewer_url}api/payload", startup_output)
                self.assertIn("Theme: dark", startup_output)
                self.assertIn("Focus: blocked", startup_output)
                self.assertIn("Refresh interval: 30s", startup_output)
                self.assertIn(f"Loaded from: {fixture_copy}", startup_output)
                self.assertIn(
                    "Browser: not opened automatically; copy Viewer URL into your browser.",
                    startup_output,
                )
                self.assertIn(
                    "Shutdown: press Ctrl+C to stop and close the loopback socket.",
                    startup_output,
                )

                self.assertEqual(html_status, 200)
                self.assertIn("Read-only localhost viewer", html)
                self.assertIn("Auto refresh every", html)
                self.assertIn("Refresh now", html)
                self.assertIn("run_status_examples_run_only_01", html)
                self.assertIn("loopback-only HTTP viewer", html)

                self.assertEqual(payload_status, 200)
                self.assertEqual(poll_status, 200)
                self.assertEqual(
                    payload["meta"]["viewer_label"], "Read-only localhost viewer"
                )
                self.assertTrue(payload["meta"]["read_only"])
                self.assertEqual(
                    payload["meta"]["refresh"]["default_interval_seconds"], 30
                )
                self.assertEqual(
                    payload["meta"]["refresh"]["interval_options_seconds"],
                    [5, 10, 15, 30, 60],
                )
                self.assertEqual(payload["meta"]["focus"], "blocked")
                self.assertEqual(payload, polled_payload)
                self.assertEqual(
                    payload_headers.get("Cache-Control"),
                    "no-store",
                )

                self.assertEqual(head_status, 200)
                self.assertEqual(head_body, b"")
                self.assertEqual(
                    head_headers.get("Content-Type"),
                    "application/json; charset=utf-8",
                )

                self.assertEqual(post_status, 405)
                self.assertEqual(
                    post_headers.get("Allow"),
                    "GET, HEAD",
                )
                self.assertIn(
                    "Method not allowed. This localhost viewer is read-only.",
                    post_body.decode("utf-8"),
                )
            finally:
                if "server" in server_box:
                    server_box["server"].shutdown()
                worker.join(timeout=5)
                status_cli.LoopbackOnlyStatusServer = original_server_class

            self.assertFalse(
                worker.is_alive(), msg="localhost viewer thread did not stop"
            )
            if "error" in result_box:
                raise result_box["error"]

            after = snapshot_tree(Path(temp_dir))
            shutdown_output = stdout.getvalue()
            self.assertEqual(after, before)
            self.assertIn(
                "Read-only localhost viewer stopped. Loopback socket closed for",
                shutdown_output,
            )
            self.assertEqual(
                result_box["result"].splitlines()[0],
                "READ-ONLY LOCALHOST VIEWER STOPPED",
            )
            self.assertIn(f"Viewer URL: {viewer_url}", result_box["result"])
            self.assertIn("Cleanup: loopback socket closed.", result_box["result"])

    def test_web_serve_can_request_browser_open(self) -> None:
        status_cli = load_status_cli_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_copy = Path(temp_dir) / "run-status.json"
            shutil.copy2(RUN_ONLY_FIXTURE, fixture_copy)

            server_ready = threading.Event()
            server_box: dict[str, Any] = {}
            result_box: dict[str, Any] = {}
            stdout = io.StringIO()
            opened: list[tuple[str, int]] = []
            original_server_class = status_cli.LoopbackOnlyStatusServer
            original_browser_open = status_cli.webbrowser.open

            class TrackingLoopbackServer(original_server_class):
                def __init__(self, *args: Any, **kwargs: Any) -> None:
                    super().__init__(*args, **kwargs)
                    server_box["server"] = self
                    server_ready.set()

            def fake_browser_open(url: str, new: int = 0) -> bool:
                opened.append((url, new))
                return True

            def run_server() -> None:
                args = status_cli.argparse.Namespace(
                    status_file=str(fixture_copy),
                    status_dir=None,
                    output_dir=None,
                    project_dir=None,
                    host="127.0.0.1",
                    port=0,
                    focus=None,
                    theme="auto",
                    refresh_interval=15,
                    open_browser=True,
                )
                try:
                    with redirect_stdout(stdout):
                        result_box["result"] = status_cli.command_web_serve(args)
                except (
                    BaseException
                ) as exc:  # pragma: no cover - surfaced by assertions below
                    result_box["error"] = exc

            status_cli.LoopbackOnlyStatusServer = TrackingLoopbackServer
            status_cli.webbrowser.open = fake_browser_open
            worker = threading.Thread(target=run_server, daemon=True)
            worker.start()
            try:
                self.assertTrue(
                    server_ready.wait(timeout=5), msg="localhost viewer did not start"
                )
                startup_output = wait_for_text(
                    stdout, "READ-ONLY LOCALHOST VIEWER STARTED"
                )
                server = server_box["server"]
                viewer_url = (
                    f"http://{server.server_address[0]}:{server.server_address[1]}/"
                )
                self.assertEqual(opened, [(viewer_url, 2)])
                self.assertIn(f"Viewer URL: {viewer_url}", startup_output)
                self.assertIn("Browser: opened default browser.", startup_output)
            finally:
                if "server" in server_box:
                    server_box["server"].shutdown()
                worker.join(timeout=5)
                status_cli.LoopbackOnlyStatusServer = original_server_class
                status_cli.webbrowser.open = original_browser_open

            self.assertFalse(
                worker.is_alive(), msg="localhost viewer thread did not stop"
            )
            if "error" in result_box:
                raise result_box["error"]


if __name__ == "__main__":
    unittest.main()
