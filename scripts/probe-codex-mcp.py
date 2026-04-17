#!/usr/bin/env python3
"""Minimal stdio MCP probe for `codex mcp-server`."""

from __future__ import annotations

import argparse
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


class McpProtocolError(RuntimeError):
    """Raised when the MCP server returns malformed or error responses."""


@dataclass
class ProbeResult:
    initialize: Dict[str, Any]
    tools: List[Dict[str, Any]]
    tool_result: Optional[Dict[str, Any]] = None
    notifications: Optional[List[Dict[str, Any]]] = None


class StdioMcpClient:
    def __init__(
        self,
        command: List[str],
        *,
        timeout_seconds: float,
        protocol_version: str,
    ) -> None:
        self._command = command
        self._timeout_seconds = timeout_seconds
        self._protocol_version = protocol_version
        self._next_id = 1
        self._notifications: List[Dict[str, Any]] = []
        self._message_queue: queue.Queue[Any] = queue.Queue()
        self._stderr_lines: queue.Queue[str] = queue.Queue()
        self._stderr_thread: Optional[threading.Thread] = None
        self._stdout_thread: Optional[threading.Thread] = None
        self._proc: Optional[subprocess.Popen[bytes]] = None

    def __enter__(self) -> "StdioMcpClient":
        self._proc = subprocess.Popen(
            self._command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self._stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._stdout_thread.start()
        self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
        self._stderr_thread.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._proc is None:
            return
        try:
            if self._proc.poll() is None:
                self._proc.terminate()
                self._proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self._proc.kill()
            self._proc.wait(timeout=5)

    @property
    def notifications(self) -> List[Dict[str, Any]]:
        return list(self._notifications)

    def stderr_output(self) -> str:
        lines: List[str] = []
        while True:
            try:
                lines.append(self._stderr_lines.get_nowait())
            except queue.Empty:
                break
        return "".join(lines).strip()

    def initialize(self) -> Dict[str, Any]:
        result = self.request(
            "initialize",
            {
                "protocolVersion": self._protocol_version,
                "capabilities": {},
                "clientInfo": {
                    "name": "agents-pipeline-codex-mcp-probe",
                    "version": "0.1.0",
                },
            },
        )
        self.notify(
            "notifications/initialized",
            {},
        )
        return result

    def request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        request_id = self._next_id
        self._next_id += 1
        self._send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params,
            }
        )

        deadline = time.time() + self._timeout_seconds
        while True:
            message = self._read_message(deadline)
            if "id" not in message:
                self._notifications.append(message)
                continue
            if message["id"] != request_id:
                raise McpProtocolError(
                    f"Received unexpected response id {message['id']} while waiting for {request_id}."
                )
            if "error" in message:
                raise McpProtocolError(
                    json.dumps(message["error"], indent=2, ensure_ascii=True)
                )
            if "result" not in message:
                raise McpProtocolError(
                    f"Response for {method} did not contain a result."
                )
            result = message["result"]
            if not isinstance(result, dict):
                raise McpProtocolError(
                    f"Response for {method} was not an object: {result!r}"
                )
            return result

    def notify(self, method: str, params: Dict[str, Any]) -> None:
        self._send(
            {
                "jsonrpc": "2.0",
                "method": method,
                "params": params,
            }
        )

    def _send(self, payload: Dict[str, Any]) -> None:
        if self._proc is None or self._proc.stdin is None:
            raise McpProtocolError("MCP process stdin is unavailable.")
        body = (
            json.dumps(payload, separators=(",", ":"), ensure_ascii=True) + "\n"
        ).encode("utf-8")
        self._proc.stdin.write(body)
        self._proc.stdin.flush()

    def _read_message(self, deadline: float) -> Dict[str, Any]:
        while True:
            self._raise_if_process_exited()
            remaining = deadline - time.time()
            if remaining <= 0:
                raise TimeoutError("Timed out waiting for MCP response.")
            try:
                item = self._message_queue.get(timeout=min(0.2, remaining))
            except queue.Empty:
                continue
            if isinstance(item, Exception):
                raise item
            if not isinstance(item, dict):
                raise McpProtocolError(f"Unexpected MCP queue item: {item!r}")
            return item

    def _read_stdout(self) -> None:
        assert self._proc is not None and self._proc.stdout is not None
        try:
            while True:
                line = self._proc.stdout.readline()
                if not line:
                    return
                stripped = line.strip()
                if not stripped:
                    continue
                message = json.loads(stripped.decode("utf-8"))
                if not isinstance(message, dict):
                    self._message_queue.put(
                        McpProtocolError(f"MCP payload was not an object: {message!r}")
                    )
                    return
                self._message_queue.put(message)
        except Exception as exc:  # pragma: no cover - best effort probe path
            self._message_queue.put(McpProtocolError(str(exc)))

    def _read_stderr(self) -> None:
        assert self._proc is not None and self._proc.stderr is not None
        while True:
            line = self._proc.stderr.readline()
            if not line:
                return
            self._stderr_lines.put(line.decode("utf-8", errors="replace"))

    def _raise_if_process_exited(self) -> None:
        if self._proc is None:
            raise McpProtocolError("MCP process was never started.")
        returncode = self._proc.poll()
        if returncode is None:
            return
        stderr = self.stderr_output()
        message = f"MCP process exited early with code {returncode}."
        if stderr:
            message += f"\n{stderr}"
        raise McpProtocolError(message)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Probe `codex mcp-server` with initialize/tools/list and optional tools/call."
    )
    parser.add_argument(
        "--server-command",
        default="codex",
        help="Command used to launch the MCP server (default: codex).",
    )
    parser.add_argument(
        "--server-arg",
        action="append",
        dest="server_args",
        default=None,
        help="Repeatable argument for the MCP server command (default: mcp-server).",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=30.0,
        help="Request timeout in seconds (default: 30).",
    )
    parser.add_argument(
        "--protocol-version",
        default="2024-11-05",
        help="MCP protocol version sent in initialize (default: 2024-11-05).",
    )
    parser.add_argument(
        "--tool",
        default=None,
        help="Optional tool name to call after tools/list succeeds.",
    )
    parser.add_argument(
        "--arguments-json",
        default="{}",
        help="JSON object passed to tools/call when --tool is set.",
    )
    parser.add_argument(
        "--include-notifications",
        action="store_true",
        help="Include any server notifications seen during the probe.",
    )
    return parser


