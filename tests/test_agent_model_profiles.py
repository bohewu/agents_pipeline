import importlib.util
import json
import sys
import tempfile
import unittest
import warnings
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
RESOLVER_SCRIPT_PATH = REPO_ROOT / "scripts" / "agent_model_profiles.py"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


RESOLVER = load_module("agent_model_profiles", RESOLVER_SCRIPT_PATH)


def write_json(directory: Path, name: str, payload: dict) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{name}.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def profile_payload(
    models: dict, runtime: str = "neutral", recovery_ceiling_tiers: dict | None = None
) -> dict:
    payload = {
        "name": "test-profile",
        "runtime": runtime,
        "models": models,
    }
    if recovery_ceiling_tiers is not None:
        payload["recovery_ceiling_tiers"] = recovery_ceiling_tiers
    return payload


def codex_tiers() -> dict:
    return {
        "mini": {"model": "gpt-5.6-luna"},
        "standard": {"model": "gpt-5.6-terra"},
        "strong": {"model": "gpt-5.6-sol"},
    }


def model_set_payload(runtime: str, tiers: dict) -> dict:
    return {
        "name": "test-model-set",
        "runtime": runtime,
        "tiers": tiers,
    }


class AgentModelProfilesTest(unittest.TestCase):
    def test_builtin_profile_tiers_preserve_cost_quality_boundaries(self) -> None:
        profiles_dir = REPO_ROOT / "tools" / "agent-profiles"
        frugal = RESOLVER.load_profile("frugal", profiles_dir, "codex")
        balanced = RESOLVER.load_profile("balanced", profiles_dir, "codex")
        premium = RESOLVER.load_profile("premium", profiles_dir, "codex")

        self.assertEqual(
            {
                tier: list(frugal.models.values()).count(tier)
                for tier in RESOLVER.REQUIRED_TIERS
            },
            {"mini": 15, "standard": 26, "strong": 4},
        )
        self.assertEqual(
            {
                tier: list(balanced.models.values()).count(tier)
                for tier in RESOLVER.REQUIRED_TIERS
            },
            {"mini": 9, "standard": 31, "strong": 5},
        )
        self.assertEqual(
            {
                tier: list(premium.models.values()).count(tier)
                for tier in RESOLVER.REQUIRED_TIERS
            },
            {"mini": 9, "standard": 16, "strong": 20},
        )

        for role in (
            "art-director",
            "committee-product",
            "ux-copy-trust",
            "ux-novice",
            "ux-visual-hierarchy",
        ):
            self.assertEqual(frugal.models[role], "mini")
            self.assertEqual(balanced.models[role], "standard")

        for role in (
            "committee-kiss",
            "handoff-writer",
            "session-guide-writer",
            "test-runner",
        ):
            self.assertEqual(premium.models[role], "mini")
        self.assertEqual(premium.models["executor"], "standard")
        self.assertEqual(premium.recovery_ceiling_tiers["executor"], "strong")

    def test_builtin_recovery_ceiling_mappings(self) -> None:
        profiles_dir = REPO_ROOT / "tools" / "agent-profiles"
        expected = {
            "frugal": {"executor": "standard", "generalist": "standard"},
            "balanced": {"executor": "strong", "generalist": "strong"},
            "premium": {"executor": "strong", "generalist": "strong"},
        }

        for name, ceilings in expected.items():
            with self.subTest(profile=name):
                profile = RESOLVER.load_profile(name, profiles_dir, "codex")
                self.assertEqual(profile.recovery_ceiling_tiers, ceilings)

    def test_unknown_tier_fails_during_resolution(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = root / "model-sets"
            write_json(profile_dir, "profile", profile_payload({"executor": "max"}))
            write_json(model_set_dir, "openai", model_set_payload("codex", codex_tiers()))

            profile = RESOLVER.load_profile("profile", profile_dir, "codex")
            model_set = RESOLVER.load_model_set("openai", model_set_dir, "codex")

            with self.assertRaisesRegex(ValueError, "unknown tier 'max'"):
                RESOLVER.resolve_agent_model_settings(["executor"], profile, model_set)

    def test_missing_required_tiers_fail_model_set_load(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            model_set_dir = Path(temp_dir_name)
            tiers = {
                "mini": {"model": "gpt-5.6-luna"},
                "standard": {"model": "gpt-5.6-terra"},
            }
            write_json(model_set_dir, "openai", model_set_payload("codex", tiers))

            with self.assertRaisesRegex(ValueError, "missing required tier"):
                RESOLVER.load_model_set("openai", model_set_dir, "codex")

    def test_runtime_mismatch_fails_but_neutral_profile_is_shared(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = root / "model-sets"
            write_json(profile_dir, "shared", profile_payload({"executor": "standard"}))
            write_json(profile_dir, "copilot-only", profile_payload({"executor": "standard"}, runtime="copilot"))
            write_json(model_set_dir, "copilot", model_set_payload("copilot", {
                "mini": "GPT-5 mini",
                "standard": "GPT-5.5",
                "strong": ["GPT-5.5", "Claude Opus 4.8"],
            }))

            shared = RESOLVER.load_profile("shared", profile_dir, "codex")
            self.assertEqual(shared.runtime, "codex")
            self.assertEqual(shared.source_runtime, "neutral")

            with self.assertRaisesRegex(ValueError, "incompatible with requested runtime 'claude'"):
                RESOLVER.load_profile("copilot-only", profile_dir, "claude")
            with self.assertRaisesRegex(ValueError, "does not match requested runtime 'codex'"):
                RESOLVER.load_model_set("copilot", model_set_dir, "codex")

    def test_unsafe_agent_name_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            profile_dir = Path(temp_dir_name)
            write_json(profile_dir, "profile", profile_payload({"../executor": "standard"}))

            with self.assertRaisesRegex(ValueError, "safe generated agent name"):
                RESOLVER.load_profile("profile", profile_dir, "codex")

            with self.assertRaisesRegex(ValueError, "safe generated agent name"):
                RESOLVER.resolve_agent_model_settings(["bad/name"], None, None)

    def test_invalid_codex_dict_key_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            model_set_dir = Path(temp_dir_name)
            tiers = codex_tiers()
            tiers["mini"] = {"model": "gpt-5.6-luna", "model_reasoning_effort": "low"}
            write_json(model_set_dir, "openai", model_set_payload("codex", tiers))

            with self.assertRaisesRegex(ValueError, "unsupported key.*model_reasoning_effort"):
                RESOLVER.load_model_set("openai", model_set_dir, "codex")

    def test_invalid_copilot_list_value_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            model_set_dir = Path(temp_dir_name)
            tiers = {
                "mini": "GPT-5 mini",
                "standard": ["GPT-5.5", "bad\nmodel"],
                "strong": ["GPT-5.5", "Claude Opus 4.8"],
            }
            write_json(model_set_dir, "default", model_set_payload("copilot", tiers))

            with self.assertRaisesRegex(ValueError, "single-line string"):
                RESOLVER.load_model_set("default", model_set_dir, "copilot")

    def test_invalid_claude_alias_and_versioned_id_fail(self) -> None:
        cases = {
            "bad-alias": "banana",
            "versioned": "claude-sonnet-5",
        }
        for case_name, standard_value in cases.items():
            with self.subTest(case_name=case_name):
                with tempfile.TemporaryDirectory() as temp_dir_name:
                    model_set_dir = Path(temp_dir_name)
                    tiers = {
                        "mini": "haiku",
                        "standard": standard_value,
                        "strong": "opus",
                    }
                    write_json(model_set_dir, "default", model_set_payload("claude", tiers))

                    with self.assertRaisesRegex(ValueError, "Claude"):
                        RESOLVER.load_model_set("default", model_set_dir, "claude")

    def test_uniform_model_behavior_is_runtime_specific(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            codex_dir = root / "codex"
            copilot_dir = root / "copilot"
            claude_dir = root / "claude"
            write_json(codex_dir, "openai", model_set_payload("codex", codex_tiers()))
            write_json(copilot_dir, "default", model_set_payload("copilot", {
                "mini": "GPT-5 mini",
                "standard": "GPT-5.5",
                "strong": ["GPT-5.5", "Claude Opus 4.8"],
            }))
            write_json(claude_dir, "default", model_set_payload("claude", {
                "mini": "haiku",
                "standard": "sonnet",
                "strong": "opus",
            }))

            codex = RESOLVER.load_model_set("openai", codex_dir, "codex")
            copilot = RESOLVER.load_model_set("default", copilot_dir, "copilot")
            claude = RESOLVER.load_model_set("default", claude_dir, "claude")

            self.assertEqual(
                RESOLVER.resolve_agent_model_settings(
                    ["executor", "reviewer"], None, codex, uniform_model="gpt-5.6-sol"
                ),
                {"executor": {"model": "gpt-5.6-sol"}, "reviewer": {"model": "gpt-5.6-sol"}},
            )
            self.assertEqual(
                RESOLVER.resolve_agent_model_settings(
                    ["executor"], None, copilot, uniform_model="GPT-5.5"
                ),
                {"executor": "GPT-5.5"},
            )
            self.assertEqual(
                RESOLVER.resolve_agent_model_settings(
                    ["executor"], None, claude, uniform_model="sonnet"
                ),
                {"executor": "sonnet"},
            )
            with self.assertRaisesRegex(ValueError, "versioned model IDs"):
                RESOLVER.resolve_agent_model_settings(
                    ["executor"], None, claude, uniform_model="claude-sonnet-5"
                )

    def test_no_flags_returns_empty_mapping(self) -> None:
        self.assertEqual(
            RESOLVER.resolve_agent_model_settings(["executor", "reviewer"], None, None),
            {},
        )

    def test_extra_profile_agents_warn_and_are_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = root / "model-sets"
            profile_path = write_json(
                profile_dir,
                "profile",
                profile_payload({"executor": "standard", "missing-agent": "mini"}),
            )
            write_json(model_set_dir, "openai", model_set_payload("codex", codex_tiers()))
            profile = RESOLVER.load_profile("profile", profile_dir, "codex")
            model_set = RESOLVER.load_model_set("openai", model_set_dir, "codex")

            with warnings.catch_warnings(record=True) as captured:
                warnings.simplefilter("always")
                resolved = RESOLVER.resolve_agent_model_settings(
                    ["executor", "reviewer"], profile, model_set
                )

            self.assertEqual(resolved, {"executor": {"model": "gpt-5.6-terra"}})
            self.assertEqual(len(captured), 1)
            self.assertIn(profile_path.as_posix(), str(captured[0].message))
            self.assertIn("missing-agent", str(captured[0].message))

    def test_recovery_model_setting_returns_copied_bounded_setting(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = root / "model-sets"
            write_json(
                profile_dir,
                "profile",
                profile_payload(
                    {"executor": "standard", "generalist": "standard"},
                    recovery_ceiling_tiers={"executor": "strong", "generalist": "strong"},
                ),
            )
            write_json(model_set_dir, "openai", model_set_payload("codex", codex_tiers()))
            profile = RESOLVER.load_profile("profile", profile_dir, "codex")
            model_set = RESOLVER.load_model_set("openai", model_set_dir, "codex")

            resolved = RESOLVER.resolve_recovery_model_setting(
                "executor", "strong", profile, model_set
            )

            self.assertEqual(
                resolved,
                {
                    "model_setting": {"model": "gpt-5.6-sol"},
                    "base_tier": "standard",
                    "requested_tier": "strong",
                    "ceiling_tier": "strong",
                },
            )
            resolved["model_setting"]["model"] = "changed"
            self.assertEqual(model_set.tiers["strong"], {"model": "gpt-5.6-sol"})

    def test_recovery_model_setting_requires_configured_supported_role(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = root / "model-sets"
            write_json(
                profile_dir,
                "profile",
                profile_payload({"executor": "standard"}),
            )
            write_json(model_set_dir, "openai", model_set_payload("codex", codex_tiers()))
            profile = RESOLVER.load_profile("profile", profile_dir, "codex")
            model_set = RESOLVER.load_model_set("openai", model_set_dir, "codex")

            with self.assertRaisesRegex(ValueError, "not configured"):
                RESOLVER.resolve_recovery_model_setting(
                    "executor", "strong", profile, model_set
                )
            with self.assertRaisesRegex(ValueError, "must be one of"):
                RESOLVER.resolve_recovery_model_setting(
                    "reviewer", "strong", profile, model_set
                )

    def test_recovery_model_setting_requires_tier_above_base(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = root / "model-sets"
            write_json(
                profile_dir,
                "profile",
                profile_payload(
                    {"executor": "standard"},
                    recovery_ceiling_tiers={"executor": "strong"},
                ),
            )
            write_json(model_set_dir, "openai", model_set_payload("codex", codex_tiers()))
            profile = RESOLVER.load_profile("profile", profile_dir, "codex")
            model_set = RESOLVER.load_model_set("openai", model_set_dir, "codex")

            for requested_tier in ("mini", "standard"):
                with self.subTest(requested_tier=requested_tier):
                    with self.assertRaisesRegex(ValueError, "must be above base tier"):
                        RESOLVER.resolve_recovery_model_setting(
                            "executor", requested_tier, profile, model_set
                        )

    def test_recovery_model_setting_rejects_tier_above_ceiling(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = root / "model-sets"
            write_json(
                profile_dir,
                "profile",
                profile_payload(
                    {"executor": "mini"},
                    recovery_ceiling_tiers={"executor": "standard"},
                ),
            )
            write_json(model_set_dir, "openai", model_set_payload("codex", codex_tiers()))
            profile = RESOLVER.load_profile("profile", profile_dir, "codex")
            model_set = RESOLVER.load_model_set("openai", model_set_dir, "codex")

            with self.assertRaisesRegex(ValueError, "exceeds ceiling tier"):
                RESOLVER.resolve_recovery_model_setting(
                    "executor", "strong", profile, model_set
                )

    def test_invalid_recovery_ceiling_profile_fails_load(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            profile_dir = Path(temp_dir_name)
            cases = {
                "below-base": (
                    {"executor": "standard"},
                    {"executor": "mini"},
                    "cannot be below base tier",
                ),
                "unknown-tier": (
                    {"executor": "standard"},
                    {"executor": "max"},
                    "must be one of",
                ),
                "unlisted-role": (
                    {"reviewer": "standard"},
                    {"reviewer": "strong"},
                    "must be one of",
                ),
            }
            for name, (models, ceilings, message) in cases.items():
                with self.subTest(profile=name):
                    write_json(
                        profile_dir,
                        "profile",
                        profile_payload(models, recovery_ceiling_tiers=ceilings),
                    )
                    with self.assertRaisesRegex(ValueError, message):
                        RESOLVER.load_profile("profile", profile_dir, "codex")


if __name__ == "__main__":
    unittest.main()
