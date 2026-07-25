import importlib.util
import json
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts/validate-orchestrator-contracts.py"
SPEC = importlib.util.spec_from_file_location("validate_orchestrator_contracts", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ValidateOrchestratorContractsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / "agents").mkdir()
        (self.repo_root / "tools/status-runtime").mkdir(parents=True)
        (self.repo_root / "protocols/schemas").mkdir(parents=True)
        self.write(
            self.repo_root / "protocols/CAPABILITY_RECOVERY.md",
            """
            Reasoning-effort recovery is mandatory before model capability recovery
            does not use `explicit_effort`
            `no_higher_tier_available` is not a terminal blocker
            prior attempt's `effective_class`
            `deep` plus `max` attempt
            profile recovery ceiling
            """,
        )
        self.write(
            self.repo_root / "protocols/MATERIALITY_GATE.md",
            """
            Resume the same run
            Start a narrow continuation run
            Start a full fresh run
            Budget exhaustion alone never justifies
            Replayed `$run-*` text
            concrete strategy delta
            """,
        )
        self.write(
            self.repo_root / "AGENTS.md",
            """
            | Agent | Role | Mode | Notes |
            |------|------|------|-------|
            | orchestrator-general | General-purpose orchestration | primary | Fixture |
            """,
        )
        self.write(
            self.repo_root / "agents/orchestrator-general.md",
            """
            ---
            name: orchestrator-general
            description: General workflow.
            kind: primary
            ---
            """,
        )
        self.write_json(
            self.repo_root / "modes.json",
            {
                "version": 1,
                "modes": [
                    {
                        "name": "general",
                        "agent": "orchestrator-general",
                        "aliases": ["general", "run-general", "monetize", "run-monetize"],
                    }
                ],
            },
        )
        self.write(
            self.repo_root / "tools/status-runtime/constants.js",
            'const ORCHESTRATORS = ["orchestrator-general"];',
        )
        schema = {"properties": {"orchestrator": {"enum": ["orchestrator-general"]}}}
        self.write_json(self.repo_root / "protocols/schemas/run-status.schema.json", schema)
        self.write_json(self.repo_root / "protocols/schemas/checkpoint.schema.json", schema)
        workflow_contracts = (
            Path("fixtures/run-adaptive.md"),
            Path("fixtures/orchestrator-simple.md"),
            Path("fixtures/orchestrator-flow.md"),
            Path("fixtures/orchestrator-pipeline.md"),
        )
        (self.repo_root / "fixtures").mkdir()
        common = "--capability-recovery=off|shadow|auto\nprotocols/MATERIALITY_GATE.md\n"
        self.write(
            self.repo_root / workflow_contracts[0],
            common
            + """
            delivery` or `autonomous` preset defaults it to `auto`
            persisted effective mode remains
            automatic Goal continuation
            not a fresh invocation
            latest attempt's persisted reasoning
            narrow continuation run
            full fresh run
            Do not create a `run-goal`
            """,
        )
        self.write(
            self.repo_root / workflow_contracts[1],
            common
            + """
            Simple MUST NOT perform
            never invokes `resolve-recovery`
            reasoning-effort recovery
            `recovery_boost`
            do not encode this as `explicit_effort`
            prior attempt's `effective_class`
            rather than re-enter
            `$run-adaptive`
            """,
        )
        self.write(
            self.repo_root / workflow_contracts[2],
            common
            + "tools/capability-recovery.js\n"
            + "reasoning-effort recovery before model capability recovery\n"
            + "`prior_failure_type = reasoning_failure`\n"
            + "`recovery_boost = true`\n"
            + "`no_higher_tier_available`\n"
            + "attempt's persisted `reasoning.effective_class`\n"
            + "`deep` plus `max`\n"
            + "resolve-recovery\n"
            + "without the old\n"
            + "recovery boost\n"
            + "Missing selector, profile, or trace\n"
            + "Other runtime exports conflict\n",
        )
        self.write(
            self.repo_root / workflow_contracts[3],
            common
            + """
            tools/capability-recovery.js
            reasoning-effort recovery
            before model capability recovery
            `recovery_boost`
            `no_higher_tier_available`
            prior task attempt's persisted
            `reasoning.effective_class`
            `deep` plus `max`
            never the same attempt
            resolve-recovery
            no inherited recovery boost
            Reviewer models never uplift
            `optional_notes` are not remaining work
            `capability_recovery_used = true`
            `retry_opportunities_used = <persisted value + 1>`
            """,
        )
        self.patchers = [
            mock.patch.object(MODULE, "REPO_ROOT", self.repo_root),
            mock.patch.object(MODULE, "AGENTS_DIR", self.repo_root / "agents"),
            mock.patch.object(MODULE, "MODES_PATH", self.repo_root / "modes.json"),
            mock.patch.object(MODULE, "WORKFLOW_CONTRACTS", workflow_contracts),
        ]
        for patcher in self.patchers:
            patcher.start()

    def tearDown(self) -> None:
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.temp_dir.cleanup()

    @staticmethod
    def write(path: Path, content: str) -> None:
        path.write_text(textwrap.dedent(content).lstrip(), encoding="utf-8")

    @staticmethod
    def write_json(path: Path, content: object) -> None:
        path.write_text(json.dumps(content), encoding="utf-8")

    def test_main_passes_for_valid_projection(self) -> None:
        self.assertEqual(MODULE.main(), 0)

    def test_main_rejects_agent_missing_from_catalog(self) -> None:
        self.write(
            self.repo_root / "agents/tmp-validator-agent.md",
            """
            ---
            name: tmp-validator-agent
            description: Fixture.
            kind: subagent
            ---
            """,
        )
        with self.assertRaisesRegex(ValueError, "AGENTS.md full agent table"):
            MODULE.main()

    def test_main_rejects_runtime_specific_frontmatter(self) -> None:
        path = self.repo_root / "agents/orchestrator-general.md"
        path.write_text(path.read_text(encoding="utf-8").replace("kind: primary", "kind: primary\ntemperature: 0.2"), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "runtime-specific frontmatter"):
            MODULE.main()

    def test_main_rejects_duplicate_alias(self) -> None:
        document = json.loads((self.repo_root / "modes.json").read_text(encoding="utf-8"))
        document["modes"].append(
            {
                "name": "duplicate",
                "agent": "orchestrator-general",
                "aliases": ["duplicate", "run-duplicate", "general"],
            }
        )
        self.write_json(self.repo_root / "modes.json", document)
        with self.assertRaisesRegex(ValueError, "duplicate mode aliases"):
            MODULE.main()

    def test_main_rejects_host_reserved_goal_mode(self) -> None:
        document = json.loads((self.repo_root / "modes.json").read_text(encoding="utf-8"))
        document["modes"][0] = {
            "name": "goal",
            "agent": "orchestrator-general",
            "aliases": ["goal", "run-goal"],
        }
        self.write_json(self.repo_root / "modes.json", document)
        with self.assertRaisesRegex(ValueError, "reserved for host-runtime"):
            MODULE.main()

    def test_main_rejects_host_reserved_goal_alias_on_other_mode(self) -> None:
        document = json.loads((self.repo_root / "modes.json").read_text(encoding="utf-8"))
        document["modes"][0]["aliases"].extend(["goal", "run-goal"])
        self.write_json(self.repo_root / "modes.json", document)
        with self.assertRaisesRegex(ValueError, "host-runtime reserved aliases"):
            MODULE.main()


if __name__ == "__main__":
    unittest.main()
