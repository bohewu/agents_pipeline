from __future__ import annotations

import json
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


class UxGateContractTest(unittest.TestCase):
    def test_run_ux_supports_blind_one_shot_score_gates(self) -> None:
        orchestrator = (REPO_ROOT / "agents/orchestrator-ux.md").read_text(
            encoding="utf-8"
        )
        judge = (REPO_ROOT / "agents/ux-judge.md").read_text(encoding="utf-8")
        protocol = (REPO_ROOT / "protocols/UX_DEVTOOLS_WORKFLOW.md").read_text(
            encoding="utf-8"
        )

        self.assertIn("--audit-mode=blind|informed", orchestrator)
        self.assertIn("--gate=off|<integer 1..100>", orchestrator)
        self.assertIn("gate_status = not_evaluable", orchestrator)
        self.assertIn(
            "do not automatically dispatch implementation", orchestrator.lower()
        )
        for field in ("gate_threshold", "gate_status", "score_gap", "gate_reasons"):
            self.assertIn(f'"{field}"', judge)
        self.assertIn("source-only score cannot pass", protocol)
        self.assertIn("do not edit the product or rerun", protocol)

        for name in (
            "ux-novice",
            "ux-task-flow",
            "ux-copy-trust",
            "ux-visual-hierarchy",
        ):
            expert = (REPO_ROOT / "agents" / f"{name}.md").read_text(
                encoding="utf-8"
            )
            self.assertIn("`audit_mode = blind`", expert)
            self.assertIn("Do not inspect source", expert)

    def test_adaptive_terminal_gate_is_persisted_and_cannot_repair(self) -> None:
        adaptive = (REPO_ROOT / "skills/run-adaptive/SKILL.md").read_text(
            encoding="utf-8"
        )
        checkpoint = json.loads(
            (REPO_ROOT / "protocols/schemas/checkpoint.schema.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertIn("--ux-gate=off|<integer 1..100>", adaptive)
        self.assertIn("last requested\nquality todo", adaptive)
        self.assertIn("Stop after this one audit", adaptive)
        self.assertIn("Do not edit the product", adaptive)
        self.assertIn("not release certification", adaptive)

        gate = checkpoint["properties"]["flags"]["properties"][
            "ux_gate_threshold"
        ]
        self.assertEqual(gate["type"], ["integer", "null"])
        self.assertEqual((gate["minimum"], gate["maximum"]), (1, 100))
        self.assertIsNone(gate["default"])
        self.assertEqual(
            checkpoint["properties"]["flags"]["properties"]["audit_mode"][
                "enum"
            ],
            ["blind", "informed"],
        )
        self.assertEqual(
            checkpoint["properties"]["flags"]["properties"]["gate_threshold"][
                "type"
            ],
            ["integer", "null"],
        )


if __name__ == "__main__":
    unittest.main()
