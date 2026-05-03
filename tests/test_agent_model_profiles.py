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


def profile_payload(models: dict, runtime: str = "opencode") -> dict:
    return {
        "name": "test-profile",
        "runtime": runtime,
        "models": models,
    }


def codex_tiers() -> dict:
    return {
        "mini": {"model": "gpt-5.4-mini"},
        "standard": {"model": "gpt-5.4"},
        "strong": {"model": "gpt-5.5"},
    }


def model_set_payload(runtime: str, tiers: dict) -> dict:
    return {
        "name": "test-model-set",
        "runtime": runtime,
        "tiers": tiers,
    }


class AgentModelProfilesTest(unittest.TestCase):
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
                "mini": {"model": "gpt-5.4-mini"},
                "standard": {"model": "gpt-5.4"},
            }
            write_json(model_set_dir, "openai", model_set_payload("codex", tiers))

            with self.assertRaisesRegex(ValueError, "missing required tier"):
                RESOLVER.load_model_set("openai", model_set_dir, "codex")

    def test_runtime_mismatch_fails_but_opencode_profile_is_shared(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            profile_dir = root / "profiles"
            model_set_dir = root / "model-sets"
            write_json(profile_dir, "shared", profile_payload({"executor": "standard"}))
            write_json(profile_dir, "copilot-only", profile_payload({"executor": "standard"}, runtime="copilot"))
            write_json(model_set_dir, "copilot", model_set_payload("copilot", {
                "mini": "GPT-5 mini",
                "standard": "GPT-5.4",
                "strong": ["Claude Opus 4.7", "GPT-5.5"],
            }))

            shared = RESOLVER.load_profile("shared", profile_dir, "codex")
            self.assertEqual(shared.runtime, "codex")
            self.assertEqual(shared.source_runtime, "opencode")

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
            tiers["mini"] = {"model": "gpt-5.4-mini", "model_reasoning_effort": "low"}
            write_json(model_set_dir, "openai", model_set_payload("codex", tiers))

            with self.assertRaisesRegex(ValueError, "unsupported key.*model_reasoning_effort"):
                RESOLVER.load_model_set("openai", model_set_dir, "codex")

    def test_invalid_copilot_list_value_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            model_set_dir = Path(temp_dir_name)
            tiers = {
                "mini": "GPT-5 mini",
                "standard": ["GPT-5.4", "bad\nmodel"],
                "strong": ["Claude Opus 4.7", "GPT-5.5"],
            }
            write_json(model_set_dir, "default", model_set_payload("copilot", tiers))

            with self.assertRaisesRegex(ValueError, "single-line string"):
                RESOLVER.load_model_set("default", model_set_dir, "copilot")

    def test_invalid_claude_alias_and_versioned_id_fail(self) -> None:
        cases = {
            "bad-alias": "banana",
            "versioned": "claude-sonnet-4-5",
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
                "standard": "GPT-5.4",
                "strong": ["Claude Opus 4.7", "GPT-5.5"],
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
                    ["executor", "reviewer"], None, codex, uniform_model="gpt-5.5"
                ),
                {"executor": {"model": "gpt-5.5"}, "reviewer": {"model": "gpt-5.5"}},
            )
            self.assertEqual(
                RESOLVER.resolve_agent_model_settings(
                    ["executor"], None, copilot, uniform_model="GPT-5.4"
                ),
                {"executor": "GPT-5.4"},
            )
            self.assertEqual(
                RESOLVER.resolve_agent_model_settings(
                    ["executor"], None, claude, uniform_model="sonnet"
                ),
                {"executor": "sonnet"},
            )
            with self.assertRaisesRegex(ValueError, "versioned model IDs"):
                RESOLVER.resolve_agent_model_settings(
                    ["executor"], None, claude, uniform_model="claude-sonnet-4-5"
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

            self.assertEqual(resolved, {"executor": {"model": "gpt-5.4"}})
            self.assertEqual(len(captured), 1)
            self.assertIn(profile_path.as_posix(), str(captured[0].message))
            self.assertIn("missing-agent", str(captured[0].message))


if __name__ == "__main__":
    unittest.main()
