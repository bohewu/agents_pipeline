"""Focused prose-contract regressions; these do not measure rendered UI quality."""
from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = "skills/frontend-aesthetic-director/"


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class UiSkillContractsTest(unittest.TestCase):
    def test_local_fix_does_not_require_concept_or_new_approval(self) -> None:
        text = read(FRONTEND + "SKILL.md")
        self.assertIn("They are not prerequisites for bounded implementation", text)
        self.assertIn("No reference, image generation, moodboard, or new approval round is mandatory for a local fix", text)
        self.assertIn("Reuse established decisions for a local fix", text)
        self.assertIn("not a new deliverable or gate", text)

    def test_reference_fidelity_requires_inspection_not_invention(self) -> None:
        text = read(FRONTEND + "SKILL.md")
        self.assertIn("Inspect the actual supplied reference", text)
        self.assertIn("An inaccessible reference is an explicit limitation", text)
        self.assertIn("A low-fi wireframe constrains structure", text)
        self.assertIn("demonstrated hierarchy, proportion, density, and fidelity defects", text)

    def test_visual_work_requires_viewed_fresh_render(self) -> None:
        text = read(FRONTEND + "SKILL.md")
        self.assertIn("capture and actually inspect the rendered screenshot", text)
        self.assertIn("A saved screenshot that was not viewed is not visual verification", text)
        self.assertIn("keep viewport, theme, locale, data, selected state, and zoom consistent", text)
        self.assertIn("Inspect the fresh screenshot after each material visual correction", text)
        self.assertIn("label visual quality/fidelity `unverified`", text)
        self.assertIn("do not reconstruct a missing before image as evidence", text)

    def test_scope_and_stop_remain_proportional(self) -> None:
        text = read(FRONTEND + "SKILL.md")
        self.assertIn("A desktop-only request does not create a new mobile design requirement", text)
        self.assertIn("does not remove an existing cross-device contract", text)
        self.assertIn("Do not chase a numerical score", text)
        self.assertIn("Stop only the server, browser, or background resources started for this task", text)

    def test_playbook_teaches_decisions_for_distinct_surfaces(self) -> None:
        text = read(FRONTEND + "references/layout-style-playbook.md")
        for phrase in ("Composition", "Density", "Typography", "Rhythm", "Surfaces", "Character",
                       "University administration / records", "Canvas editor", "Operational dashboard",
                       "Marketing / editorial", "optional local design heuristics",
                       "retain the established archetype and style"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)
        self.assertIn("scaling app chrome with the document", text)
        self.assertIn("Do not manufacture proof", text)

    def test_localized_control_typography_and_asset_boundaries(self) -> None:
        text = read(FRONTEND + "SKILL.md")
        checklist = read(FRONTEND + "references/polish-checklist.md")
        for phrase in ("CJK", "fallback font", "Preserve i18n keys", "control typography",
                       "Do not introduce paid kits", "Real controls and text remain native UI"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)
        self.assertIn("not a universal style blacklist", checklist)
        self.assertIn("44 by 44 is the enhanced AAA criterion, not a universal AA rule", checklist)
        self.assertIn("A screenshot alone does not establish accessibility conformance", checklist)

    def test_rubric_does_not_turn_missing_evidence_into_a_score(self) -> None:
        text = read(FRONTEND + "references/ui-quality-rubric.md")
        self.assertIn("Numeric scoring is optional and ordinal", text)
        self.assertIn("Do not average missing evidence into a total", text)
        self.assertIn("Keep four judgments separate", text)
        self.assertIn("even when no functional bug exists", text)
        self.assertIn("without image inspection, mark visual quality/fidelity `unverified`", text)

    def test_concept_and_copy_skills_keep_their_boundaries(self) -> None:
        concept = read("skills/ui-ux-workflow/SKILL.md")
        copy = read("skills/ui-communication-designer/SKILL.md")
        self.assertIn("Do not produce implementation-ready layouts", concept)
        self.assertIn("name the dominant region, reading order", concept)
        self.assertIn("not pixel layouts or new required sections", concept)
        self.assertIn("Do not require a moodboard", concept)
        self.assertIn("Do not automatically invoke another skill", copy)
        self.assertIn("Do not require a revised flow, wireframe, full review, rubric, or score", copy)
        self.assertIn("visual simplicity is not permission to remove meaning", copy)
        self.assertIn("claiming a rewrite has been visually verified", copy)

    def test_audit_adds_visual_evidence_without_repair_authority(self) -> None:
        text = read("skills/devtools-ux-audit/SKILL.md")
        self.assertIn("capture and actually inspect a screenshot", text)
        self.assertIn("not visual evidence", text)
        self.assertIn("do not grant product-repair authority", text)
        self.assertIn("otherwise report `not_evaluable`", text)
        self.assertIn("Do not repair the product or repeat an audit", text)

    def test_brief_is_optional_and_existing_references_remain_available(self) -> None:
        text = read(FRONTEND + "assets/design-brief-template.md")
        self.assertIn("Do not write or deliver it by default", text)
        self.assertIn("Reference actually inspected / unavailable", text)
        self.assertIn("Observed mismatch -> in-scope correction -> recheck", text)
        for name in ("layout-style-playbook.md", "polish-checklist.md", "ui-quality-rubric.md"):
            with self.subTest(reference=name):
                self.assertTrue((ROOT / FRONTEND / "references" / name).is_file())
        self.assertIn("inspect the actual rendered result", read(FRONTEND + "agents/openai.yaml"))


if __name__ == "__main__":
    unittest.main()
