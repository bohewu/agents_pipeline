from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock


TOOL = Path(__file__).resolve().parents[1] / "tools/codex-external-role.py"
SPEC = importlib.util.spec_from_file_location("codex_external_role", TOOL)
assert SPEC and SPEC.loader
external = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(external)

THREAD = "01a0cd95-4be4-7862-981a-7011b9d331a7"
INSTRUCTIONS = "# ROLE\nRead only.\n"
ATTEMPT = "00000000-0000-4000-8000-000000000001"
OTHER_ATTEMPT = "00000000-0000-4000-8000-000000000002"


def executor_fixture(root: Path) -> tuple[Path, Path, dict[str, object], bytes]:
    workspace = root / "workspace"
    workspace.mkdir()
    subprocess.run(["git", "init", "-q", str(workspace)], check=True)
    (workspace / "target.py").write_text("original\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(workspace), "add", "target.py"], check=True)
    subprocess.run([
        "git", "-C", str(workspace), "-c", "user.name=Test",
        "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline",
    ], check=True)
    task_file = root / "task.json"
    task_file.write_text(json.dumps({
        "task_id": "atomic-1", "task_intent": "execute",
        "reasoning_signals": ["local_scope"], "task": "Update target.py",
        "allowed_paths": ["target.py"],
        "acceptance_criteria": ["Target is updated"], "verification": [],
    }), encoding="utf-8")
    role_file = root / "executor.toml"
    role_file.write_text('developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8")
    resolution: dict[str, object] = {
        "workspace": str(workspace), "role_config": str(role_file),
        "requested_model": "gpt-6-sol", "requested_effort": "medium",
        "dispatch_supported": True,
        "role_instructions_sha256": external.hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
    }
    output = {
        "task_id": "atomic-1", "status": "done", "changes": ["target.py updated"],
        "evidence": [], "operational_retries_used": 0, "repair_attempts_used": 0,
        "last_failure_signature": "", "notes": "", "followups": [],
    }
    raw = "\n".join(json.dumps(event) for event in (
        {"type": "thread.started", "thread_id": THREAD},
        {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(output)}},
        {"type": "turn.completed", "usage": {"input_tokens": 10}},
    )).encode()
    return workspace, task_file, resolution, raw


class ExternalRoleTests(unittest.TestCase):
    def test_cli_reports_resolution_conflict_as_json(self) -> None:
        output = io.StringIO()
        with mock.patch.object(external, "resolve_role", side_effect=external.ResolutionConflict("tier conflict")), \
             redirect_stdout(output):
            code = external.main(["resolve-role", "--role", "planner", "--task-intent", "design"])
        self.assertEqual(code, 3)
        self.assertEqual(json.loads(output.getvalue())["status"], "conflicted")

        output = io.StringIO()
        with mock.patch.object(external, "resolve_role", return_value={
            "status": "ready", "dispatch_supported": False,
        }), redirect_stdout(output):
            code = external.main(["resolve-role", "--role", "reviewer", "--task-intent", "review"])
        self.assertEqual(code, 0)
        self.assertFalse(json.loads(output.getvalue())["dispatch_supported"])

    def test_resolve_uses_saved_binding_and_reasoning_resolver(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            roles = workspace / ".codex/agents"
            roles.mkdir(parents=True)
            source = workspace / "agents-pipeline/agents"
            source.mkdir(parents=True)
            (source / "repo-scout.md").write_text(
                "---\nname: repo-scout\nkind: subagent\n---\n", encoding="utf-8",
            )
            (roles / "repo-scout.toml").write_text(
                'name = "repo-scout"\nmodel = "gpt-6-luna"\n'
                'developer_instructions = "# ROLE\\nRead only.\\n"\n',
                encoding="utf-8",
            )
            config = {
                "provenance": {"source": "workspace_profile"},
                "role_binding": {"role": "repo-scout", "model": "gpt-6-luna", "model_tier": "mini"},
                "model_set": {"id": "openai"},
                "reasoning_projection": {"id": "openai-gpt6-v1"},
            }
            status = {
                "configured": True, "health": "ok", "profile_eligibility": "eligible",
                "catalog_state": "current", "configuration_compatibility": "current",
                "workspace": str(workspace), "roles_dir": str(roles), "profile": "balanced",
                "global_target": str(workspace),
                "resolved_configurations": {"repo-scout": config},
            }
            decision = {
                "conflict": None, "enforcement_status": "requested",
                "dispatch_effort": "high", "effective_class": "routine",
            }
            with mock.patch.object(external, "_json_command", side_effect=[status, decision]) as command:
                resolved = external.resolve_role(workspace, "repo-scout", ["local_scope"])
            self.assertEqual(resolved["requested_model"], "gpt-6-luna")
            self.assertEqual(resolved["requested_effort"], "high")
            self.assertTrue(resolved["dispatch_supported"])
            self.assertEqual(resolved["enforcement_status"], "requested")
            request = json.loads(command.call_args_list[1].args[0][3])
            self.assertEqual(request["resolved_configuration"], config)
            self.assertEqual(request["reasoning_signals"], ["local_scope"])

            (source / "reviewer.md").write_text(
                "---\nname: reviewer\nkind: subagent\n---\n", encoding="utf-8",
            )
            (roles / "reviewer.toml").write_text(
                'name = "reviewer"\nmodel = "gpt-6-astra"\n'
                'developer_instructions = "# ROLE\\nRead only.\\n"\n',
                encoding="utf-8",
            )
            reviewer_config = {
                **config,
                "role_binding": {"role": "reviewer", "model": "gpt-6-astra", "model_tier": "strong"},
            }
            status["resolved_configurations"]["reviewer"] = reviewer_config
            deep = {**decision, "effective_class": "deep"}
            with mock.patch.object(external, "_json_command", side_effect=[status, deep]) as command:
                resolved = external.resolve_role(workspace, "reviewer", ["local_scope"], "review", "ad-hoc-review")
            self.assertTrue(resolved["dispatch_supported"])
            self.assertEqual(json.loads(command.call_args_list[1].args[0][3])["dispatch_context"], "ad-hoc-review")
            assurance = {**decision, "effective_class": "assurance"}
            with mock.patch.object(external, "_json_command", side_effect=[status, assurance]):
                resolved = external.resolve_role(workspace, "reviewer", ["formal_accept_reject"], "review", "ad-hoc-review")
            self.assertFalse(resolved["dispatch_supported"])

            for role, intent, model, tier, classification in (
                ("test-runner", "inspect", "gpt-6-luna", "mini", "routine"),
                ("debugger", "diagnose", "gpt-6-astra", "strong", "deep"),
                ("specifier", "design", "gpt-6-sol", "standard", "deliberative"),
                ("flow-splitter", "design", "gpt-6-sol", "standard", "deliberative"),
                ("doc-writer", "design", "gpt-6-sol", "standard", "deep"),
            ):
                (source / f"{role}.md").write_text(
                    f"---\nname: {role}\nkind: subagent\n---\n", encoding="utf-8",
                )
                (roles / f"{role}.toml").write_text(
                    f'name = "{role}"\nmodel = "{model}"\n'
                    'developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8",
                )
                status["resolved_configurations"][role] = {
                    **config,
                    "role_binding": {"role": role, "model": model, "model_tier": tier},
                }
                with mock.patch.object(external, "_json_command", side_effect=[
                    status, {**decision, "effective_class": classification},
                ]):
                    resolved = external.resolve_role(workspace, role, ["local_scope"], intent)
                self.assertTrue(resolved["dispatch_supported"])
                wrong_class = {
                    "test-runner": "deliberative", "debugger": "assurance",
                    "specifier": "deep", "flow-splitter": "deep", "doc-writer": "assurance",
                }[role]
                with mock.patch.object(external, "_json_command", side_effect=[
                    status, {**decision, "effective_class": wrong_class},
                ]):
                    resolved = external.resolve_role(workspace, role, ["local_scope"], intent)
                self.assertFalse(resolved["dispatch_supported"])

    def test_resolution_rejects_unhealthy_profile_and_other_roles(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            with mock.patch.object(external, "_json_command", return_value={"configured": True, "health": "incomplete"}):
                with self.assertRaisesRegex(external.EvidenceError, "health"):
                    external.resolve_role(workspace, "repo-scout", [])
            source = workspace / "agents-pipeline/agents"
            source.mkdir(parents=True)
            (source / "orchestrator-simple.md").write_text(
                "---\nname: orchestrator-simple\nkind: primary\n---\n", encoding="utf-8",
            )
            with self.assertRaisesRegex(external.EvidenceError, "managed leaf"):
                external._verify_leaf_source({"global_target": str(workspace)}, "orchestrator-simple")
            (source / "planner.md").write_text(
                "---\nname: planner\nkind: subagent\n---\n", encoding="utf-8",
            )
            external._verify_leaf_source({"global_target": str(workspace)}, "planner")

    def test_independent_root_evidence_matches_and_detects_wrong_model(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            trace = home / "sessions/2026/09/23" / f"rollout-{THREAD}.jsonl"
            trace.parent.mkdir(parents=True)
            role = home / "repo-scout.toml"
            role.write_text('developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8")
            resolution = {
                "role": "repo-scout", "workspace": "/work/repo",
                "requested_model": "gpt-6-luna", "requested_effort": "high",
                "role_config": str(role),
                "role_instructions_sha256": external.hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
            }
            records = [
                {"type": "session_meta", "payload": {
                    "id": THREAD, "source": "exec", "cwd": "/work/repo", "model_provider": "openai",
                }},
                {"type": "event_msg", "payload": {"type": "task_started", "turn_id": "turn-1"}},
                {"type": "turn_context", "payload": {
                    "turn_id": "turn-1", "cwd": "/work/repo", "model": "gpt-6-luna", "effort": "high",
                    "sandbox_policy": {"type": "read-only"}, "approval_policy": "never",
                }},
                {"type": "response_item", "payload": {
                    "role": "developer", "content": [{"type": "input_text", "text": INSTRUCTIONS}],
                    "internal_chat_message_metadata_passthrough": {"turn_id": "turn-1"},
                }},
                {"type": "event_msg", "payload": {"type": "task_complete", "turn_id": "turn-1"}},
            ]
            trace.write_text("\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8")
            matched = external.inspect_exec(trace, THREAD, resolution, home)
            self.assertEqual(matched["verification_status"], "matched")
            self.assertFalse(matched["native_managed_child"])

            records[2]["payload"]["model"] = "gpt-6-sol"
            trace.write_text("\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8")
            mismatch = external.inspect_exec(trace, THREAD, resolution, home)
            self.assertEqual(mismatch["verification_status"], "mismatch")
            self.assertFalse(mismatch["checks"]["model"])

            records[2]["payload"]["model"] = "gpt-6-luna"
            records.append({"type": "turn_context", "payload": {"turn_id": "turn-2"}})
            trace.write_text("\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8")
            resumed = external.inspect_exec(trace, THREAD, resolution, home)
            self.assertFalse(resumed["checks"]["single_turn"])

    def test_trace_path_must_be_under_sessions_without_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            outside = home / "outside.jsonl"
            outside.write_text("", encoding="utf-8")
            with self.assertRaisesRegex(external.EvidenceError, "sessions"):
                external._plain_trace_path(outside, home)
            sessions = home / "sessions"
            sessions.mkdir()
            link = sessions / f"{THREAD}.jsonl"
            try:
                link.symlink_to(outside)
            except OSError:
                if os.name != "nt":
                    raise
            else:
                with self.assertRaisesRegex(external.EvidenceError, "links or reparse points"):
                    external._plain_trace_path(link, home)

    @unittest.skipUnless(os.name == "nt", "Windows junction regression")
    def test_windows_junctions_cannot_escape_trace_or_target_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            outside = root / "outside"
            outside.mkdir()
            (outside / f"rollout-{THREAD}.jsonl").write_text("", encoding="utf-8")
            (outside / "target.py").write_text("x = 1\n", encoding="utf-8")
            home = root / "codex-home"
            (home / "sessions").mkdir(parents=True)
            workspace = root / "workspace"
            workspace.mkdir()
            for link in (home / "sessions" / "2026", workspace / "linked"):
                subprocess.run(
                    ["cmd", "/c", "mklink", "/J", str(link), str(outside)],
                    check=True, capture_output=True,
                )
            with self.assertRaisesRegex(external.EvidenceError, "reparse points"):
                external._plain_trace_path(home / "sessions" / "2026" / f"rollout-{THREAD}.jsonl", home)
            with self.assertRaisesRegex(external.EvidenceError, "reparse points"):
                external._verify_repo_paths(workspace, ["linked/target.py"])

    def test_dispatch_task_contract_is_bounded(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            task_file = Path(temporary) / "task.json"
            task_file.write_text(json.dumps({
                "task": "Locate the current version files", "reasoning_signals": ["local_scope"],
            }), encoding="utf-8")
            self.assertEqual(external._read_task(task_file)["task"], "Locate the current version files")
            task_file.write_text(json.dumps({"task": "x", "model": "gpt-6-astra"}), encoding="utf-8")
            with self.assertRaisesRegex(external.EvidenceError, "Repo-scout task"):
                external._read_task(task_file)

            executor_task = {
                "task_id": "metadata-path", "task_intent": "execute",
                "reasoning_signals": ["local_scope"], "task": "Update one file",
                "allowed_paths": [], "acceptance_criteria": ["File updated"], "verification": [],
            }
            for target in (".GIT/config", ".CODEX/config.toml"):
                with self.subTest(target=target):
                    executor_task["allowed_paths"] = [target]
                    task_file.write_text(json.dumps(executor_task), encoding="utf-8")
                    with self.assertRaisesRegex(external.EvidenceError, "metadata"):
                        external._read_task(task_file, "executor")

    def test_planner_task_and_output_require_existing_contract_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            task_file = Path(temporary) / "task.json"
            spec = {
                "goal": "Document the release", "scope": {"in": [], "out": []},
                "constraints": [], "acceptance_criteria": [], "assumptions": [],
            }
            task_file.write_text(json.dumps({
                "task_intent": "design", "reasoning_signals": ["fully_specified"],
                "problem_spec": spec,
            }), encoding="utf-8")
            self.assertEqual(external._read_task(task_file, "planner")["problem_spec"], spec)
            task_file.write_text(json.dumps({
                "task_intent": "inspect", "reasoning_signals": [], "problem_spec": spec,
            }), encoding="utf-8")
            with self.assertRaisesRegex(external.EvidenceError, "design intent"):
                external._read_task(task_file, "planner")

            outline = {"milestones": ["Draft"], "dependencies": {"Publish": ["Draft"]},
                       "deliverables": ["Release notes"]}
            events = [
                {"type": "thread.started", "thread_id": THREAD},
                {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(outline)}},
                {"type": "turn.completed", "usage": {}},
            ]
            raw = "\n".join(json.dumps(event) for event in events).encode()
            self.assertEqual(external._parse_events(raw, "planner")[2], outline)

    def test_flow_planning_leaves_keep_source_authority_and_bounded_tasks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            task_file = workspace / "task.json"
            problem_spec = {
                "protocol_version": "1.1", "goal": "Add a bounded option",
                "scope": {"in": ["One script"], "out": []}, "constraints": [],
                "acceptance_criteria": [{"id": "ac-option", "statement": "Option works", "source": "explicit_user"}],
                "assumptions": [],
            }
            task_file.write_text(json.dumps({
                "task_intent": "design", "reasoning_signals": ["local_scope"],
                "request": "Add one bounded option",
            }), encoding="utf-8")
            self.assertEqual(external._read_task(task_file, "specifier")["request"], "Add one bounded option")
            task_file.write_text(json.dumps({
                "task_intent": "design", "reasoning_signals": ["local_scope"],
                "problem_spec": problem_spec, "flow_constraints": ["At most five tasks"],
            }), encoding="utf-8")
            self.assertEqual(external._read_task(task_file, "flow-splitter")["problem_spec"], problem_spec)
            invalid_spec = {**problem_spec, "acceptance_criteria": [
                {"id": "ac-option", "statement": "Option works", "source": "existing_contract"},
            ]}
            task_file.write_text(json.dumps({
                "task_intent": "design", "reasoning_signals": ["local_scope"],
                "problem_spec": invalid_spec, "flow_constraints": [],
            }), encoding="utf-8")
            with self.assertRaisesRegex(external.EvidenceError, "source-aware ProblemSpec"):
                external._read_task(task_file, "flow-splitter")
            task_file.write_text(json.dumps({
                "task_intent": "design", "reasoning_signals": ["local_scope"],
                "problem_spec": problem_spec, "flow_constraints": ["At most five tasks"],
            }), encoding="utf-8")

            def events(result: dict) -> bytes:
                return "\n".join(json.dumps(event) for event in (
                    {"type": "thread.started", "thread_id": THREAD},
                    {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(result)}},
                    {"type": "turn.completed", "usage": {}},
                )).encode()

            self.assertEqual(external._parse_events(events(problem_spec), "specifier")[2], problem_spec)
            unsourced = {**problem_spec, "acceptance_criteria": [
                {"id": "ac-option", "statement": "Option works", "source": "existing_contract"},
            ]}
            with self.assertRaisesRegex(external.EvidenceError, "specifier result shape"):
                external._parse_events(events(unsourced), "specifier")

            task_list = {"protocol_version": "1.0", "tasks": [
                {"id": "f1", "assigned_agent": "executor", "trace_ids": ["ac-option"]},
            ]}
            self.assertEqual(external._parse_events(events(task_list), "flow-splitter")[2], task_list)
            strong = {"protocol_version": "1.0", "tasks": [
                {"id": "f1", "assigned_agent": "executor-strong", "trace_ids": ["ac-option"]},
            ]}
            with self.assertRaisesRegex(external.EvidenceError, "flow-splitter result shape"):
                external._parse_events(events(strong), "flow-splitter")
            with self.assertRaisesRegex(external.EvidenceError, "flow-splitter result shape"):
                external._parse_events(events({"tasks": task_list["tasks"] * 6}), "flow-splitter")

            role_file = workspace / "role.toml"
            role_file.write_text('developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8")
            resolution = {
                "workspace": str(workspace), "role_config": str(role_file),
                "requested_model": "gpt-6-sol", "requested_effort": "medium",
                "dispatch_supported": True,
                "role_instructions_sha256": external.hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
            }
            evidence = {"verification_status": "matched", "observed_model": "gpt-6-sol",
                        "observed_effort": "medium", "checks": {"model": True}}
            with mock.patch.object(external, "resolve_role", return_value=resolution), \
                 mock.patch.object(external, "_limited_process", return_value=(0, events(task_list), b"")) as run, \
                 mock.patch.object(external, "_find_trace", return_value=workspace / "trace.jsonl"), \
                 mock.patch.object(external, "inspect_exec", return_value=evidence), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"):
                result = external.dispatch_role(workspace, "flow-splitter", task_file, 30, workspace)
            self.assertEqual(result["status"], "verified")
            self.assertIn("read-only", run.call_args.args[0])
            self.assertNotIn("--output-schema", run.call_args.args[0])
            self.assertIn("Do not select executor-strong", run.call_args.args[1])

    def test_read_only_doc_writer_requires_named_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            task_file = Path(temporary) / "task.json"
            task_file.write_text(json.dumps({
                "task_id": "f1", "task_intent": "design", "reasoning_signals": ["multi_step"],
                "task": "Write one bounded plan", "primary_output": "plan",
                "acceptance_criteria": ["Plan states the verified steps"],
            }), encoding="utf-8")
            self.assertEqual(external._read_task(task_file, "doc-writer")["task_id"], "f1")
            result = {
                "task_id": "f1", "status": "done", "changes": [], "evidence": [],
                "operational_retries_used": 0, "repair_attempts_used": 0,
                "last_failure_signature": "", "notes": "", "followups": [],
            }

            def events(message: str) -> bytes:
                return "\n".join(json.dumps(event) for event in (
                    {"type": "thread.started", "thread_id": THREAD},
                    {"type": "item.completed", "item": {"type": "agent_message", "text": message}},
                    {"type": "turn.completed", "usage": {}},
                )).encode()

            artifact = "=== ARTIFACT: f1-plan.md ===\n# Plan\nOne step.\n=== END ARTIFACT ==="
            parsed = external._parse_events(events(json.dumps(result) + "\n" + artifact), "doc-writer")[2]
            self.assertEqual(parsed["artifact"], {"filename": "f1-plan.md", "content": "# Plan\nOne step."})
            with self.assertRaisesRegex(external.EvidenceError, "doc-writer result shape"):
                external._parse_events(events(json.dumps(result)), "doc-writer")
            with self.assertRaisesRegex(external.EvidenceError, "doc-writer result shape"):
                external._parse_events(events(json.dumps(result) + "\n" + artifact.replace("f1-plan", "other-plan")), "doc-writer")
            with self.assertRaisesRegex(external.EvidenceError, "doc-writer result shape"):
                external._parse_events(events(json.dumps(result) + "\n" + artifact.replace("f1-plan", "plan-f1")), "doc-writer")

            workspace = Path(temporary)
            role_file = workspace / "role.toml"
            role_file.write_text('developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8")
            resolution = {
                "workspace": str(workspace), "role_config": str(role_file),
                "requested_model": "gpt-6-sol", "requested_effort": "high",
                "dispatch_supported": True,
                "role_instructions_sha256": external.hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
            }
            evidence = {"verification_status": "matched", "observed_model": "gpt-6-sol",
                        "observed_effort": "high", "checks": {"model": True}}
            with mock.patch.object(external, "resolve_role", return_value=resolution), \
                 mock.patch.object(external, "_limited_process", return_value=(0, events(json.dumps(result) + "\n" + artifact), b"")) as run, \
                 mock.patch.object(external, "_find_trace", return_value=workspace / "trace.jsonl"), \
                 mock.patch.object(external, "inspect_exec", return_value=evidence), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"):
                dispatched = external.dispatch_role(workspace, "doc-writer", task_file, 30, workspace)
            self.assertEqual(dispatched["status"], "verified")
            self.assertEqual(dispatched["result"]["artifact"]["filename"], "f1-plan.md")
            self.assertIn("read-only", run.call_args.args[0])
            self.assertNotIn("--output-schema", run.call_args.args[0])
            self.assertIn("filename must be <task_id>-<short-name>.md", run.call_args.args[1])

    def test_event_parser_requires_one_completed_turn_and_role_shape(self) -> None:
        output = {field: [] for field in external.REPO_SCOUT_FIELDS}
        records = [
            {"type": "thread.started", "thread_id": THREAD},
            {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(output)}},
            {"type": "turn.completed", "usage": {"input_tokens": 10}},
        ]
        raw = "\n".join(json.dumps(record) for record in records).encode()
        thread, usage, result = external._parse_events(raw)
        self.assertEqual(thread, THREAD)
        self.assertEqual(usage["input_tokens"], 10)
        self.assertEqual(result, output)
        records.append({"type": "turn.completed"})
        with self.assertRaisesRegex(external.EvidenceError, "one completed turn"):
            external._parse_events("\n".join(json.dumps(record) for record in records).encode())

    def test_dispatch_derives_model_and_effort_without_task_override(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            task_file = home / "task.json"
            task_file.write_text(json.dumps({
                "task": "Find VERSION", "reasoning_signals": ["fully_specified", "local_scope"],
            }), encoding="utf-8")
            role_file = home / "repo-scout.toml"
            role_file.write_text('developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8")
            resolution = {
                "workspace": str(home), "role_config": str(role_file),
                "requested_model": "gpt-6-luna", "requested_effort": "high",
                "dispatch_supported": True,
                "role_instructions_sha256": external.hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
            }
            output = {field: [] for field in external.REPO_SCOUT_FIELDS}
            events = [
                {"type": "thread.started", "thread_id": THREAD},
                {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(output)}},
                {"type": "turn.completed", "usage": {"input_tokens": 10}},
            ]
            raw = "\n".join(json.dumps(event) for event in events).encode()
            evidence = {"verification_status": "matched", "observed_model": "gpt-6-luna",
                        "observed_effort": "high", "checks": {"model": True}}
            with mock.patch.object(external, "resolve_role", return_value=resolution) as resolve, \
                 mock.patch.object(external, "_limited_process", return_value=(0, raw, b"")) as run, \
                 mock.patch.object(external, "_find_trace", return_value=home / "trace.jsonl"), \
                 mock.patch.object(external, "inspect_exec", return_value=evidence), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"):
                result = external.dispatch_role(home, "repo-scout", task_file, 30, home)
            self.assertEqual(result["status"], "verified")
            resolve.assert_called_once_with(home, "repo-scout", ["fully_specified", "local_scope"], "inspect", None)
            argv = run.call_args.args[0]
            self.assertEqual(argv[argv.index("-m") + 1], "gpt-6-luna")
            self.assertIn('model_reasoning_effort="high"', argv)
            self.assertIn("--ignore-user-config", argv)
            self.assertIn("agents.enabled=false", argv)
            self.assertIn("read-only", argv)

            planner_task = home / "planner-task.json"
            planner_task.write_text(json.dumps({
                "task_intent": "design", "reasoning_signals": ["fully_specified"],
                "problem_spec": {"goal": "Plan a change", "scope": {"in": [], "out": []},
                                 "constraints": [], "acceptance_criteria": [], "assumptions": []},
            }), encoding="utf-8")
            outline = {"milestones": [], "dependencies": {}, "deliverables": []}
            events[1]["item"]["text"] = json.dumps(outline)
            planner_raw = "\n".join(json.dumps(event) for event in events).encode()
            with mock.patch.object(external, "resolve_role", return_value=resolution), \
                 mock.patch.object(external, "_limited_process", return_value=(0, planner_raw, b"")) as planner_run, \
                 mock.patch.object(external, "_find_trace", return_value=home / "trace.jsonl"), \
                 mock.patch.object(external, "inspect_exec", return_value=evidence), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"):
                external.dispatch_role(home, "planner", planner_task, 30, home)
            self.assertNotIn("--output-schema", planner_run.call_args.args[0])
            self.assertIn("milestones and deliverables must be arrays of strings", planner_run.call_args.args[1])

    def test_reviewer_task_targets_and_result_invariants(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            (workspace / "target.py").write_text("x = 1\n", encoding="utf-8")
            task_file = workspace / "task.json"
            task = {
                "task_intent": "review", "review_kind": "ad_hoc",
                "reasoning_signals": ["local_scope"],
                "targets": ["target.py"], "criteria": ["Check correctness"],
            }
            task_file.write_text(json.dumps(task), encoding="utf-8")
            self.assertEqual(external._read_task(task_file, "reviewer"), task)
            external._verify_repo_paths(workspace, task["targets"])
            with self.assertRaisesRegex(external.EvidenceError, "traversal"):
                external._verify_repo_paths(workspace, ["../target.py"])
            with self.assertRaisesRegex(external.EvidenceError, "repo-relative"):
                external._verify_repo_paths(workspace, ["C:outside.txt"], allow_new=True)
            try:
                (workspace / "link.py").symlink_to(workspace / "target.py")
            except OSError:
                if os.name != "nt":
                    raise
            else:
                with self.assertRaisesRegex(external.EvidenceError, "links or reparse points"):
                    external._verify_repo_paths(workspace, ["link.py"])
            task["review_kind"] = "formal"
            task_file.write_text(json.dumps(task), encoding="utf-8")
            with self.assertRaisesRegex(external.EvidenceError, "ad_hoc"):
                external._read_task(task_file, "reviewer")

        def events(result: dict) -> bytes:
            return "\n".join(json.dumps(event) for event in (
                {"type": "thread.started", "thread_id": THREAD},
                {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(result)}},
                {"type": "turn.completed", "usage": {}},
            )).encode()

        passed = {"overall_status": "pass", "issues": [], "required_followups": [], "optional_notes": []}
        failed = {"overall_status": "fail", "issues": ["[logic][P2] target.py:1 — wrong value"],
                  "required_followups": ["[logic] Correct target.py:1"], "optional_notes": []}
        self.assertEqual(external._parse_events(events(passed), "reviewer")[2], passed)
        self.assertEqual(external._parse_events(events(failed), "reviewer")[2], failed)
        passed["required_followups"] = ["fix something"]
        with self.assertRaisesRegex(external.EvidenceError, "reviewer result shape"):
            external._parse_events(events(passed), "reviewer")

    def test_reviewer_dispatch_uses_ad_hoc_context_and_marks_result(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            (home / "target.py").write_text("x = 1\n", encoding="utf-8")
            task_file = home / "task.json"
            task_file.write_text(json.dumps({
                "task_intent": "review", "review_kind": "ad_hoc",
                "reasoning_signals": ["local_scope"], "targets": ["target.py"],
                "criteria": ["Check correctness"],
            }), encoding="utf-8")
            role_file = home / "reviewer.toml"
            role_file.write_text('developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8")
            resolution = {
                "workspace": str(home), "role_config": str(role_file),
                "requested_model": "gpt-6-astra", "requested_effort": "high",
                "dispatch_supported": True,
                "role_instructions_sha256": external.hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
            }
            output = {"overall_status": "pass", "issues": [], "required_followups": [], "optional_notes": []}
            raw = "\n".join(json.dumps(event) for event in (
                {"type": "thread.started", "thread_id": THREAD},
                {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(output)}},
                {"type": "turn.completed", "usage": {"input_tokens": 10}},
            )).encode()
            evidence = {"verification_status": "matched", "observed_model": "gpt-6-astra",
                        "observed_effort": "high", "checks": {"model": True}}
            with mock.patch.dict(os.environ, {"SystemRoot": "C:\\Windows", "TEMP": "C:\\Temp"}), \
                 mock.patch.object(external, "resolve_role", return_value=resolution) as resolve, \
                 mock.patch.object(external, "_limited_process", return_value=(0, raw, b"")) as run, \
                 mock.patch.object(external, "_find_trace", return_value=home / "trace.jsonl"), \
                 mock.patch.object(external, "inspect_exec", return_value=evidence), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"):
                result = external.dispatch_role(home, "reviewer", task_file, 30, home)
            resolve.assert_called_once_with(home, "reviewer", ["local_scope"], "review", "ad-hoc-review")
            self.assertIn("--output-schema", run.call_args.args[0])
            self.assertIn('model_reasoning_effort="high"', run.call_args.args[0])
            self.assertIn('"mode": "ad_hoc"', run.call_args.args[1])
            self.assertEqual(run.call_args.args[4]["SystemRoot"], "C:\\Windows")
            self.assertEqual(run.call_args.args[4]["TEMP"], "C:\\Temp")
            self.assertEqual(result["result"], output)
            self.assertEqual(result["review_kind"], "ad_hoc")
            self.assertFalse(result["formal_assurance"])

    def test_read_only_simple_helpers_validate_task_output_and_sandbox(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            (workspace / "target.py").write_text("x = 1\n", encoding="utf-8")
            role_file = workspace / "role.toml"
            role_file.write_text('developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8")
            resolution = {
                "workspace": str(workspace), "role_config": str(role_file),
                "requested_model": "gpt-6-luna", "requested_effort": "high",
                "dispatch_supported": True,
                "role_instructions_sha256": external.hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
            }
            evidence = {"verification_status": "matched", "observed_model": "gpt-6-luna",
                        "observed_effort": "high", "checks": {"model": True}}
            cases = (
                ("test-runner", {
                    "task_intent": "inspect", "reasoning_signals": ["local_scope"],
                    "checks": ["python3 -B -m unittest tests.test_example -q"],
                }, {
                    "related_tasks": [], "status": "pass", "commands_executed": ["python3 -B -m unittest tests.test_example -q"],
                    "evidence": ["one test passed"], "failures": [], "notes": "", "recommended_followups": [],
                }),
                ("debugger", {
                    "task_intent": "diagnose", "reasoning_signals": ["ambiguous_root_cause"],
                    "question": "Explain the observed failure", "evidence": ["test exits 1"],
                    "targets": ["target.py"],
                }, {
                    "status": "inconclusive", "observed_failure": "test exits 1", "evidence": [],
                    "established_causes": [], "hypotheses": ["unknown input"],
                    "relevant_locations": ["target.py"], "minimal_repair_recommendation": "",
                    "minimal_verification_recommendation": "Inspect input", "uncertainty": "Cause unknown", "notes": "",
                }),
            )
            for role, task, result_payload in cases:
                with self.subTest(role=role):
                    task_file = workspace / "task.json"
                    task_file.write_text(json.dumps(task), encoding="utf-8")
                    self.assertEqual(external._read_task(task_file, role), task)
                    raw = "\n".join(json.dumps(event) for event in (
                        {"type": "thread.started", "thread_id": THREAD},
                        {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(result_payload)}},
                        {"type": "turn.completed", "usage": {}},
                    )).encode()
                    with mock.patch.object(external, "resolve_role", return_value=resolution), \
                         mock.patch.object(external, "_limited_process", return_value=(0, raw, b"")) as run, \
                         mock.patch.object(external, "_find_trace", return_value=workspace / "trace.jsonl"), \
                         mock.patch.object(external, "inspect_exec", return_value=evidence), \
                         mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"):
                        result = external.dispatch_role(workspace, role, task_file, 30, workspace)
                    self.assertEqual(result["status"], "verified")
                    self.assertEqual(result["result"], result_payload)
                    self.assertIn("read-only", run.call_args.args[0])
                    self.assertIn("--output-schema", run.call_args.args[0])
                    self.assertNotIn("--allow-write", run.call_args.args[0])

            bad_debugger = {**cases[1][1], "targets": ["../outside.py"]}
            task_file.write_text(json.dumps(bad_debugger), encoding="utf-8")
            with mock.patch.object(external, "_limited_process") as run:
                with self.assertRaisesRegex(external.EvidenceError, "traversal"):
                    external.dispatch_role(workspace, "debugger", task_file, 30, workspace)
            run.assert_not_called()
            malformed = dict(cases[0][2])
            malformed.pop("notes")
            with self.assertRaises((external.EvidenceError, KeyError)):
                external._parse_events(raw.replace(json.dumps(cases[1][2]).encode(), json.dumps(malformed).encode()), "test-runner")
            contradictory = {**cases[0][2], "failures": ["the check failed"]}
            contradictory_raw = raw.replace(json.dumps(cases[1][2]).encode(), json.dumps(contradictory).encode())
            with self.assertRaisesRegex(external.EvidenceError, "test-runner result shape"):
                external._parse_events(contradictory_raw, "test-runner")

    def test_executor_requires_explicit_write_and_checks_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            (home / "target.py").write_text("x = 1\n", encoding="utf-8")
            task_file = home / "task.json"
            task = {
                "task_id": "atomic-1", "task_intent": "execute",
                "reasoning_signals": ["local_scope", "implementation_choice"],
                "task": "Update target.py", "allowed_paths": ["target.py"],
                "acceptance_criteria": ["Target is updated"], "verification": ["python3 -m py_compile target.py"],
            }
            task_file.write_text(json.dumps(task), encoding="utf-8")
            self.assertEqual(external._read_task(task_file, "executor"), task)
            external._verify_repo_paths(home, ["new.py"], allow_new=True)
            with mock.patch.object(external, "_clean_worktree_head") as preflight:
                with self.assertRaisesRegex(external.EvidenceError, "--allow-write"):
                    external.dispatch_role(home, "executor", task_file, 30, home)
            preflight.assert_not_called()

            role_file = home / "executor.toml"
            role_file.write_text('developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8")
            resolution = {
                "workspace": str(home), "role_config": str(role_file),
                "requested_model": "gpt-6-sol", "requested_effort": "medium",
                "dispatch_supported": True,
                "role_instructions_sha256": external.hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
            }
            output = {
                "task_id": "atomic-1", "status": "done", "changes": ["target.py updated"],
                "evidence": ["syntax check passed"], "operational_retries_used": 0,
                "repair_attempts_used": 0, "last_failure_signature": "", "notes": "", "followups": [],
            }
            raw = "\n".join(json.dumps(event) for event in (
                {"type": "thread.started", "thread_id": THREAD},
                {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(output)}},
                {"type": "turn.completed", "usage": {"input_tokens": 10}},
            )).encode()
            evidence = {"verification_status": "matched", "observed_model": "gpt-6-sol",
                        "observed_effort": "medium", "checks": {"sandbox_policy": True}}
            with mock.patch.object(external, "resolve_role", return_value=resolution) as resolve, \
                 mock.patch.object(external, "_clean_worktree_head", return_value="baseline"), \
                 mock.patch.object(external, "_limited_process", return_value=(0, raw, b"")) as run, \
                 mock.patch.object(external, "_changed_paths", return_value=["target.py"]) as changes, \
                 mock.patch.object(external, "_git_output", return_value=b"baseline\n"), \
                 mock.patch.object(external, "_find_trace", return_value=home / "trace.jsonl"), \
                 mock.patch.object(external, "inspect_exec", return_value=evidence), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"):
                result = external.dispatch_role(home, "executor", task_file, 30, home, allow_write=True)
            self.assertEqual(resolve.call_count, 2)
            self.assertEqual(resolve.call_args.args, (home, "executor", task["reasoning_signals"], "execute", None))
            changes.assert_called_once_with(home, "baseline")
            self.assertIn("workspace-write", run.call_args.args[0])
            self.assertIn("--output-schema", run.call_args.args[0])
            self.assertTrue(result["scope_compliant"])
            self.assertEqual(result["status"], "verified")

            with mock.patch.object(external, "resolve_role", return_value=resolution), \
                 mock.patch.object(external, "_clean_worktree_head", return_value="baseline"), \
                 mock.patch.object(external, "_limited_process", return_value=(0, raw, b"")), \
                 mock.patch.object(external, "_changed_paths", return_value=["outside.py"]), \
                 mock.patch.object(external, "_git_output", return_value=b"baseline\n"), \
                 mock.patch.object(external, "_find_trace", return_value=home / "trace.jsonl"), \
                 mock.patch.object(external, "inspect_exec", return_value=evidence), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"):
                result = external.dispatch_role(home, "executor", task_file, 30, home, allow_write=True)
            self.assertFalse(result["scope_compliant"])
            self.assertEqual(result["status"], "unverified")
            self.assertEqual(result["execution_started"], "yes")
            self.assertTrue(result["outcome_uncertain"])

            with mock.patch.object(external, "resolve_role", return_value=resolution), \
                 mock.patch.object(external, "_clean_worktree_head", return_value="baseline"), \
                 mock.patch.object(external, "_limited_process", return_value=(0, raw, b"")), \
                 mock.patch.object(external, "_changed_paths", return_value=["target.py"]), \
                 mock.patch.object(external, "_git_output", return_value=b"baseline\n"), \
                 mock.patch.object(external, "_find_trace", return_value=home / "trace.jsonl"), \
                 mock.patch.object(external, "inspect_exec", return_value={
                     **evidence, "verification_status": "mismatched",
                 }), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"):
                result = external.dispatch_role(home, "executor", task_file, 30, home, allow_write=True)
            self.assertEqual(result["status"], "unverified")
            self.assertEqual(result["execution_started"], "yes")
            self.assertTrue(result["outcome_uncertain"])

            changed_resolution = {**resolution, "requested_effort": "high"}
            with mock.patch.object(external, "resolve_role", side_effect=[resolution, changed_resolution]), \
                 mock.patch.object(external, "_clean_worktree_head", return_value="baseline"), \
                 mock.patch.object(external, "_limited_process", return_value=(0, raw, b"")), \
                 mock.patch.object(external, "_changed_paths", return_value=["target.py"]), \
                 mock.patch.object(external, "_git_output", return_value=b"baseline\n"), \
                 mock.patch.object(external, "_find_trace", return_value=home / "trace.jsonl"), \
                 mock.patch.object(external, "inspect_exec", return_value=evidence), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"):
                result = external.dispatch_role(home, "executor", task_file, 30, home, allow_write=True)
            self.assertFalse(result["profile_stable"])
            self.assertEqual(result["status"], "unverified")

    def test_git_scope_reports_both_sides_of_a_rename(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            subprocess.run(["git", "init", "-q", str(workspace)], check=True)
            (workspace / "old.py").write_text("x = 1\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(workspace), "add", "old.py"], check=True)
            subprocess.run([
                "git", "-C", str(workspace), "-c", "user.name=Test",
                "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline",
            ], check=True)
            head = external._clean_worktree_head(workspace)
            (workspace / "old.py").write_text("x = 2\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(workspace), "add", "old.py"], check=True)
            (workspace / "old.py").write_text("x = 1\n", encoding="utf-8")
            self.assertEqual(external._changed_paths(workspace, head), ["old.py"])
            subprocess.run(["git", "-C", str(workspace), "add", "old.py"], check=True)
            self.assertEqual(external._clean_worktree_head(workspace), head)
            (workspace / "old.py").rename(workspace / "new.py")
            subprocess.run(["git", "-C", str(workspace), "add", "-A"], check=True)
            self.assertEqual(external._changed_paths(workspace, head), ["new.py", "old.py"])
            with self.assertRaisesRegex(external.EvidenceError, "clean Git worktree"):
                external._clean_worktree_head(workspace)

    def test_executor_dirty_preflight_reports_no_launch_and_unknown_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workspace = root / "workspace"
            workspace.mkdir()
            subprocess.run(["git", "init", "-q", str(workspace)], check=True)
            target = workspace / "target.py"
            target.write_text("original\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(workspace), "add", "target.py"], check=True)
            subprocess.run([
                "git", "-C", str(workspace), "-c", "user.name=Test",
                "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline",
            ], check=True)
            target.write_text("existing change\n", encoding="utf-8")
            task_file = root / "task.json"
            task_file.write_text(json.dumps({
                "task_id": "atomic-1", "task_intent": "execute",
                "reasoning_signals": ["local_scope"], "task": "Update target.py",
                "allowed_paths": ["target.py"],
                "acceptance_criteria": ["Target is updated"], "verification": [],
            }), encoding="utf-8")
            output = io.StringIO()
            with mock.patch.object(external, "_limited_process") as run, redirect_stdout(output):
                code = external.main([
                    "dispatch-role", "--workspace", str(workspace), "--role", "executor",
                    "--task-file", str(task_file), "--allow-write",
                ])
            result = json.loads(output.getvalue())
            self.assertEqual(code, 2)
            self.assertEqual(result["status"], "error")
            self.assertEqual(result["phase"], "preflight")
            self.assertEqual(result["execution_started"], "no")
            self.assertTrue(result["outcome_uncertain"])
            self.assertIn("unknown provenance", result["error"])
            run.assert_not_called()

    def test_executor_partial_write_then_error_reports_started(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workspace = root / "workspace"
            workspace.mkdir()
            subprocess.run(["git", "init", "-q", str(workspace)], check=True)
            target = workspace / "target.py"
            target.write_text("original\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(workspace), "add", "target.py"], check=True)
            subprocess.run([
                "git", "-C", str(workspace), "-c", "user.name=Test",
                "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline",
            ], check=True)
            task_file = root / "task.json"
            task_file.write_text(json.dumps({
                "task_id": "atomic-1", "task_intent": "execute",
                "reasoning_signals": ["local_scope"], "task": "Update target.py",
                "allowed_paths": ["target.py"],
                "acceptance_criteria": ["Target is updated"], "verification": [],
            }), encoding="utf-8")
            role_file = root / "executor.toml"
            role_file.write_text('developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8")
            resolution = {
                "workspace": str(workspace), "role_config": str(role_file),
                "requested_model": "gpt-6-sol", "requested_effort": "high",
                "dispatch_supported": True,
                "role_instructions_sha256": external.hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
            }

            def partial_write(*_args: object, on_started: object) -> None:
                on_started()
                target.write_text("partial change\n", encoding="utf-8")
                raise external.EvidenceError("Codex execution timed out")

            output = io.StringIO()
            with mock.patch.object(external, "resolve_role", return_value=resolution), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"), \
                 mock.patch.object(external, "_limited_process", side_effect=partial_write), \
                 redirect_stdout(output):
                code = external.main([
                    "dispatch-role", "--workspace", str(workspace), "--role", "executor",
                    "--task-file", str(task_file), "--allow-write", "--codex-home", str(root),
                ])
            result = json.loads(output.getvalue())
            self.assertEqual(code, 2)
            self.assertEqual(result["status"], "error")
            self.assertEqual(result["phase"], "execution")
            self.assertEqual(result["execution_started"], "yes")
            self.assertTrue(result["outcome_uncertain"])
            self.assertEqual(target.read_text(encoding="utf-8"), "partial change\n")

    def test_opt_in_attempt_replay_and_single_writer(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workspace, task_file, resolution, raw = executor_fixture(root)
            started = threading.Event()
            release = threading.Event()
            launches: list[str] = []

            def run(_argv: object, prompt: str, *_args: object, on_started: object) -> tuple[int, bytes, bytes]:
                launches.append(prompt)
                on_started(12345)
                (workspace / "target.py").write_text("updated\n", encoding="utf-8")
                started.set()
                self.assertTrue(release.wait(5))
                return 0, raw, b""

            evidence = {"verification_status": "matched", "observed_model": "gpt-6-sol",
                        "observed_effort": "medium", "checks": {"attempt_id": True}}
            with mock.patch.object(external, "_attempt_state_root", return_value=root / "state" / "dispatch"), \
                 mock.patch.object(external, "resolve_role", return_value=resolution), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"), \
                 mock.patch.object(external, "_limited_process", side_effect=run), \
                 mock.patch.object(external, "_find_trace", return_value=root / "trace.jsonl"), \
                 mock.patch.object(external, "inspect_exec", return_value=evidence) as inspect:
                with ThreadPoolExecutor(max_workers=1) as pool:
                    first = pool.submit(external.dispatch_role, workspace, "executor", task_file, 30, root, True, ATTEMPT)
                    self.assertTrue(started.wait(5))
                    replay = external.dispatch_role(workspace, "executor", task_file, 30, root, True, ATTEMPT)
                    self.assertEqual(replay["status"], "started")
                    self.assertEqual(replay["process_id"], 12345)
                    with self.assertRaises(external.DispatchFailure) as conflict:
                        external.dispatch_role(workspace, "executor", task_file, 30, root, True, OTHER_ATTEMPT)
                    self.assertTrue(conflict.exception.conflicted)
                    self.assertTrue(conflict.exception.outcome_uncertain)
                    release.set()
                    result = first.result(timeout=5)
                self.assertEqual(result["status"], "verified")
                self.assertEqual(result["attempt_id"], ATTEMPT)
                self.assertEqual(inspect.call_args.args[-1], ATTEMPT)
                self.assertIn(f'"attempt_id": "{ATTEMPT}"', launches[0])
                self.assertEqual(
                    external.dispatch_role(workspace, "executor", task_file, 30, root, True, ATTEMPT),
                    {**result, "replayed": True},
                )
                self.assertEqual(len(launches), 1)

    def test_opt_in_uncertain_replay_never_relaunches(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workspace, task_file, resolution, _raw = executor_fixture(root)
            launches = []

            def partial(_argv: object, _prompt: str, *_args: object, on_started: object) -> None:
                launches.append(True)
                on_started(45678)
                (workspace / "target.py").write_text("partial\n", encoding="utf-8")
                raise external.EvidenceError("transport lost")

            with mock.patch.object(external, "_attempt_state_root", return_value=root / "state" / "dispatch"), \
                 mock.patch.object(external, "resolve_role", return_value=resolution), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"), \
                 mock.patch.object(external, "_limited_process", side_effect=partial):
                with self.assertRaises(external.DispatchFailure) as failed:
                    external.dispatch_role(workspace, "executor", task_file, 30, root, True, ATTEMPT)
                self.assertEqual(failed.exception.execution_started, "yes")
                replay = external.dispatch_role(workspace, "executor", task_file, 30, root, True, ATTEMPT)
                self.assertEqual(replay["status"], "uncertain")
                self.assertEqual(replay["process_id"], 45678)
                self.assertEqual(replay["error"], "transport lost")
                with self.assertRaises(external.DispatchFailure) as conflict:
                    external.dispatch_role(workspace, "executor", task_file, 30, root, True, OTHER_ATTEMPT)
                self.assertTrue(conflict.exception.conflicted)
                self.assertTrue(conflict.exception.outcome_uncertain)
                self.assertEqual(len(launches), 1)

    def test_started_receipt_write_failure_replays_as_started(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workspace, task_file, resolution, _raw = executor_fixture(root)
            original_record = external.ExecutorAttempt.record

            def fail_started(attempt: object, status: str, execution_started: str, **details: object) -> None:
                if status == "started":
                    raise OSError("receipt write failed")
                original_record(attempt, status, execution_started, **details)

            def launched(_argv: object, _prompt: str, *_args: object, on_started: object) -> None:
                on_started(45678)
                self.fail("The started callback unexpectedly returned")

            with mock.patch.object(external, "_attempt_state_root", return_value=root / "state" / "dispatch"), \
                 mock.patch.object(external, "resolve_role", return_value=resolution), \
                 mock.patch.object(external.shutil, "which", return_value="/usr/bin/codex"), \
                 mock.patch.object(external.ExecutorAttempt, "record", fail_started), \
                 mock.patch.object(external, "_limited_process", side_effect=launched):
                with self.assertRaises(external.DispatchFailure) as failed:
                    external.dispatch_role(workspace, "executor", task_file, 30, root, True, ATTEMPT)
                self.assertEqual(failed.exception.execution_started, "yes")
                replay = external.dispatch_role(workspace, "executor", task_file, 30, root, True, ATTEMPT)
                self.assertEqual(replay["status"], "uncertain")
                self.assertEqual(replay["execution_started"], "yes")
                self.assertEqual(replay["process_id"], 45678)

    def test_attempt_receipt_rejects_drift_corruption_and_worktree_reuse(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workspace, task_file, resolution, _raw = executor_fixture(root)
            binding = {
                "workspace": str(workspace),
                "git_common_dir": external._worktree_common_dir(workspace),
                "baseline_head": external._clean_worktree_head(workspace),
                "task_sha256": external.hashlib.sha256(task_file.read_bytes()).hexdigest(),
                "role": "executor", "model": resolution["requested_model"],
                "effort": resolution["requested_effort"],
                "role_instructions_sha256": resolution["role_instructions_sha256"],
            }
            with mock.patch.object(external, "_attempt_state_root", return_value=root / "state" / "dispatch"):
                attempt = external.ExecutorAttempt(workspace, ATTEMPT, binding)
                attempt.claim()
                self.assertEqual(attempt.replay()["status"], "claimed")
                with self.assertRaises(external.ResolutionConflict):
                    external.ExecutorAttempt(workspace, ATTEMPT, {**binding, "task_sha256": "changed"}).replay()
                with self.assertRaises(external.ResolutionConflict):
                    external.ExecutorAttempt(workspace, ATTEMPT, {**binding, "git_common_dir": "other"})
                attempt.receipt_path.write_text("{", encoding="utf-8")
                with self.assertRaises((external.EvidenceError, ValueError)):
                    attempt.replay()
                with mock.patch.object(external, "resolve_role", return_value=resolution), \
                     mock.patch.object(external, "_limited_process") as run:
                    with self.assertRaises(external.DispatchFailure) as corrupted:
                        external.dispatch_role(workspace, "executor", task_file, 30, root, True, ATTEMPT)
                self.assertTrue(corrupted.exception.outcome_uncertain)
                run.assert_not_called()
                attempt.receipt_path.write_text(json.dumps({
                    "attempt_id": ATTEMPT, "binding": binding,
                    "state": "verified", "result": {"status": "verified"},
                }), encoding="utf-8")
                with self.assertRaisesRegex(external.EvidenceError, "incomplete"):
                    attempt.replay()
                attempt.receipt_path.unlink()
                self.assertIsNone(attempt.replay())
                with self.assertRaises(external.ResolutionConflict):
                    attempt.claim()

    def test_attempt_trace_requires_one_matching_user_message(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            trace = home / "sessions" / f"rollout-{THREAD}.jsonl"
            trace.parent.mkdir()
            role = home / "executor.toml"
            role.write_text('developer_instructions = "# ROLE\\nRead only.\\n"\n', encoding="utf-8")
            resolution = {
                "role": "executor", "workspace": "/work/repo",
                "requested_model": "gpt-6-sol", "requested_effort": "medium",
                "role_config": str(role),
                "role_instructions_sha256": external.hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
            }
            records = [
                {"type": "session_meta", "payload": {"id": THREAD, "source": "exec", "cwd": "/work/repo", "model_provider": "openai"}},
                {"type": "event_msg", "payload": {"type": "task_started", "turn_id": "turn-1"}},
                {"type": "turn_context", "payload": {"turn_id": "turn-1", "cwd": "/work/repo", "model": "gpt-6-sol", "effort": "medium", "sandbox_policy": {"type": "workspace-write"}, "approval_policy": "never"}},
                {"type": "response_item", "payload": {"role": "developer", "content": [{"type": "input_text", "text": INSTRUCTIONS}], "internal_chat_message_metadata_passthrough": {"turn_id": "turn-1"}}},
                {"type": "response_item", "payload": {"role": "user", "content": [{"type": "input_text", "text": f'"attempt_id": "{ATTEMPT}"'}], "internal_chat_message_metadata_passthrough": {"turn_id": "turn-1"}}},
                {"type": "event_msg", "payload": {"type": "task_complete", "turn_id": "turn-1"}},
            ]
            trace.write_text("\n".join(map(json.dumps, records)) + "\n", encoding="utf-8")
            self.assertTrue(external.inspect_exec(trace, THREAD, resolution, home, ATTEMPT)["checks"]["attempt_id"])
            records[4]["payload"]["content"].append({"type": "input_text", "text": f'"attempt_id": "{ATTEMPT}"'})
            trace.write_text("\n".join(map(json.dumps, records)) + "\n", encoding="utf-8")
            self.assertFalse(external.inspect_exec(trace, THREAD, resolution, home, ATTEMPT)["checks"]["attempt_id"])
            records.pop(4)
            trace.write_text("\n".join(map(json.dumps, records)) + "\n", encoding="utf-8")
            self.assertFalse(external.inspect_exec(trace, THREAD, resolution, home, ATTEMPT)["checks"]["attempt_id"])

    def test_attempt_state_root_rejects_symlink_redirection(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            parent = root / "state"
            parent.mkdir(mode=0o700)
            outside = root / "outside"
            outside.mkdir()
            link = parent / "dispatch"
            try:
                link.symlink_to(outside, target_is_directory=True)
            except OSError:
                if os.name == "nt":
                    self.skipTest("Windows symlink creation is unavailable")
                raise
            workspace = root / "workspace"
            workspace.mkdir()
            with mock.patch.object(external, "_attempt_state_root", return_value=link):
                with self.assertRaisesRegex(external.EvidenceError, "plain directory"):
                    external._attempt_directory(workspace)

    def test_attempt_state_root_uses_os_account_not_process_home(self) -> None:
        expected = external._attempt_state_root()
        with tempfile.TemporaryDirectory() as temporary:
            other_home = Path(temporary) / "other-home"
            other_profile = Path(temporary) / "other-profile"
            other_home.mkdir()
            other_profile.mkdir()
            with mock.patch.dict(os.environ, {
                "HOME": str(other_home),
                "USERPROFILE": str(other_profile),
            }):
                self.assertEqual(external._attempt_state_root(), expected)

    def test_attempt_state_must_be_outside_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            state_root = workspace / ".agents-pipeline" / "external-dispatch"
            with mock.patch.object(external, "_attempt_state_root", return_value=state_root):
                with self.assertRaisesRegex(external.EvidenceError, "outside"):
                    external._attempt_directory(workspace)
            self.assertFalse(state_root.parent.exists())

    def test_killed_dispatcher_leaves_started_reservation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workspace, task_file, resolution, _raw = executor_fixture(root)
            binding = {
                "workspace": str(workspace),
                "git_common_dir": external._worktree_common_dir(workspace),
                "baseline_head": external._clean_worktree_head(workspace),
                "task_sha256": external.hashlib.sha256(task_file.read_bytes()).hexdigest(),
                "role": "executor", "model": resolution["requested_model"],
                "effort": resolution["requested_effort"],
                "role_instructions_sha256": resolution["role_instructions_sha256"],
            }
            state_root = root / "state" / "dispatch"
            marker = root / "started"
            script = "\n".join((
                "import importlib.util, json, os, sys, time",
                "from pathlib import Path",
                "spec = importlib.util.spec_from_file_location('external', sys.argv[1])",
                "module = importlib.util.module_from_spec(spec)",
                "spec.loader.exec_module(module)",
                "module._attempt_state_root = lambda: Path(sys.argv[2])",
                "attempt = module.ExecutorAttempt(Path(sys.argv[3]), sys.argv[4], json.loads(sys.argv[5]))",
                "attempt.claim()",
                "attempt.record('started', 'yes', process_id=os.getpid())",
                "Path(sys.argv[6]).write_text('started')",
                "time.sleep(30)",
            ))
            process = subprocess.Popen([
                sys.executable, "-c", script, str(TOOL), str(state_root),
                str(workspace), ATTEMPT, json.dumps(binding), str(marker),
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                while not marker.exists() and process.poll() is None and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertTrue(marker.exists(), process.stderr.read().decode() if process.poll() is not None else "no receipt")
                process.kill()
                process.communicate(timeout=5)
                with mock.patch.object(external, "_attempt_state_root", return_value=state_root):
                    attempt = external.ExecutorAttempt(workspace, ATTEMPT, binding)
                    self.assertEqual(attempt.replay()["status"], "started")
                    self.assertEqual(attempt.replay()["execution_started"], "yes")
                    with self.assertRaises(external.ResolutionConflict):
                        external.ExecutorAttempt(workspace, OTHER_ATTEMPT, binding).claim()
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate(timeout=5)

    def test_timeout_terminates_descendant_process(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            marker = Path(temporary) / "descendant-survived"
            started = []
            child = (
                "import pathlib,time; time.sleep(1.5); "
                f"pathlib.Path({str(marker)!r}).write_text('alive')"
            )
            parent = (
                "import subprocess,sys,time; "
                "subprocess.Popen([sys.executable,'-c',sys.argv[1]]); "
                "print('started',flush=True); time.sleep(10)"
            )
            with self.assertRaisesRegex(external.EvidenceError, "timed out"):
                external._limited_process(
                    [sys.executable, "-c", parent, child], "", Path(temporary), 1, os.environ.copy(),
                    on_started=lambda _pid: started.append(True),
                )
            self.assertEqual(started, [True])
            time.sleep(2)
            self.assertFalse(marker.exists())

    def test_start_callback_failure_terminates_descendant_process(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            started = root / "parent-started"
            survived = root / "descendant-survived"
            child = (
                "import pathlib,time; time.sleep(1.5); "
                f"pathlib.Path({str(survived)!r}).write_text('alive')"
            )
            parent = (
                "import pathlib,subprocess,sys,time; "
                "subprocess.Popen([sys.executable,'-c',sys.argv[1]]); "
                "pathlib.Path(sys.argv[2]).write_text('started'); time.sleep(10)"
            )

            def fail_after_start(_pid: int) -> None:
                deadline = time.monotonic() + 3
                while not started.exists() and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertTrue(started.exists())
                raise external.EvidenceError("receipt write failed")

            with self.assertRaisesRegex(external.EvidenceError, "receipt write failed"):
                external._limited_process(
                    [sys.executable, "-c", parent, child, str(started)], "", root, 10,
                    os.environ.copy(), on_started=fail_after_start,
                )
            time.sleep(2)
            self.assertFalse(survived.exists())


if __name__ == "__main__":
    unittest.main()
