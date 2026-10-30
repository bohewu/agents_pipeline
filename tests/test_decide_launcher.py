from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("decide_launcher", REPO_ROOT / "scripts" / "decide.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
KEY = "-".join(("sk", "synthetic", "launcher", "fixture"))
NEW_KEY = KEY + "-replacement"


class TerminalStringIO(io.StringIO):
    def isatty(self):
        return True


class DecideLauncherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.target = self.root / ".env.local"
        self.config = self.root / "settings" / "decide.json"
        self.binding_default = mock.patch.object(MODULE, "default_binding_path", return_value=self.config)
        self.binding_default.start()
        self.addCleanup(self.binding_default.stop)

    def private_file(self, contents):
        self.target.write_text(contents, encoding="utf-8")
        if os.name == "nt":
            MODULE.windows_acl(self.target, protect=True)
        else:
            self.target.chmod(0o600)

    def run_main(self, args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = MODULE.main(args)
        self.assertNotIn(KEY, out.getvalue() + err.getvalue())
        return code, out.getvalue(), err.getvalue()

    def run_terminal(self, args, answers, keys=()):
        out, err = TerminalStringIO(), io.StringIO()
        with mock.patch.object(MODULE.sys, "stdin", TerminalStringIO(answers)), mock.patch.object(MODULE.sys, "stdout", out), contextlib.redirect_stderr(err), mock.patch.object(MODULE.getpass, "getpass", side_effect=keys) as hidden:
            code = MODULE.main(args)
        self.assertNotIn(KEY, out.getvalue() + err.getvalue())
        self.assertNotIn(NEW_KEY, out.getvalue() + err.getvalue())
        return code, out.getvalue(), err.getvalue(), hidden.call_count

    def test_no_action_menu_completes_fresh_setup_and_binding(self):
        with mock.patch.object(MODULE.Path, "home", return_value=self.root):
            code, out, err, prompts = self.run_terminal([], "\n\nyes\n", (KEY, KEY))
        self.assertEqual(code, 0, err)
        target = MODULE.read_binding(self.config)
        self.assertIsNotNone(target)
        self.assertEqual(MODULE.load_key(target), KEY)
        self.assertEqual(prompts, 2)
        self.assertIn("Configured.", out)
        self.assertTrue(json.loads(self.run_main(["status"])[1])["configured"])

    def test_menu_reuses_bound_key_without_prompting_for_it(self):
        MODULE.save_key(self.target, KEY, replace=False)
        self.assertEqual(self.run_main(["bind", "--env-file", str(self.target)])[0], 0)
        before = self.target.read_bytes()
        code, _, err, prompts = self.run_terminal([], "1\n\n\n")
        self.assertEqual(code, 0, err)
        self.assertEqual(prompts, 0)
        self.assertEqual(self.target.read_bytes(), before)
        self.assertEqual(MODULE.read_binding(self.config), self.target)

    def test_set_replaces_key_and_binds_in_one_operation(self):
        MODULE.save_key(self.target, KEY, replace=False)
        code, _, err, prompts = self.run_terminal(["set", "--env-file", str(self.target)], "2\nyes\n", (NEW_KEY, NEW_KEY))
        self.assertEqual(code, 0, err)
        self.assertEqual(prompts, 2)
        self.assertEqual(MODULE.load_key(self.target), NEW_KEY)
        self.assertEqual(MODULE.read_binding(self.config), self.target)

    def test_menu_key_mismatch_or_cancellation_leaves_no_binding(self):
        for answers, keys in ((f"1\n{self.target}\nyes\n", (KEY, NEW_KEY)),
                              (f"1\n{self.target}\nno\n", ())):
            self.assertEqual(self.run_terminal([], answers, keys)[0], 2)
            self.assertFalse(self.target.exists())
            self.assertFalse(self.config.exists())

    def test_set_rejects_metadata_as_credential_before_secret_entry(self):
        MODULE.save_key(self.target, KEY, replace=False)
        self.assertEqual(self.run_main(["bind", "--env-file", str(self.target)])[0], 0)
        before = self.config.read_bytes()
        code, _, _, prompts = self.run_terminal(["set", "--env-file", str(self.config), "--replace"], "")
        self.assertEqual(code, 2)
        self.assertEqual(prompts, 0)
        self.assertEqual(self.config.read_bytes(), before)
        self.assertEqual(MODULE.load_key(self.target), KEY)

    def test_menu_does_not_echo_a_key_pasted_as_a_path(self):
        code, _, _, prompts = self.run_terminal([], f"1\n{KEY}\n")
        self.assertEqual(code, 2)
        self.assertEqual(prompts, 0)
        self.assertFalse(self.config.exists())

    def test_menu_status_clear_and_eof_do_not_enter_a_key(self):
        MODULE.save_key(self.target, KEY, replace=False)
        self.assertEqual(self.run_main(["bind", "--env-file", str(self.target)])[0], 0)
        self.assertEqual(self.run_terminal([], "invalid\n2\n")[0], 0)
        self.assertEqual(self.run_terminal([], "3\n")[0], 0)
        self.assertFalse(self.config.exists())
        self.assertEqual(MODULE.load_key(self.target), KEY)
        self.assertEqual(self.run_terminal([], "")[0], 2)

    def test_no_action_or_new_key_refuses_noninteractive_input(self):
        with mock.patch.object(MODULE.sys.stdin, "isatty", return_value=False), mock.patch.object(MODULE.getpass, "getpass") as hidden:
            self.assertEqual(self.run_main([])[0], 2)
            self.assertEqual(self.run_main(["set", "--env-file", str(self.target)])[0], 2)
            hidden.assert_not_called()
        self.assertFalse(self.target.exists())
        self.assertFalse(self.config.exists())

    def test_new_setup_is_private_and_requires_explicit_replacement(self):
        MODULE.save_key(self.target, KEY, replace=False)
        self.assertEqual(MODULE.load_key(self.target), KEY)
        if os.name != "nt":
            self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(MODULE.SetupError):
            MODULE.save_key(self.target, NEW_KEY, replace=False)
        self.assertEqual(MODULE.load_key(self.target), KEY)
        MODULE.save_key(self.target, NEW_KEY, replace=True)
        self.assertEqual(MODULE.load_key(self.target), NEW_KEY)
        self.assertEqual(list(self.root.glob(".env.decide-*")), [])

    def test_replacement_preserves_unrelated_lines_without_shell_execution(self):
        other = "OTHER=$(do-not-execute)\n# keep this\n"
        self.private_file(other + 'export OPENAI_API_KEY="' + KEY + '"\n')
        self.assertEqual(MODULE.load_key(self.target), KEY)
        MODULE.save_key(self.target, NEW_KEY, replace=True)
        self.assertEqual(self.target.read_text(encoding="utf-8"), other + "OPENAI_API_KEY=" + NEW_KEY + "\n")

    def test_duplicate_and_shell_key_values_are_rejected(self):
        for contents in ("OPENAI_API_KEY=$(echo unsafe)\n", "OPENAI_API_KEY=" + KEY + "\nOPENAI_API_KEY=" + KEY):
            self.private_file(contents)
            with self.assertRaises(MODULE.SetupError):
                MODULE.load_key(self.target)

    def test_status_reports_presence_without_live_verification(self):
        code, out, _ = self.run_main(["status", "--env-file", str(self.target)])
        self.assertEqual(code, 0)
        self.assertFalse(json.loads(out)["configured"])
        MODULE.save_key(self.target, KEY, replace=False)
        code, out, _ = self.run_main(["status", "--env-file", str(self.target)])
        self.assertEqual(code, 0)
        self.assertTrue(json.loads(out)["configured"])
        self.assertFalse(json.loads(out)["live_verified"])

    @unittest.skipIf(os.name == "nt", "POSIX mode/owner contract")
    def test_world_readable_file_is_rejected_without_changing_it(self):
        self.private_file("OPENAI_API_KEY=" + KEY)
        self.target.chmod(0o644)
        with self.assertRaises(MODULE.SetupError):
            MODULE.save_key(self.target, NEW_KEY, replace=True)
        with self.assertRaises(MODULE.SetupError):
            MODULE.load_key(self.target)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o644)

    def test_unsafe_paths_fail_without_writing(self):
        self.target.mkdir()
        with self.assertRaises(MODULE.SetupError):
            MODULE.checked_target(str(self.target))
        self.target.rmdir()
        actual = self.root / "actual"
        actual.mkdir()
        link = self.root / "alias"
        try:
            link.symlink_to(actual, target_is_directory=True)
        except OSError:
            self.skipTest("Symlinks unavailable on this host")
        with self.assertRaises(MODULE.SetupError):
            MODULE.save_key(link / ".env.local", KEY, replace=False)
        self.assertEqual(list(actual.iterdir()), [])

    def test_git_target_must_be_ignored_and_untracked(self):
        subprocess.run(["git", "init", "--quiet", str(self.root)], check=True)
        (self.root / ".gitignore").write_text(".env.*\n", encoding="utf-8")
        with self.assertRaises(MODULE.SetupError):
            MODULE.save_key(self.root / "unignored.env", KEY, replace=False)
        MODULE.save_key(self.target, KEY, replace=False)
        subprocess.run(["git", "-C", str(self.root), "add", "--force", ".env.local"], check=True)
        with self.assertRaises(MODULE.SetupError):
            MODULE.save_key(self.target, NEW_KEY, replace=True)
        self.assertEqual(MODULE.load_key(self.target), KEY)

    def test_git_root_comparison_accepts_a_canonicalized_short_parent(self):
        short_parent = self.root / "SHORT~1"
        long_parent = (self.root / "long-parent").resolve()
        original_resolve = Path.resolve

        def resolve(path, *args, **kwargs):
            return long_parent if path == short_parent else original_resolve(path, *args, **kwargs)

        results = [subprocess.CompletedProcess([], 0, os.fsencode(str(long_parent)) + b"\n"),
                   subprocess.CompletedProcess([], 1), subprocess.CompletedProcess([], 0)]
        with mock.patch.object(MODULE.Path, "resolve", autospec=True, side_effect=resolve), mock.patch.object(MODULE.subprocess, "run", side_effect=results) as git:
            MODULE.require_ignored(short_parent / ".env.local")
        self.assertEqual(git.call_args_list[-1].args[0][-1], ".env.local")

    @unittest.skipUnless(os.name == "nt", "Windows ACL contract")
    def test_windows_acl_roundtrip_rejects_a_broad_reader(self):
        MODULE.save_key(self.target, KEY, replace=False)
        MODULE.check_private(self.target)
        result = subprocess.run(["icacls", str(self.target), "/grant", "*S-1-1-0:R"], capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, "Unable to add the synthetic broad-reader ACE")
        with self.assertRaises(MODULE.SetupError):
            MODULE.load_key(self.target)

    def test_unignored_staging_is_rejected_before_any_secret_is_written(self):
        subprocess.run(["git", "init", "--quiet", str(self.root)], check=True)
        (self.root / ".gitignore").write_text(".env.local\n", encoding="utf-8")
        with self.assertRaises(MODULE.SetupError):
            MODULE.save_key(self.target, KEY, replace=False)
        self.assertFalse(self.target.exists())
        self.assertEqual(list(self.root.glob(".env.decide-*")), [])

    def test_invalid_arguments_never_echo_an_accidentally_supplied_key(self):
        result = subprocess.run([sys.executable, str(REPO_ROOT / "scripts" / "decide.py"), "setup", "--api-key", KEY], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 2)
        self.assertNotIn(KEY, result.stdout + result.stderr)

    def test_setup_needs_interactive_input_and_explicit_destination_confirmation(self):
        with mock.patch.object(MODULE.sys.stdin, "isatty", return_value=False), mock.patch.object(MODULE.getpass, "getpass") as prompt:
            code, _, _ = self.run_main(["setup", "--env-file", str(self.target)])
            self.assertEqual(code, 2)
            prompt.assert_not_called()
        with mock.patch.object(MODULE.sys.stdin, "isatty", return_value=True), mock.patch("builtins.input", return_value="no"), mock.patch.object(MODULE.getpass, "getpass") as prompt:
            self.assertEqual(self.run_main(["setup", "--env-file", str(self.target)])[0], 2)
            prompt.assert_not_called()
        self.assertFalse(self.target.exists())

    def test_setup_hidden_entry_mismatch_never_writes(self):
        with mock.patch.object(MODULE.sys.stdin, "isatty", return_value=True), mock.patch("builtins.input", return_value="yes"), mock.patch.object(MODULE.getpass, "getpass", side_effect=[KEY, NEW_KEY]):
            self.assertEqual(self.run_main(["setup", "--env-file", str(self.target)])[0], 2)
        self.assertFalse(self.target.exists())

    def test_key_is_only_in_child_environment_never_argv_or_parent(self):
        MODULE.save_key(self.target, KEY, replace=False)
        before = dict(os.environ)
        with mock.patch.object(MODULE.subprocess, "run", return_value=mock.Mock(returncode=0)) as child:
            self.assertEqual(self.run_main(["run", "--env-file", str(self.target), "--input", "request.json"])[0], 0)
        self.assertEqual(os.environ, before)
        self.assertNotIn(KEY, str(child.call_args.args))
        self.assertEqual(child.call_args.kwargs["env"]["OPENAI_API_KEY"], KEY)

    def test_selected_missing_file_does_not_fall_back_to_environment(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": KEY}), mock.patch.object(MODULE.subprocess, "run") as child:
            self.assertEqual(self.run_main(["run", "--env-file", str(self.target), "--input", "request.json"])[0], 2)
            child.assert_not_called()

    def test_dry_run_ignores_selected_credentials_and_runs_real_node_validator(self):
        request = self.root / "request.json"
        request.write_text(json.dumps({"input": "fixture", "questions": [
            {"type": "predicate", "name": "q", "instructions": "Question"}
        ]}), encoding="utf-8")
        result = subprocess.run([sys.executable, str(REPO_ROOT / "scripts" / "decide.py"), "run", "--env-file", str(self.target), "--input", str(request), "--dry-run"], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "dry_run")
        self.assertFalse(self.target.exists())

    def test_acl_failure_occurs_before_secret_write_and_cleans_temp(self):
        with mock.patch.object(MODULE, "IS_WINDOWS", True), mock.patch.object(MODULE, "windows_acl", side_effect=MODULE.SetupError("ACL unavailable")):
            with self.assertRaises(MODULE.SetupError):
                MODULE.save_key(self.target, KEY, replace=False)
        self.assertFalse(self.target.exists())
        self.assertEqual(list(self.root.glob(".env.decide-*")), [])

    def test_native_acl_failure_diagnostics_never_echo_untrusted_stderr(self):
        native = subprocess.CompletedProcess([], 40, b"", ("System.ArgumentException|" + KEY + " private path").encode())
        with mock.patch.object(MODULE.subprocess, "run", return_value=native):
            with self.assertRaises(MODULE.SetupError) as caught:
                MODULE.windows_acl(self.target, protect=False)
        self.assertNotIn(KEY, str(caught.exception))
        self.assertNotIn("private path", str(caught.exception))

    def test_bind_stores_only_location_and_reloads_replaced_key(self):
        MODULE.save_key(self.target, KEY, replace=False)
        original = self.target.read_bytes()
        self.assertEqual(self.run_main(["bind", "--env-file", str(self.target)])[0], 0)
        stored = self.config.read_bytes()
        self.assertNotIn(KEY.encode(), stored)
        self.assertEqual(json.loads(stored), {"version": 1, "env_file": str(self.target)})
        self.assertEqual(self.target.read_bytes(), original)
        self.assertTrue(json.loads(self.run_main(["status"])[1])["configured"])
        for expected in (KEY, NEW_KEY):
            if expected == NEW_KEY:
                MODULE.save_key(self.target, NEW_KEY, replace=True)
            before = dict(os.environ)
            with mock.patch.object(MODULE.subprocess, "run", return_value=mock.Mock(returncode=0)) as child:
                self.assertEqual(self.run_main(["run", "--input", "request.json"])[0], 0)
            self.assertEqual(os.environ, before)
            self.assertEqual(child.call_args.kwargs["env"]["OPENAI_API_KEY"], expected)
            self.assertNotIn(expected, str(child.call_args.args))
            self.assertEqual(self.config.read_bytes(), stored)

    def test_missing_or_invalid_binding_never_selects_environment_key(self):
        MODULE.save_key(self.target, KEY, replace=False)
        self.assertEqual(self.run_main(["bind", "--env-file", str(self.target)])[0], 0)
        self.target.unlink()
        states = [None, b"invalid json", json.dumps({"version": 2, "env_file": str(self.target)}).encode(),
                  json.dumps({"version": 1, "env_file": "relative.env"}).encode()]
        for state in states:
            if state is not None:
                self.config.write_bytes(state)
            with mock.patch.dict(os.environ, {"OPENAI_API_KEY": NEW_KEY}), mock.patch.object(MODULE.subprocess, "run", return_value=mock.Mock(returncode=0)) as child:
                self.assertEqual(self.run_main(["run", "--input", "request.json"])[0], 2)
            self.assertFalse(any(call.args[0][0] == "node" for call in child.call_args_list))

    def test_explicit_file_overrides_damaged_binding_for_one_call(self):
        MODULE.save_key(self.target, KEY, replace=False)
        self.config.parent.mkdir()
        MODULE.write_private_file(self.config, b"invalid json")
        self.assertTrue(json.loads(self.run_main(["status", "--env-file", str(self.target)])[1])["configured"])
        self.assertEqual(self.config.read_bytes(), b"invalid json")

    def test_bind_failure_preserves_key_and_existing_binding(self):
        MODULE.save_key(self.target, KEY, replace=False)
        self.assertEqual(self.run_main(["bind", "--env-file", str(self.target)])[0], 0)
        before = self.config.read_bytes()
        self.assertEqual(self.run_main(["bind", "--env-file", str(self.root / "missing.env")])[0], 2)
        self.assertEqual(self.config.read_bytes(), before)
        self.assertEqual(self.run_main(["--config-file", str(self.target), "bind", "--env-file", str(self.target)])[0], 2)
        self.assertEqual(MODULE.load_key(self.target), KEY)

    def test_clear_deletes_only_valid_metadata(self):
        MODULE.save_key(self.target, KEY, replace=False)
        self.assertEqual(self.run_main(["bind", "--env-file", str(self.target)])[0], 0)
        self.assertEqual(self.run_main(["clear"])[0], 0)
        self.assertFalse(self.config.exists())
        self.assertEqual(MODULE.load_key(self.target), KEY)
        self.assertEqual(self.run_main(["--config-file", str(self.target), "clear"])[0], 2)
        self.assertEqual(MODULE.load_key(self.target), KEY)
        self.assertFalse(json.loads(self.run_main(["status"])[1])["configured"])

    def test_unbound_environment_mode_is_preserved_without_creating_config(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": KEY}), mock.patch.object(MODULE.subprocess, "run", return_value=mock.Mock(returncode=0)) as child:
            self.assertEqual(self.run_main(["run", "--input", "request.json"])[0], 0)
        self.assertEqual(child.call_args.kwargs["env"]["OPENAI_API_KEY"], KEY)
        self.assertFalse(self.config.parent.exists())

    def test_dry_run_does_not_read_binding_or_inject_key(self):
        with mock.patch.object(MODULE, "read_binding", side_effect=AssertionError("binding read")), mock.patch.object(MODULE.subprocess, "run", return_value=mock.Mock(returncode=0)) as child:
            self.assertEqual(self.run_main(["run", "--input", "request.json", "--dry-run"])[0], 0)
        self.assertNotIn("env", child.call_args.kwargs)

    @unittest.skipIf(os.name == "nt", "POSIX config permissions")
    def test_broad_binding_permissions_are_rejected(self):
        MODULE.save_key(self.target, KEY, replace=False)
        self.assertEqual(self.run_main(["bind", "--env-file", str(self.target)])[0], 0)
        self.config.chmod(0o644)
        self.assertEqual(self.run_main(["status"])[0], 2)
        self.assertEqual(self.run_main(["clear"])[0], 2)
        self.assertTrue(self.config.exists())

    def test_wrappers_forward_binding_paths_stdin_and_exit_codes_from_other_cwd(self):
        commands = []
        if os.name != "nt":
            commands.append(["bash", str(REPO_ROOT / "scripts" / "decide.sh")])
        for name in ("pwsh",):
            executable = shutil.which(name)
            if executable:
                commands.append([executable, "-NoProfile", "-File", str(REPO_ROOT / "scripts" / "decide.ps1")])
        self.assertTrue(commands, "No platform entrypoint available")
        target = self.root / ".env.with spaces"
        MODULE.save_key(target, KEY, replace=False)
        before = target.read_bytes()
        request = json.dumps({"input": "fixture", "questions": [{"type": "predicate", "name": "q", "instructions": "Question"}]})
        for index, command in enumerate(commands):
            with self.subTest(wrapper=command[0]):
                config = self.root / "settings with spaces" / f"decide-{index}.json"
                prefix = command + ["--config-file", str(config)]
                no_action = subprocess.run(prefix, cwd=self.root, capture_output=True, text=True, check=False)
                self.assertEqual(no_action.returncode, 2)
                self.assertFalse(config.exists())
                bound = subprocess.run(prefix + ["set", "--env-file", str(target)], cwd=self.root, capture_output=True, text=True, check=False)
                self.assertEqual(bound.returncode, 0, bound.stderr)
                self.assertNotIn(KEY, bound.stdout + bound.stderr)
                status = subprocess.run(prefix + ["status"], cwd=self.root, capture_output=True, text=True, check=False)
                self.assertEqual(status.returncode, 0, status.stderr)
                self.assertTrue(json.loads(status.stdout)["configured"])
                dry = subprocess.run(prefix + ["run", "--input", "-", "--dry-run"], input=request, cwd=self.root, capture_output=True, text=True, check=False)
                self.assertEqual(dry.returncode, 0, dry.stderr)
                self.assertEqual(json.loads(dry.stdout)["status"], "dry_run")
                invalid = subprocess.run(prefix + ["run", "--input", "-", "--dry-run"], input="{", cwd=self.root, capture_output=True, text=True, check=False)
                self.assertEqual(invalid.returncode, 2)
                self.assertEqual(json.loads(invalid.stderr)["error"]["category"], "invalid_input")
                self.assertEqual(target.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
