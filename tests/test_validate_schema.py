import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = REPO_ROOT / "tools" / "validate-schema.py"


@unittest.skipUnless(importlib.util.find_spec("jsonschema"), "jsonschema is not installed")
class ValidateSchemaFormatTest(unittest.TestCase):
    def test_capability_recovery_policy_and_fixtures(self) -> None:
        cases = [
            (
                "capability-recovery-policy.schema.json",
                REPO_ROOT / "protocols" / "capability-recovery-policy.json",
                0,
            ),
            (
                "capability-recovery-decision.schema.json",
                REPO_ROOT
                / "protocols"
                / "examples"
                / "capability-recovery-decision.valid.json",
                0,
            ),
            (
                "capability-recovery-decision.schema.json",
                REPO_ROOT
                / "protocols"
                / "examples"
                / "capability-recovery-decision.invalid.json",
                1,
            ),
        ]
        for schema_name, payload, expected in cases:
            with self.subTest(payload=payload.name):
                result = subprocess.run(
                    [
                        sys.executable,
                        VALIDATOR.as_posix(),
                        "--schema",
                        (
                            REPO_ROOT / "protocols" / "schemas" / schema_name
                        ).as_posix(),
                        "--input",
                        payload.as_posix(),
                        "--require-jsonschema",
                    ],
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(
                    result.returncode,
                    expected,
                    result.stdout + result.stderr,
                )

    def test_require_jsonschema_enforces_date_time_format(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            schema = root / "schema.json"
            payload = root / "payload.json"
            schema.write_text(
                json.dumps(
                    {
                        "$schema": "https://json-schema.org/draft/2020-12/schema",
                        "type": "object",
                        "required": ["timestamp"],
                        "properties": {
                            "timestamp": {"type": "string", "format": "date-time"}
                        },
                    }
                ),
                encoding="utf-8",
            )
            payload.write_text(
                json.dumps({"timestamp": "January 1, 2026"}),
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    VALIDATOR.as_posix(),
                    "--schema",
                    schema.as_posix(),
                    "--input",
                    payload.as_posix(),
                    "--require-jsonschema",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 1)
            self.assertIn("not a 'date-time'", result.stderr)

    def test_require_jsonschema_resolves_repository_local_refs(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                VALIDATOR.as_posix(),
                "--schema",
                (
                    REPO_ROOT
                    / "protocols"
                    / "schemas"
                    / "reasoning-observation.schema.json"
                ).as_posix(),
                "--input",
                (
                    REPO_ROOT
                    / "protocols"
                    / "examples"
                    / "reasoning-observation.valid.json"
                ).as_posix(),
                "--require-jsonschema",
            ],
            text=True,
            capture_output=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("OK: schema validation passed", result.stdout)
        observation = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "examples"
                / "reasoning-observation.valid.json"
            ).read_text(encoding="utf-8")
        )
        self.assertNotIn("agent", observation)
        self.assertNotIn("reasons", observation["reasoning"])
        self.assertNotIn("conflict", observation["reasoning"])
        self.assertNotIn("conflict_reason", observation["reasoning"])

    def test_task_intent_schema_accepts_v2_metadata_and_rejects_unknown_intent(
        self,
    ) -> None:
        import jsonschema

        schema = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "schemas"
                / "reasoning-task-hints.schema.json"
            ).read_text(encoding="utf-8")
        )
        validator = jsonschema.Draft202012Validator(schema)
        valid = {
            "task_intent": "execute",
            "intent_baseline_class": "routine",
            "classification_source": "task_intent",
            "reasoning_class": "routine",
            "reasoning_signals": ["fully_specified"],
        }
        self.assertEqual(list(validator.iter_errors(valid)), [])
        legacy = {
            "task_intent": None,
            "intent_baseline_class": None,
            "classification_source": "legacy_explicit_class",
            "reasoning_class": "deliberative",
            "reasoning_signals": ["multi_file"],
        }
        self.assertEqual(list(validator.iter_errors(legacy)), [])

        invalid = json.loads(json.dumps(valid))
        invalid["task_intent"] = "research"
        self.assertNotEqual(list(validator.iter_errors(invalid)), [])

    def test_reasoning_observation_schema_rejects_content_bearing_fields(self) -> None:
        observation = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "examples"
                / "reasoning-observation.valid.json"
            ).read_text(encoding="utf-8")
        )
        with tempfile.TemporaryDirectory() as temp_dir_name:
            for field in (
                "prompt",
                "source_code",
                "diff",
                "file_path",
                "command_output",
                "secret",
                "repository_content",
            ):
                payload = json.loads(json.dumps(observation))
                payload["reasoning"][field] = "must not be recorded"
                payload_path = Path(temp_dir_name) / f"{field}.json"
                payload_path.write_text(json.dumps(payload), encoding="utf-8")
                result = subprocess.run(
                    [
                        sys.executable,
                        VALIDATOR.as_posix(),
                        "--schema",
                        (
                            REPO_ROOT
                            / "protocols"
                            / "schemas"
                            / "reasoning-observation.schema.json"
                        ).as_posix(),
                        "--input",
                        payload_path.as_posix(),
                        "--require-jsonschema",
                    ],
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 1, field)

    def test_reasoning_semantic_forgery_fixtures_are_invalid(self) -> None:
        cases = (
            (
                "codex-child-trace.schema.json",
                "codex-child-trace.causal-overclaim.invalid.json",
            ),
            (
                "codex-child-trace.schema.json",
                "codex-child-trace.known-efforts-null-comparison.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.deep-mini-minimum-forged.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.degraded-deep-relabeled.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.selector-unavailable-enforced.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.requested-assurance-downgraded.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.selector-conflict-effective.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.shadow-exact-mismatch.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.explicit-xhigh-downgraded.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.legacy-explicit-missing-request.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.legacy-target-underclass.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.formal-context-relabeled-conflict.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.recovery-conflict-under-effort.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.legacy-adaptive-null-class.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.custom-context.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.conflict-reason-mismatch.invalid.json",
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.underprovisioned-degraded.invalid.json",
            ),
            (
                "reasoning-observation.schema.json",
                "reasoning-observation.deep-standard-under-effort.invalid.json",
            ),
            (
                "reasoning-observation.schema.json",
                "reasoning-observation.pipeline-context-forged.invalid.json",
            ),
            (
                "reasoning-observation.schema.json",
                "reasoning-observation.selector-conflict-effective.invalid.json",
            ),
            (
                "reasoning-observation.schema.json",
                "reasoning-observation.legacy-adaptive-null-class.invalid.json",
            ),
            (
                "reasoning-observation.schema.json",
                "reasoning-observation.custom-context.invalid.json",
            ),
            (
                "reasoning-observation.schema.json",
                "reasoning-observation.underprovisioned-degraded.invalid.json",
            ),
            (
                "agent-status.schema.json",
                "agent-status.reasoning-degraded-forged.invalid.json",
            ),
            (
                "agent-status.schema.json",
                "agent-status.reasoning-role-mismatch.invalid.json",
            ),
            (
                "agent-status.schema.json",
                "agent-status.reasoning-selector-conflict-effective.invalid.json",
            ),
            (
                "agent-status.schema.json",
                "agent-status.reasoning-unlisted-role.invalid.json",
            ),
            (
                "agent-status.schema.json",
                "agent-status.reasoning-legacy-adaptive-null-class.invalid.json",
            ),
            (
                "agent-status.schema.json",
                "agent-status.reasoning-custom-context.invalid.json",
            ),
            (
                "agent-status.schema.json",
                "agent-status.reasoning-conflict-reason-mismatch.invalid.json",
            ),
            (
                "task-status.schema.json",
                "task-status.legacy-provenance-incomplete.invalid.json",
            ),
        )
        for schema_name, fixture_name in cases:
            result = subprocess.run(
                [
                    sys.executable,
                    VALIDATOR.as_posix(),
                    "--schema",
                    (REPO_ROOT / "protocols" / "schemas" / schema_name).as_posix(),
                    "--input",
                    (REPO_ROOT / "protocols" / "examples" / fixture_name).as_posix(),
                    "--require-jsonschema",
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 1, fixture_name)

    def test_reasoning_artifact_schemas_reject_class_below_signal_floor(self) -> None:
        cases = (
            ("task-list.schema.json", "task-list.trace.valid.json", "tasks"),
            ("flow-task-list.schema.json", "flow-task-list.valid.json", "tasks"),
            ("dispatch-plan.schema.json", "dispatch-plan.resource.valid.json", "batches"),
            (
                "task-status.schema.json",
                "status-layout.expanded.valid/tasks/task-doc-summary.json",
                None,
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            for schema_name, fixture_name, collection in cases:
                payload = json.loads(
                    (REPO_ROOT / "protocols" / "examples" / fixture_name).read_text(
                        encoding="utf-8"
                    )
                )
                target = payload[collection][0] if collection else payload
                target["reasoning_class"] = "routine"
                target["reasoning_signals"] = ["security_boundary"]
                payload_path = temp_dir / schema_name.replace(".schema", ".payload")
                payload_path.write_text(json.dumps(payload), encoding="utf-8")

                result = subprocess.run(
                    [
                        sys.executable,
                        VALIDATOR.as_posix(),
                        "--schema",
                        (REPO_ROOT / "protocols" / "schemas" / schema_name).as_posix(),
                        "--input",
                        payload_path.as_posix(),
                        "--require-jsonschema",
                    ],
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(
                    result.returncode,
                    1,
                    f"{schema_name} accepted routine + security_boundary",
                )

    def test_shared_reasoning_hint_schema_matches_every_policy_signal_floor(self) -> None:
        import jsonschema

        policy = json.loads(
            (REPO_ROOT / "protocols" / "reasoning-policy.json").read_text(
                encoding="utf-8"
            )
        )
        schema = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "schemas"
                / "reasoning-task-hints.schema.json"
            ).read_text(encoding="utf-8")
        )
        validator = jsonschema.Draft202012Validator(schema)
        class_order = policy["reasoning_classes"]

        for signal, minimum_class in policy["signal_minimum_classes"].items():
            accepted = {
                "task_intent": "execute",
                "intent_baseline_class": "routine",
                "classification_source": "task_intent",
                "reasoning_class": minimum_class,
                "reasoning_signals": [signal],
            }
            self.assertEqual(list(validator.iter_errors(accepted)), [], signal)
            accepted_effective = {
                "task_intent": "execute",
                "intent_baseline_class": "routine",
                "classification_source": "task_intent",
                "effective_class": minimum_class,
                "reasoning_signals": [signal],
            }
            self.assertEqual(
                list(validator.iter_errors(accepted_effective)), [], signal
            )
            minimum_index = class_order.index(minimum_class)
            if minimum_index > 0:
                rejected = {
                    "task_intent": "execute",
                    "intent_baseline_class": "routine",
                    "classification_source": "task_intent",
                    "reasoning_class": class_order[minimum_index - 1],
                    "reasoning_signals": [signal],
                }
                self.assertNotEqual(list(validator.iter_errors(rejected)), [], signal)
                rejected_effective = {
                    "task_intent": "execute",
                    "intent_baseline_class": "routine",
                    "classification_source": "task_intent",
                    "effective_class": class_order[minimum_index - 1],
                    "reasoning_signals": [signal],
                }
                self.assertNotEqual(
                    list(validator.iter_errors(rejected_effective)), [], signal
                )

    def test_legacy_cross_module_floor_is_preserved_across_reasoning_artifacts(
        self,
    ) -> None:
        cases = (
            (
                "task-list.schema.json",
                "task-list.trace.valid.json",
                "task-list.trace.valid.json",
                ("tasks", 0),
                ("reasoning_class",),
            ),
            (
                "flow-task-list.schema.json",
                "flow-task-list.valid.json",
                "flow-task-list.valid.json",
                ("tasks", 0),
                ("reasoning_class",),
            ),
            (
                "dispatch-plan.schema.json",
                "dispatch-plan.resource.valid.json",
                "dispatch-plan.resource.valid.json",
                ("batches", 0),
                ("reasoning_class",),
            ),
            (
                "task-status.schema.json",
                "status-layout.expanded.valid/tasks/task-doc-summary.json",
                "status-layout.expanded.valid/tasks/task-doc-summary.json",
                (),
                ("reasoning_class",),
            ),
            (
                "reasoning-decision.schema.json",
                "reasoning-decision.legacy.valid.json",
                "reasoning-decision.valid.json",
                (),
                ("requested_class", "effective_class"),
            ),
            (
                "reasoning-observation.schema.json",
                "reasoning-observation.legacy.valid.json",
                "reasoning-observation.valid.json",
                ("reasoning",),
                ("requested_class", "effective_class"),
            ),
        )

        def target_at(payload: dict, path: tuple) -> dict:
            target = payload
            for part in path:
                target = target[part]
            return target

        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            for schema_name, legacy_fixture, v2_fixture, path, class_fields in cases:
                legacy = json.loads(
                    (REPO_ROOT / "protocols" / "examples" / legacy_fixture).read_text(
                        encoding="utf-8"
                    )
                )
                legacy_target = target_at(legacy, path)
                for field in (
                    "task_intent",
                    "intent_baseline_class",
                    "classification_source",
                ):
                    legacy_target.pop(field, None)
                for field in class_fields:
                    legacy_target[field] = "deliberative"
                legacy_target["reasoning_signals"] = ["cross_module"]

                v2 = json.loads(
                    (REPO_ROOT / "protocols" / "examples" / v2_fixture).read_text(
                        encoding="utf-8"
                    )
                )
                v2_target = target_at(v2, path)
                for field in class_fields:
                    v2_target[field] = "deliberative"
                v2_target["reasoning_signals"] = ["cross_module"]

                schema_path = REPO_ROOT / "protocols" / "schemas" / schema_name
                for label, payload, expected_code in (
                    ("legacy", legacy, 0),
                    ("v2", v2, 1),
                ):
                    payload_path = temp_dir / f"{schema_name}.{label}.json"
                    payload_path.write_text(json.dumps(payload), encoding="utf-8")
                    result = subprocess.run(
                        [
                            sys.executable,
                            VALIDATOR.as_posix(),
                            "--schema",
                            schema_path.as_posix(),
                            "--input",
                            payload_path.as_posix(),
                            "--require-jsonschema",
                        ],
                        text=True,
                        capture_output=True,
                        check=False,
                    )
                    self.assertEqual(
                        result.returncode,
                        expected_code,
                        f"{schema_name} {label}: {result.stdout}{result.stderr}",
                    )

    def test_reasoning_decision_status_and_observation_reject_signal_underclass(
        self,
    ) -> None:
        decision = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "examples"
                / "reasoning-decision.valid.json"
            ).read_text(encoding="utf-8")
        )
        decision["effective_class"] = "routine"
        decision["reasoning_signals"] = ["formal_accept_reject"]

        observation = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "examples"
                / "reasoning-observation.valid.json"
            ).read_text(encoding="utf-8")
        )
        observation["reasoning"]["effective_class"] = "routine"
        observation["reasoning"]["reasoning_signals"] = [
            "formal_accept_reject"
        ]

        agent_status = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "examples"
                / "status-layout.expanded.valid"
                / "agents"
                / "agent-server-01.json"
            ).read_text(encoding="utf-8")
        )
        agent_status["reasoning"] = decision

        null_decision = json.loads(json.dumps(decision))
        null_decision["effective_class"] = None
        null_decision["reasoning_signals"] = ["cross_module"]
        null_observation = json.loads(json.dumps(observation))
        null_observation["reasoning"]["effective_class"] = None
        null_observation["reasoning"]["reasoning_signals"] = ["cross_module"]
        null_agent_status = json.loads(json.dumps(agent_status))
        null_agent_status["reasoning"] = null_decision

        cases = (
            ("underclass decision", "reasoning-decision.schema.json", decision),
            ("underclass observation", "reasoning-observation.schema.json", observation),
            ("underclass agent status", "agent-status.schema.json", agent_status),
            ("null adaptive decision", "reasoning-decision.schema.json", null_decision),
            ("null adaptive observation", "reasoning-observation.schema.json", null_observation),
            ("null adaptive agent status", "agent-status.schema.json", null_agent_status),
        )
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            for label, schema_name, payload in cases:
                payload_path = temp_dir / schema_name.replace(
                    ".schema.json", ".payload.json"
                )
                payload_path.write_text(json.dumps(payload), encoding="utf-8")
                result = subprocess.run(
                    [
                        sys.executable,
                        VALIDATOR.as_posix(),
                        "--schema",
                        (
                            REPO_ROOT / "protocols" / "schemas" / schema_name
                        ).as_posix(),
                        "--input",
                        payload_path.as_posix(),
                        "--require-jsonschema",
                    ],
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(
                    result.returncode,
                    1,
                    f"{schema_name} accepted {label}",
                )

    def test_reasoning_policy_schema_rejects_weakened_version_2_floors(self) -> None:
        import jsonschema

        base_policy = json.loads(
            (REPO_ROOT / "protocols" / "reasoning-policy.json").read_text(
                encoding="utf-8"
            )
        )
        schema = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "schemas"
                / "reasoning-policy.schema.json"
            ).read_text(encoding="utf-8")
        )
        validator = jsonschema.Draft202012Validator(schema)
        weakened = []
        class_order = base_policy["reasoning_classes"]
        effort_order = base_policy["effort_order"]
        model_order = base_policy["model_tier_order"]

        for signal, minimum_class in base_policy["signal_minimum_classes"].items():
            index = class_order.index(minimum_class)
            if index > 0:
                payload = json.loads(json.dumps(base_policy))
                payload["signal_minimum_classes"][signal] = class_order[index - 1]
                weakened.append((f"signal:{signal}", payload))

        for tier, floor in base_policy["model_floors"].items():
            index = effort_order.index(floor)
            if index > 0:
                payload = json.loads(json.dumps(base_policy))
                payload["model_floors"][tier] = effort_order[index - 1]
                weakened.append((f"model_floor:{tier}", payload))

        for reasoning_class, requirement in base_policy[
            "class_requirements"
        ].items():
            model_index = model_order.index(requirement["minimum_model_tier"])
            if model_index > 0:
                payload = json.loads(json.dumps(base_policy))
                payload["class_requirements"][reasoning_class][
                    "minimum_model_tier"
                ] = model_order[model_index - 1]
                weakened.append((f"model_requirement:{reasoning_class}", payload))

            for tier, projected in requirement["effort_by_model_tier"].items():
                actual = (
                    base_policy["highest_single_agent"]
                    if projected == "highest_single_agent"
                    else projected
                )
                effort_index = effort_order.index(actual)
                if effort_index > 0:
                    payload = json.loads(json.dumps(base_policy))
                    payload["class_requirements"][reasoning_class][
                        "effort_by_model_tier"
                    ][tier] = effort_order[effort_index - 1]
                    weakened.append(
                        (f"projection:{reasoning_class}:{tier}", payload)
                    )

        highest_policy = json.loads(json.dumps(base_policy))
        highest_policy["highest_single_agent"] = "xhigh"
        weakened.append(("highest_single_agent", highest_policy))

        formal_policy = json.loads(json.dumps(base_policy))
        formal_policy["dispatch_contexts"]["formal-assurance"] = {
            "mode": "fixed",
            "reasoning_class": "routine",
            "strict": False,
        }
        weakened.append(("formal assurance context", formal_policy))

        schema_version_policy = json.loads(json.dumps(base_policy))
        schema_version_policy["schema_version"] = "1.0"
        weakened.append(("schema version", schema_version_policy))

        policy_version_policy = json.loads(json.dumps(base_policy))
        policy_version_policy["policy_version"] = "1"
        weakened.append(("policy version", policy_version_policy))

        default_mode_policy = json.loads(json.dumps(base_policy))
        default_mode_policy["default_mode"] = "adaptive"
        weakened.append(("default mode", default_mode_policy))

        inverted_role_policy = json.loads(json.dumps(base_policy))
        inverted_role_policy["default_role_policy"]["floor_class"] = "deep"
        inverted_role_policy["default_role_policy"]["target_class"] = "deliberative"
        weakened.append(("inverted adaptive role range", inverted_role_policy))

        missing_role_policy = json.loads(json.dumps(base_policy))
        del missing_role_policy["role_policies"]["peon"]
        weakened.append(("missing managed role", missing_role_policy))

        fixed_role_policy = json.loads(json.dumps(base_policy))
        fixed_role_policy["role_policies"]["planner"]["reasoning_class"] = "deep"
        weakened.append(("weakened fixed role contract", fixed_role_policy))

        adaptive_role_policy = json.loads(json.dumps(base_policy))
        adaptive_role_policy["role_policies"]["reviewer"]["floor_class"] = "deliberative"
        weakened.append(("weakened adaptive role contract", adaptive_role_policy))

        security_role_policy = json.loads(json.dumps(base_policy))
        del security_role_policy["role_policies"]["committee-security"][
            "minimum_model_tier"
        ]
        weakened.append(("missing security role tier", security_role_policy))

        missing_context_policy = json.loads(json.dumps(base_policy))
        del missing_context_policy["dispatch_contexts"]["ad-hoc-review"]
        weakened.append(("missing dispatch context", missing_context_policy))

        ad_hoc_context_policy = json.loads(json.dumps(base_policy))
        ad_hoc_context_policy["dispatch_contexts"]["ad-hoc-review"][
            "floor_class"
        ] = "deliberative"
        weakened.append(("weakened ad-hoc review context", ad_hoc_context_policy))

        pipeline_context_policy = json.loads(json.dumps(base_policy))
        pipeline_context_policy["dispatch_contexts"]["pipeline-review"][
            "minimum_model_tier"
        ] = "standard"
        weakened.append(("weakened pipeline review context", pipeline_context_policy))

        default_strict_policy = json.loads(json.dumps(base_policy))
        default_strict_policy["default_role_policy"]["strict"] = True
        weakened.append(("changed default role snapshot", default_strict_policy))

        role_strict_policy = json.loads(json.dumps(base_policy))
        role_strict_policy["role_policies"]["peon"]["strict"] = True
        weakened.append(("changed managed role snapshot", role_strict_policy))

        role_tier_policy = json.loads(json.dumps(base_policy))
        role_tier_policy["role_policies"]["peon"][
            "minimum_model_tier"
        ] = "strong"
        weakened.append(("added managed role tier", role_tier_policy))

        extra_role_policy = json.loads(json.dumps(base_policy))
        extra_role_policy["role_policies"]["custom-worker"] = json.loads(
            json.dumps(base_policy["default_role_policy"])
        )
        weakened.append(("extra managed role", extra_role_policy))

        extra_context_policy = json.loads(json.dumps(base_policy))
        extra_context_policy["dispatch_contexts"]["custom-review"] = {
            "mode": "adaptive",
            "floor_class": "deep",
            "target_class": "deep",
            "ceiling_class": "assurance",
            "strict": False,
        }
        weakened.append(("extra dispatch context", extra_context_policy))

        extra_top_level_policy = json.loads(json.dumps(base_policy))
        extra_top_level_policy["private_extension"] = True
        weakened.append(("extra top-level key", extra_top_level_policy))

        extra_default_role_key = json.loads(json.dumps(base_policy))
        extra_default_role_key["default_role_policy"]["note"] = "private"
        weakened.append(("extra default role key", extra_default_role_key))

        extra_role_key = json.loads(json.dumps(base_policy))
        extra_role_key["role_policies"]["peon"]["note"] = "private"
        weakened.append(("extra managed role key", extra_role_key))

        extra_context_key = json.loads(json.dumps(base_policy))
        extra_context_key["dispatch_contexts"]["ad-hoc-review"][
            "note"
        ] = "private"
        weakened.append(("extra managed context key", extra_context_key))

        extra_compatibility_key = json.loads(json.dumps(base_policy))
        extra_compatibility_key["compatibility"]["note"] = "private"
        weakened.append(("extra compatibility key", extra_compatibility_key))

        extra_model_floor_key = json.loads(json.dumps(base_policy))
        extra_model_floor_key["model_floors"]["private"] = "max"
        weakened.append(("extra model floor key", extra_model_floor_key))

        extra_requirement_key = json.loads(json.dumps(base_policy))
        extra_requirement_key["class_requirements"]["deep"][
            "note"
        ] = "private"
        weakened.append(("extra class requirement key", extra_requirement_key))

        extra_projection_key = json.loads(json.dumps(base_policy))
        extra_projection_key["class_requirements"]["deep"][
            "effort_by_model_tier"
        ]["private"] = "max"
        weakened.append(("extra effort projection key", extra_projection_key))

        for signal in base_policy["signal_minimum_classes"]:
            if signal == "formal_accept_reject":
                continue
            assurance_signal_policy = json.loads(json.dumps(base_policy))
            assurance_signal_policy["signal_minimum_classes"][signal] = "assurance"
            weakened.append((f"non-formal assurance signal:{signal}", assurance_signal_policy))

        for label, payload in weakened:
            self.assertNotEqual(list(validator.iter_errors(payload)), [], label)

    def test_reasoning_policy_schema_accepts_only_deep_strengthening_for_non_formal_signals(
        self,
    ) -> None:
        import jsonschema

        base_policy = json.loads(
            (REPO_ROOT / "protocols" / "reasoning-policy.json").read_text(
                encoding="utf-8"
            )
        )
        schema = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "schemas"
                / "reasoning-policy.schema.json"
            ).read_text(encoding="utf-8")
        )
        validator = jsonschema.Draft202012Validator(schema)
        for signal in base_policy["signal_minimum_classes"]:
            policy = json.loads(json.dumps(base_policy))
            policy["signal_minimum_classes"][signal] = (
                "assurance" if signal == "formal_accept_reject" else "deep"
            )
            self.assertEqual(list(validator.iter_errors(policy)), [], signal)

    def test_schema_version_1_artifacts_retain_bounded_custom_contexts(self) -> None:
        decision = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "examples"
                / "reasoning-decision.legacy.valid.json"
            ).read_text(encoding="utf-8")
        )
        decision["dispatch_context"] = "legacy-review"
        observation = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "examples"
                / "reasoning-observation.legacy.valid.json"
            ).read_text(encoding="utf-8")
        )
        observation["reasoning"]["dispatch_context"] = "legacy-review"
        agent_status = {
            "protocol_version": "1.0",
            "run_id": "run-legacy-custom-context",
            "agent_id": "executor-01",
            "agent": "executor",
            "status": "done",
            "created_at": "2026-07-15T12:15:00.000Z",
            "updated_at": "2026-07-15T12:15:01.000Z",
            "reasoning": decision,
        }
        cases = (
            ("reasoning-decision.schema.json", decision),
            ("reasoning-observation.schema.json", observation),
            ("agent-status.schema.json", agent_status),
        )
        with tempfile.TemporaryDirectory() as temp_dir_name:
            for schema_name, payload in cases:
                payload_path = Path(temp_dir_name) / schema_name.replace(
                    ".schema", ".payload"
                )
                payload_path.write_text(json.dumps(payload), encoding="utf-8")
                result = subprocess.run(
                    [
                        sys.executable,
                        VALIDATOR.as_posix(),
                        "--schema",
                        (REPO_ROOT / "protocols" / "schemas" / schema_name).as_posix(),
                        "--input",
                        payload_path.as_posix(),
                        "--require-jsonschema",
                    ],
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(
                    result.returncode,
                    0,
                    f"{schema_name}: {result.stdout}{result.stderr}",
                )

    def test_checkpoint_rejects_partial_reasoning_policy_flags(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            payload = Path(temp_dir_name) / "checkpoint.json"
            payload.write_text(
                json.dumps(
                    {
                        "pipeline_id": "run-1",
                        "orchestrator": "orchestrator-flow",
                        "user_prompt": "fixture",
                        "flags": {"reasoning_mode": "adaptive"},
                        "current_stage": -1,
                        "completed_stages": [],
                        "stage_artifacts": {},
                        "created_at": "2026-07-14T00:00:00Z",
                        "updated_at": "2026-07-14T00:00:00Z",
                    }
                ),
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    sys.executable,
                    VALIDATOR.as_posix(),
                    "--schema",
                    (
                        REPO_ROOT / "protocols" / "schemas" / "checkpoint.schema.json"
                    ).as_posix(),
                    "--input",
                    payload.as_posix(),
                    "--require-jsonschema",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 1)
        self.assertIn("reasoning_policy_version", result.stderr)

    def test_checkpoint_rejects_unbounded_reasoning_policy_version(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            payload = Path(temp_dir_name) / "checkpoint.json"
            payload.write_text(
                json.dumps(
                    {
                        "pipeline_id": "run-1",
                        "orchestrator": "orchestrator-flow",
                        "user_prompt": "fixture",
                        "flags": {
                            "reasoning_mode": "adaptive",
                            "reasoning_policy_version": "private policy /tmp/workspace",
                            "reasoning_ceiling": "max",
                        },
                        "current_stage": -1,
                        "completed_stages": [],
                        "stage_artifacts": {},
                        "created_at": "2026-01-01T00:00:00Z",
                        "updated_at": "2026-01-01T00:00:00Z",
                    }
                ),
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    sys.executable,
                    VALIDATOR.as_posix(),
                    "--schema",
                    (
                        REPO_ROOT / "protocols" / "schemas" / "checkpoint.schema.json"
                    ).as_posix(),
                    "--input",
                    payload.as_posix(),
                    "--require-jsonschema",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 1)
        self.assertIn("reasoning_policy_version", result.stderr)

    def test_checkpoint_capability_recovery_mode_schema_contract(self) -> None:
        schema = json.loads(
            (
                REPO_ROOT / "protocols" / "schemas" / "checkpoint.schema.json"
            ).read_text(encoding="utf-8")
        )
        mode = schema["properties"]["flags"]["properties"][
            "capability_recovery_mode"
        ]

        self.assertEqual(mode["type"], "string")
        self.assertEqual(mode["enum"], ["off", "shadow", "auto"])
        self.assertEqual(mode["default"], "off")

    def test_task_status_capability_recovery_accounting_contract(self) -> None:
        schema = json.loads(
            (
                REPO_ROOT / "protocols" / "schemas" / "task-status.schema.json"
            ).read_text(encoding="utf-8")
        )
        properties = schema["properties"]

        self.assertEqual(
            properties["retry_opportunities_used"],
            {
                "type": "integer",
                "minimum": 0,
                "maximum": 5,
                "description": (
                    "Pipeline retry opportunities already charged to this task, "
                    "including a capability recovery spawn."
                ),
            },
        )
        self.assertEqual(
            properties["capability_recovery_used"]["type"],
            "boolean",
        )
        recovery_rule = schema["allOf"][1]
        self.assertEqual(
            recovery_rule["then"]["required"],
            ["retry_opportunities_used"],
        )
        self.assertEqual(
            recovery_rule["then"]["properties"]["retry_opportunities_used"][
                "minimum"
            ],
            1,
        )
        payload = json.loads(
            (
                REPO_ROOT
                / "protocols"
                / "examples"
                / "status-layout.expanded.valid"
                / "tasks"
                / "task-doc-summary.json"
            ).read_text(encoding="utf-8")
        )
        payload["retry_opportunities_used"] = 1
        payload["capability_recovery_used"] = True
        with tempfile.TemporaryDirectory() as temp_dir_name:
            payload_path = Path(temp_dir_name) / "task-status.json"
            payload_path.write_text(json.dumps(payload), encoding="utf-8")
            command = [
                sys.executable,
                VALIDATOR.as_posix(),
                "--schema",
                (
                    REPO_ROOT / "protocols" / "schemas" / "task-status.schema.json"
                ).as_posix(),
                "--input",
                payload_path.as_posix(),
                "--require-jsonschema",
            ]
            valid = subprocess.run(
                command,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(valid.returncode, 0, valid.stderr)

            del payload["retry_opportunities_used"]
            payload_path.write_text(json.dumps(payload), encoding="utf-8")
            invalid = subprocess.run(
                command,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(invalid.returncode, 1)


if __name__ == "__main__":
    unittest.main()