def resolve_command(command: str, args: List[str]) -> List[str]:
    resolved = shutil.which(command)
    if resolved is None and os.name == "nt" and "." not in command:
        for suffix in (".cmd", ".exe", ".bat"):
            resolved = shutil.which(command + suffix)
            if resolved is not None:
                break
    if resolved is None:
        return [command, *args]

    lower = resolved.lower()
    if os.name == "nt" and lower.endswith((".cmd", ".bat")):
        comspec = os.environ.get("COMSPEC", "cmd.exe")
        return [comspec, "/c", resolved, *args]
    return [resolved, *args]


def main() -> int:
    args = build_parser().parse_args()
    server_args = args.server_args or ["mcp-server"]
    command = resolve_command(args.server_command, server_args)

    tool_args: Dict[str, Any]
    try:
        parsed_tool_args = json.loads(args.arguments_json)
    except json.JSONDecodeError as exc:
        print(f"Invalid --arguments-json: {exc}", file=sys.stderr)
        return 2
    if not isinstance(parsed_tool_args, dict):
        print("--arguments-json must decode to a JSON object.", file=sys.stderr)
        return 2
    tool_args = parsed_tool_args

    try:
        with StdioMcpClient(
            command,
            timeout_seconds=args.timeout_seconds,
            protocol_version=args.protocol_version,
        ) as client:
            initialize = client.initialize()
            tools_result = client.request("tools/list", {})
            tools = tools_result.get("tools", [])
            if not isinstance(tools, list):
                raise McpProtocolError(
                    "tools/list result did not contain a `tools` array."
                )

            tool_result = None
            if args.tool:
                tool_result = client.request(
                    "tools/call",
                    {
                        "name": args.tool,
                        "arguments": tool_args,
                    },
                )

            result = ProbeResult(
                initialize=initialize,
                tools=tools,
                tool_result=tool_result,
                notifications=client.notifications
                if args.include_notifications
                else None,
            )
            print(json.dumps(result.__dict__, indent=2, ensure_ascii=True))
            return 0
    except (McpProtocolError, OSError, TimeoutError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
