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
                "reasoning_class": minimum_class,
                "reasoning_signals": [signal],
            }
            self.assertEqual(list(validator.iter_errors(accepted)), [], signal)
            accepted_effective = {
                "effective_class": minimum_class,
                "reasoning_signals": [signal],
            }
            self.assertEqual(
                list(validator.iter_errors(accepted_effective)), [], signal
            )
            minimum_index = class_order.index(minimum_class)
            if minimum_index > 0:
                rejected = {
                    "reasoning_class": class_order[minimum_index - 1],
                    "reasoning_signals": [signal],
                }
                self.assertNotEqual(list(validator.iter_errors(rejected)), [], signal)
                rejected_effective = {
                    "effective_class": class_order[minimum_index - 1],
                    "reasoning_signals": [signal],
                }
                self.assertNotEqual(
                    list(validator.iter_errors(rejected_effective)), [], signal
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

    def test_reasoning_policy_schema_rejects_weakened_version_1_floors(self) -> None:
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
        schema_version_policy["schema_version"] = "2.0"
        weakened.append(("schema version", schema_version_policy))

        policy_version_policy = json.loads(json.dumps(base_policy))
        policy_version_policy["policy_version"] = "2"
        weakened.append(("policy version", policy_version_policy))

        default_mode_policy = json.loads(json.dumps(base_policy))
        default_mode_policy["default_mode"] = "inherit"
        weakened.append(("default mode", default_mode_policy))

        inverted_role_policy = json.loads(json.dumps(base_policy))
        inverted_role_policy["default_role_policy"]["floor_class"] = "deep"
        inverted_role_policy["default_role_policy"]["target_class"] = "deliberative"
        weakened.append(("inverted adaptive role range", inverted_role_policy))

        for label, payload in weakened:
            self.assertNotEqual(list(validator.iter_errors(payload)), [], label)

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


if __name__ == "__main__":
    unittest.main()
