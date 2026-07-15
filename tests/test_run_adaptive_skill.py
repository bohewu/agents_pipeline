from __future__ import annotations

import json
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SKILL = REPO_ROOT / "skills" / "run-adaptive" / "SKILL.md"
FLOW = REPO_ROOT / "agents" / "orchestrator-flow.md"
SIMPLE = REPO_ROOT / "agents" / "orchestrator-simple.md"
HANDOFF = REPO_ROOT / "agents" / "handoff-writer.md"
PIPELINE = REPO_ROOT / "agents" / "orchestrator-pipeline.md"
REVIEWER = REPO_ROOT / "agents" / "reviewer.md"
EXECUTOR = REPO_ROOT / "agents" / "executor.md"
SPLITTER = REPO_ROOT / "agents" / "flow-splitter.md"
FLOW_WORKERS = ("executor", "peon", "generalist", "doc-writer")
DIRECT_RUN_SKILLS = ("run-simple", "run-flow", "run-pipeline")


class RunAdaptiveSkillContractTest(unittest.TestCase):
    def test_adaptive_is_skill_only_and_routes_to_existing_workflows(self) -> None:
        text = SKILL.read_text(encoding="utf-8")
        modes = json.loads((REPO_ROOT / "modes.json").read_text(encoding="utf-8"))

        self.assertIn("name: run-adaptive", text)
        self.assertIn("--route=auto|simple|flow|pipeline", text)
        self.assertIn(
            "--preset=balanced|autonomous|careful|delivery|interactive", text
        )
        self.assertIn("require only the selected workflow's installed definition", text)
        self.assertIn("If `main_task_prompt` is empty", text)
        self.assertIn("do not emit or adopt an empty workflow prompt", text)
        for target in ("simple", "flow", "pipeline"):
            self.assertIn(f"orchestrator-{target}.toml", text)
        self.assertFalse((REPO_ROOT / "agents" / "orchestrator-adaptive.md").exists())
        self.assertNotIn(
            "adaptive",
            {entry["name"] for entry in modes["modes"]},
        )

    def test_prompt_mode_is_terminal_and_side_effect_free(self) -> None:
        text = SKILL.read_text(encoding="utf-8")

        self.assertIn("--prompt=off|on", text)
        self.assertIn("Do not modify files or git state", text)
        self.assertIn("Do not dispatch subagents", text)
        self.assertIn("Do not create checkpoints, status files", text)
        self.assertIn("Remove `--prompt=*`", text)
        self.assertIn("concrete `--route=<selected>`", text)
        self.assertIn("preserved `--preset=<preset>`", text)
        self.assertIn("Next prompt: not emitted", text)
        self.assertIn("profile problems are warnings", text)

    def test_reasoning_policy_is_route_independent_and_adaptive_by_default(self) -> None:
        adaptive = SKILL.read_text(encoding="utf-8")
        simple = SIMPLE.read_text(encoding="utf-8")
        flow = FLOW.read_text(encoding="utf-8")
        pipeline = PIPELINE.read_text(encoding="utf-8")
        protocol = (REPO_ROOT / "protocols" / "REASONING_POLICY.md").read_text(
            encoding="utf-8"
        )
        policy = json.loads(
            (REPO_ROOT / "protocols" / "reasoning-policy.json").read_text(
                encoding="utf-8"
            )
        )
        checkpoint = json.loads(
            (REPO_ROOT / "protocols" / "schemas" / "checkpoint.schema.json").read_text(
                encoding="utf-8"
            )
        )

        for text in (adaptive, simple, flow, pipeline):
            self.assertIn("--reasoning=inherit|shadow|adaptive", text)
            self.assertIn("adaptive", text)
            self.assertIn("inherit", text)
        self.assertIn("task_intent", protocol)
        self.assertIn("almost no substantive decision", protocol)
        self.assertIn("formal accept/reject process semantic", protocol)
        self.assertIn("selector capability", protocol)
        self.assertIn("never routes a raw model", protocol)
        self.assertEqual(policy["default_mode"], "adaptive")
        reasoning_mode = checkpoint["properties"]["flags"]["properties"][
            "reasoning_mode"
        ]
        self.assertEqual(reasoning_mode["default"], "adaptive")
        reasoning_dependencies = checkpoint["properties"]["flags"]["dependencies"]
        self.assertEqual(
            set(reasoning_dependencies["reasoning_mode"]),
            {"reasoning_policy_version", "reasoning_ceiling"},
        )
        self.assertTrue((REPO_ROOT / "tools" / "reasoning-policy.js").is_file())

    def test_every_orchestrator_uses_shared_task_intent_resolution(self) -> None:
        orchestrators = sorted((REPO_ROOT / "agents").glob("orchestrator-*.md"))
        self.assertGreater(len(orchestrators), 0)
        for orchestrator in orchestrators:
            text = orchestrator.read_text(encoding="utf-8")
            with self.subTest(orchestrator=orchestrator.name):
                self.assertIn("task_intent", text)
                self.assertIn("reasoning-policy.js", text)
                self.assertIn("selected", text)

    def test_simple_and_flow_preserve_role_reasoning_compatibility(self) -> None:
        simple = SIMPLE.read_text(encoding="utf-8")
        flow = FLOW.read_text(encoding="utf-8")
        splitter = SPLITTER.read_text(encoding="utf-8")

        for text in (simple, flow):
            self.assertIn("`peon` is fixed-routine", text)
            self.assertIn("may receive only `routine`", text)
            self.assertIn("semantically compatible role", text)
        self.assertIn("highest applicable", splitter)
        self.assertIn("`reasoning_class` is `routine`", splitter)
        self.assertIn("Never lower `reasoning_class`", splitter)

    def test_resume_and_auto_promotion_are_bounded(self) -> None:
        text = SKILL.read_text(encoding="utf-8")

        self.assertIn("Do not reclassify a valid resumed run", text)
        self.assertIn("modification time", text)
        self.assertIn("behavioral bug fix", text)
        self.assertIn("changes or adds tests", text)
        self.assertIn("promote once from Simple", text)
        self.assertIn("once from Flow to Pipeline", text)
        self.assertIn("one\nworkflow's checkpoint as another's", text)
        self.assertIn("Ordinary operational errors", text)

    def test_presets_are_route_independent_and_simple_has_a_bounded_wrapper(self) -> None:
        adaptive = SKILL.read_text(encoding="utf-8")
        simple = SIMPLE.read_text(encoding="utf-8")
        checkpoint_schema = json.loads(
            (REPO_ROOT / "protocols" / "schemas" / "checkpoint.schema.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertIn("run-level policy, not route-selection filters", adaptive)
        self.assertIn("does not by\nitself raise the route", adaptive)
        self.assertIn("`delivery`", adaptive)
        self.assertIn("`kanban_mode = auto`", adaptive)
        self.assertIn("`commit_mode = after`", adaptive)
        self.assertIn("still selects Flow because of the task, not because of the preset", adaptive)
        self.assertIn("same preset on a typo may\nselect Simple", adaptive)
        self.assertIn("First\nnormalize one policy, then select a route", adaptive)
        self.assertIn("Track whether\neach effective value came from the preset", adaptive)
        self.assertIn("consume and drop the raw `--full-auto` token", adaptive)
        self.assertIn("prompt output emits only `--preset=autonomous`", adaptive)
        self.assertIn("On\n`--resume`, never perform this preset conversion", adaptive)
        self.assertIn("current\nindividual override of the locked persisted preset", adaptive)
        self.assertIn(
            "Explicit `--confirm` or `--verbose` clears preset-derived", adaptive
        )
        self.assertIn(
            "Explicit `--autopilot` or `--full-auto` clears preset-derived", adaptive
        )
        self.assertIn("# ADAPTIVE POLICY WRAPPER", simple)
        self.assertIn("dispatch at most one narrow same-scope repair", simple)
        self.assertIn("original worker or an existing executor", simple)
        self.assertIn("before its first wrapper/core dispatch", simple)
        self.assertIn("wrapper helpers are not Simple work items", simple)
        preset = checkpoint_schema["properties"]["flags"]["properties"]["preset_mode"]
        self.assertEqual(
            preset["enum"],
            ["balanced", "autonomous", "careful", "delivery", "interactive"],
        )

    def test_resume_locks_preset_and_prompt_pins_selected_run(self) -> None:
        text = SKILL.read_text(encoding="utf-8")
        readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("Preset is locked\nfor a resumable Flow/Pipeline run", text)
        self.assertIn("a different explicit preset is rejected", text)
        self.assertIn("A legacy checkpoint without", text)
        self.assertIn("`preset_mode` is treated as a locked `balanced` run", text)
        self.assertIn("persisted expanded effective flags as the baseline", text)
        self.assertIn("needs no persisted field-level provenance", text)
        self.assertIn("`checkpoint.json` and `status/run-status.json`", text)
        self.assertIn("candidate run directory must be real, contained", text)
        self.assertIn("non-symlink/non-junction/non-reparse directories", text)
        self.assertIn("Ignore malformed, missing, identity-mismatched", text)
        self.assertIn("exact selected run\ndirectory", text)
        self.assertIn("even if a newer compatible run appears", text)
        self.assertIn("Resume keeps that preset locked", readme)
        self.assertIn("A different preset requires a fresh run", readme)
        self.assertIn("On resume, `--full-auto` is always a current override", readme)

    def test_simple_ad_hoc_handoff_never_binds_to_an_old_run(self) -> None:
        adaptive = SKILL.read_text(encoding="utf-8")
        handoff = HANDOFF.read_text(encoding="utf-8")
        handoff_schema = json.loads(
            (REPO_ROOT / "protocols" / "schemas" / "handoff-pack.schema.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertIn("`handoff-writer` with `mode = ad_hoc`", adaptive)
        self.assertIn("defaults to `.pipeline-output/`", adaptive)
        self.assertIn("`<output_dir>/adaptive-simple-handoffs/<handoff_id>/`", adaptive)
        self.assertIn("adaptive-simple-<UTC YYYYMMDDTHHMMSSZ>", adaptive)
        self.assertIn("refuse an existing target instead of overwriting", adaptive)
        self.assertIn("Supported modes are `run` (default) and `ad_hoc`", handoff)
        self.assertIn("caller-supplied `handoff_id`", handoff)
        self.assertIn("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$", handoff)
        self.assertIn("Refuse when that handoff directory already exists", handoff)
        self.assertIn("handoff-pack.schema.json", handoff)
        self.assertIn(
            "Never discover, select, or bind to an existing persisted run", handoff
        )
        for field in handoff_schema["required"]:
            with self.subTest(field=field):
                self.assertIn(f"`{field}`", handoff)

    def test_flow_retry_layers_remain_distinct(self) -> None:
        flow = FLOW.read_text(encoding="utf-8")
        executor = EXECUTOR.read_text(encoding="utf-8")
        splitter = SPLITTER.read_text(encoding="utf-8")
        schema = json.loads(
            (REPO_ROOT / "protocols" / "schemas" / "flow-task-list.schema.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertIn("`operational_retry_limit = 2`", flow)
        self.assertIn("`flow_recovery_limit = 1`", flow)
        self.assertIn("one total recovery across the run", flow)
        self.assertIn("first implementation/content attempt does not consume", executor)
        self.assertIn("same normalized failure signature appears twice", executor)
        self.assertIn("localized low-risk bug fixes", splitter)
        repair = schema["properties"]["tasks"]["items"]["properties"]["repair_budget"]
        self.assertEqual(repair["minimum"], 0)
        self.assertEqual(repair["maximum"], 2)
        for worker_name in FLOW_WORKERS:
            worker = (REPO_ROOT / "agents" / f"{worker_name}.md").read_text(
                encoding="utf-8"
            )
            with self.subTest(worker=worker_name):
                self.assertIn('"operational_retries_used": 0', worker)
                self.assertIn('"repair_attempts_used": 0', worker)
                self.assertIn('"last_failure_signature": ""', worker)

    def test_review_max_is_reviewer_only_and_resume_safe(self) -> None:
        adaptive = SKILL.read_text(encoding="utf-8")
        simple = SIMPLE.read_text(encoding="utf-8")
        flow = FLOW.read_text(encoding="utf-8")
        pipeline = PIPELINE.read_text(encoding="utf-8")
        reviewer = REVIEWER.read_text(encoding="utf-8")
        checkpoint_schema = json.loads(
            (REPO_ROOT / "protocols" / "schemas" / "checkpoint.schema.json").read_text(
                encoding="utf-8"
            )
        )

        for text in (adaptive, simple, flow):
            self.assertIn("--review=off|on|max", text)
        self.assertIn("--review=on|max", pipeline)
        removed_spawn_key = "fork" + "_turns"
        for text in (adaptive, simple, flow, pipeline):
            self.assertIn("reasoning_effort = max", text)
            self.assertNotIn(removed_spawn_key, text)
            self.assertRegex(
                text,
                r"without passing a model|while omitting `model`|no dispatch passes a model",
            )
        self.assertIn("No non-review role receives this override", flow)
        self.assertIn("No executor, test runner, or other role receives this override", pipeline)
        self.assertIn("review_reasoning_effort = max", adaptive)
        self.assertIn("Preserve `--review=max`", adaptive)

        effort = checkpoint_schema["properties"]["flags"]["properties"][
            "review_reasoning_effort"
        ]
        self.assertEqual(effort["enum"], ["inherit", "max"])

        self.assertIn("Do not edit files, apply fixes, stage, commit", reviewer)
        self.assertIn("the actual files and diff are the PRIMARY source of truth", reviewer)
        self.assertIn("`overall_status = pass` requires `required_followups = []`", reviewer)
        self.assertIn("at least one actionable required followup", reviewer)

        for skill_name in DIRECT_RUN_SKILLS:
            direct_skill = (
                REPO_ROOT / "skills" / skill_name / "SKILL.md"
            ).read_text(encoding="utf-8")
            with self.subTest(direct_skill=skill_name):
                self.assertIn("--review=max", direct_skill)
                self.assertRegex(direct_skill, r"exact .*reviewer-only effort")
                self.assertIn("inherit conflicts", direct_skill)
                self.assertNotIn(removed_spawn_key, direct_skill)
                self.assertRegex(
                    direct_skill,
                    r"without passing a model|passing a model override|model routing",
                )
                self.assertIn("non-review role", direct_skill)


if __name__ == "__main__":
    unittest.main()
