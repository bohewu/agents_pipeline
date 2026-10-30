from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
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


class DecideLauncherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.target = self.root / ".env.local"

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
        long_parent = self.root / "long-parent"
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


if __name__ == "__main__":
    unittest.main()
