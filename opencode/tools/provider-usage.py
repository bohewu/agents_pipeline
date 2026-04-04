#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import copy
import csv
import json
import math
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
TOKEN_URL = "https://auth.openai.com/oauth/token"
CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
COPILOT_USER_INFO_URL = "https://api.github.com/copilot_internal/user"
COPILOT_MONITORING_URL = "https://github.com/settings/billing"
COPILOT_DOCS_URL = "https://docs.github.com/en/copilot/how-tos/manage-and-track-spending/monitor-premium-requests"
JWT_CLAIM_PATH = "https://api.openai.com/auth"
ACCESS_TOKEN_SKEW_MS = 30_000
CACHE_FILE_NAME = "provider-usage-cache.json"


@dataclass
class CodexCredential:
    source: str
    source_path: str
    label: str
    account_id: Optional[str]
    organization_id: Optional[str]
    access_token: Optional[str]
    refresh_token: Optional[str]
    id_token: Optional[str]
    expires_at_ms: Optional[int]
    email: Optional[str]
    is_active: bool = False


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_unix_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect Codex quota windows and Copilot premium request usage.")
    parser.add_argument("--provider", default="auto", choices=["auto", "codex", "copilot"])
    parser.add_argument("--format", default="text", choices=["text", "json"])
    parser.add_argument("--copilot-report")
    parser.add_argument("--project-root", default=os.getcwd())
    parser.add_argument("--include-sensitive", action="store_true")
    return parser.parse_args()


def ensure_text(value: Any) -> Optional[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def ensure_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off"}:
            return False
    return default


def parse_epoch_ms(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        number = int(value)
        if number <= 0:
            return None
        if number < 10_000_000_000:
            return number * 1000
        return number
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        if stripped.isdigit():
            return parse_epoch_ms(int(stripped))
        try:
            parsed = datetime.fromisoformat(stripped.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return to_unix_ms(parsed.astimezone(timezone.utc))
    return None


def decode_jwt(token: Optional[str]) -> Dict[str, Any]:
    if not token or token.count(".") < 2:
        return {}
    try:
        payload = token.split(".")[1]
        padding = "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding)
        data = json.loads(decoded.decode("utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def auth_claim(payload: Dict[str, Any]) -> Dict[str, Any]:
    claim = payload.get(JWT_CLAIM_PATH)
    return claim if isinstance(claim, dict) else {}


def extract_account_id_from_payload(payload: Dict[str, Any]) -> Optional[str]:
    claim = auth_claim(payload)
    for candidate in (
        claim.get("chatgpt_account_id"),
        payload.get("chatgpt_account_id"),
        payload.get("account_id"),
        payload.get("accountId"),
    ):
        value = ensure_text(candidate)
        if value:
            return value
    return None


def extract_organization_id_from_payload(payload: Dict[str, Any]) -> Optional[str]:
    claim = auth_claim(payload)
    organizations = claim.get("organizations")
    if isinstance(organizations, list):
        for entry in organizations:
            if isinstance(entry, dict):
                for key in ("id", "organization_id", "organizationId", "org_id", "workspace_id", "team_id"):
                    value = ensure_text(entry.get(key))
                    if value:
                        return value
    for candidate in (
        payload.get("organization_id"),
        payload.get("organizationId"),
        payload.get("org_id"),
    ):
        value = ensure_text(candidate)
        if value:
            return value
    return None


def extract_email(access_token: Optional[str], id_token: Optional[str]) -> Optional[str]:
    for payload in (decode_jwt(id_token), decode_jwt(access_token)):
        if not payload:
            continue
        claim = auth_claim(payload)
        for candidate in (
            payload.get("email"),
            payload.get("preferred_username"),
            claim.get("email"),
            claim.get("chatgpt_user_email"),
        ):
            value = ensure_text(candidate)
            if value and "@" in value:
                return value.lower()
    return None


def coalesce_text(record: Dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        value = ensure_text(record.get(key))
        if value:
            return value
    return None


def derive_label(record: Dict[str, Any], email: Optional[str], account_id: Optional[str], source: str, index: int) -> str:
    explicit = coalesce_text(record, "accountLabel", "label", "workspaceLabel")
    if email and explicit:
        return f"{email} ({explicit})"
    if email:
        return email
    if explicit:
        return explicit
    if account_id:
        return f"{source} account {index + 1} ({redact_identifier(account_id)})"
    return f"{source} account {index + 1}"


def normalize_credential(record: Dict[str, Any], source: str, source_path: Path, index: int, is_active: bool = False) -> Optional[CodexCredential]:
    access_token = coalesce_text(record, "accessToken", "access_token", "access")
    refresh_token = coalesce_text(record, "refreshToken", "refresh_token", "refresh")
    id_token = coalesce_text(record, "idToken", "id_token")
    expires_at_ms = parse_epoch_ms(record.get("expiresAt"))
    if expires_at_ms is None:
        expires_at_ms = parse_epoch_ms(record.get("expires_at"))
    access_payload = decode_jwt(access_token)
    id_payload = decode_jwt(id_token)
    account_id = coalesce_text(record, "accountId", "account_id", "chatgpt_account_id")
    if not account_id:
        account_id = extract_account_id_from_payload(access_payload) or extract_account_id_from_payload(id_payload)
    organization_id = coalesce_text(record, "organizationId", "organization_id", "org_id")
    if not organization_id:
        organization_id = extract_organization_id_from_payload(id_payload) or extract_organization_id_from_payload(access_payload)
    email = coalesce_text(record, "email") or extract_email(access_token, id_token)
    if not any((access_token, refresh_token, account_id)):
        return None
    return CodexCredential(
        source=source,
        source_path=str(source_path),
        label=derive_label(record, email, account_id, source, index),
        account_id=account_id,
        organization_id=organization_id,
        access_token=access_token,
        refresh_token=refresh_token,
        id_token=id_token,
        expires_at_ms=expires_at_ms,
        email=email,
        is_active=is_active,
    )


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def iter_config_roots() -> List[Path]:
    roots: List[Path] = []
    home = Path.home()
    xdg = os.environ.get("XDG_CONFIG_HOME")
    appdata = os.environ.get("APPDATA")
    for candidate in (
        Path(xdg) / "opencode" if xdg else None,
        home / ".config" / "opencode",
        home / ".opencode",
        Path(appdata) / "opencode" if appdata else None,
    ):
        if candidate is None:
            continue
        resolved = candidate.expanduser()
        if resolved not in roots:
            roots.append(resolved)
    return roots


def default_cache_root() -> Path:
    roots = iter_config_roots()
    if roots:
        return roots[0]
    return Path.home() / ".config" / "opencode"


def default_cache_path() -> Path:
    return default_cache_root() / "cache" / CACHE_FILE_NAME


def load_cache(path: Path) -> Dict[str, Any]:
    try:
        data = load_json(path)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def write_cache(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def section_is_usable(section: Any) -> bool:
    if not isinstance(section, dict):
        return False
    return ensure_text(section.get("status")) in {"ok", "partial"}


def mark_section_stale(section: Dict[str, Any], cached_at: Optional[str], reason: str) -> Dict[str, Any]:
    stale_section = copy.deepcopy(section)
    meta = stale_section.get("_meta") if isinstance(stale_section.get("_meta"), dict) else {}
    meta.update(
        {
            "stale": True,
            "cachedAt": cached_at,
            "reason": reason,
        }
    )
    stale_section["_meta"] = meta
    return stale_section


def apply_cached_fallbacks(result: Dict[str, Any], cache_payload: Dict[str, Any], providers: Iterable[str]) -> Dict[str, Any]:
    sections = cache_payload.get("sections") if isinstance(cache_payload.get("sections"), dict) else {}
    cache_meta: Dict[str, Any] = {"usedProviders": []}

    for provider in providers:
        current = result.get(provider)
        if section_is_usable(current):
            continue
        cached_entry = sections.get(provider)
        if not isinstance(cached_entry, dict):
            continue
        cached_section = cached_entry.get("data")
        if not section_is_usable(cached_section):
            continue

        reason = ensure_text((current or {}).get("message")) or ensure_text((current or {}).get("status")) or "live lookup unavailable"
        result[provider] = mark_section_stale(cached_section, ensure_text(cached_entry.get("savedAt")), reason)
        cache_meta["usedProviders"].append(provider)

    if cache_meta["usedProviders"]:
        meta = result.get("_meta") if isinstance(result.get("_meta"), dict) else {}
        meta["cache"] = cache_meta
        result["_meta"] = meta

    return result


def persist_cache(path: Path, result: Dict[str, Any], providers: Iterable[str]) -> None:
    existing = load_cache(path)
    sections = existing.get("sections") if isinstance(existing.get("sections"), dict) else {}
    saved_at = utc_now().strftime("%Y-%m-%dT%H:%M:%SZ")

    for provider in providers:
        section = result.get(provider)
        if not section_is_usable(section):
            continue
        sections[provider] = {
            "savedAt": saved_at,
            "data": section,
        }

    write_cache(
        path,
        {
            "savedAt": saved_at,
            "sections": sections,
        },
    )


def discover_codex_files(project_root: Path) -> List[Tuple[str, Path]]:
    discovered: List[Tuple[str, Path]] = []
    seen: set[str] = set()

    def add(kind: str, path: Path) -> None:
        resolved = path.expanduser()
        key = str(resolved)
        if key in seen:
            return
        if resolved.exists() and resolved.is_file():
            seen.add(key)
            discovered.append((kind, resolved))

    for root in iter_config_roots():
        add("plugin", root / "openai-codex-accounts.json")
        add("auth", root / "auth" / "openai.json")
        projects_dir = root / "projects"
        if projects_dir.exists():
            for match in sorted(projects_dir.glob("*/openai-codex-accounts.json")):
                add("plugin-project", match)

    add("codex-cli", Path.home() / ".codex" / "auth.json")
    add("project-legacy", project_root / ".opencode" / "openai-codex-accounts.json")
    add("project-auth", project_root / ".opencode" / "auth" / "openai.json")

    return discovered


def load_codex_credentials(project_root: Path) -> List[CodexCredential]:
    credentials: List[CodexCredential] = []
    seen_keys: set[str] = set()

    for kind, path in discover_codex_files(project_root):
        try:
            data = load_json(path)
        except Exception:
            continue

        if isinstance(data, dict) and isinstance(data.get("accounts"), list):
            accounts = data.get("accounts") or []
            active_index = None
            active_by_family = data.get("activeIndexByFamily")
            if isinstance(active_by_family, dict):
                value = active_by_family.get("codex")
                if isinstance(value, int):
                    active_index = value
            for index, raw in enumerate(accounts):
                if not isinstance(raw, dict):
                    continue
                credential = normalize_credential(raw, kind, path, index, is_active=(index == active_index))
                if credential is None:
                    continue
                dedupe_key = credential.refresh_token or credential.account_id or f"{credential.source_path}:{index}"
                if dedupe_key in seen_keys:
                    continue
                seen_keys.add(dedupe_key)
                credentials.append(credential)
            continue

        if isinstance(data, dict):
            record = data.get("credentials") if isinstance(data.get("credentials"), dict) else data
            if isinstance(data.get("tokens"), dict):
                record = dict(data.get("tokens") or {})
                if isinstance(data.get("last_refresh"), str):
                    record["last_refresh"] = data.get("last_refresh")
            credential = normalize_credential(record, kind, path, 0)
            if credential is None:
                continue
            dedupe_key = credential.refresh_token or credential.account_id or credential.source_path
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)
            credentials.append(credential)

    return credentials


def refresh_access_token(credential: CodexCredential) -> Tuple[Optional[str], Optional[int], Optional[str], Optional[str]]:
    if not credential.refresh_token:
        return credential.access_token, credential.expires_at_ms, credential.id_token, None
    payload = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "refresh_token": credential.refresh_token,
            "client_id": CLIENT_ID,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace").strip()
        return None, None, None, f"refresh failed: HTTP {error.code} {body[:160]}".strip()
    except Exception as error:
        return None, None, None, f"refresh failed: {error}"

    access_token = ensure_text(data.get("access_token"))
    if not access_token:
        return None, None, None, "refresh failed: missing access_token"
    expires_in = data.get("expires_in")
    expires_at_ms = None
    if isinstance(expires_in, (int, float)):
        expires_at_ms = to_unix_ms(utc_now()) + int(expires_in * 1000)
    id_token = ensure_text(data.get("id_token")) or credential.id_token
    return access_token, expires_at_ms, id_token, None


def ensure_live_token(credential: CodexCredential) -> Tuple[Optional[str], Optional[str], Optional[int], Optional[str]]:
    now_ms = to_unix_ms(utc_now())
    if credential.access_token and credential.expires_at_ms and credential.expires_at_ms > now_ms + ACCESS_TOKEN_SKEW_MS:
        return credential.access_token, credential.id_token, credential.expires_at_ms, None
    if credential.access_token and credential.expires_at_ms is None:
        return credential.access_token, credential.id_token, credential.expires_at_ms, None
    access_token, expires_at_ms, id_token, error = refresh_access_token(credential)
    return access_token, id_token, expires_at_ms, error


def fetch_codex_usage(credential: CodexCredential) -> Dict[str, Any]:
    if not credential.account_id:
        raise RuntimeError("missing account id")
    access_token, id_token, expires_at_ms, token_error = ensure_live_token(credential)
    if token_error:
        raise RuntimeError(token_error)
    if not access_token:
        raise RuntimeError("missing access token")

    if not credential.organization_id:
        credential.organization_id = extract_organization_id_from_payload(decode_jwt(id_token)) or extract_organization_id_from_payload(decode_jwt(access_token))

    headers = {
        "Authorization": f"Bearer {access_token}",
        "chatgpt-account-id": credential.account_id,
        "OpenAI-Beta": "responses=experimental",
        "originator": "codex_cli_rs",
        "accept": "application/json",
    }
    if credential.organization_id:
        headers["openai-organization"] = credential.organization_id

    request = urllib.request.Request(CODEX_USAGE_URL, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {body[:240].strip()}") from error
    except Exception as error:
        raise RuntimeError(str(error)) from error

    credential.access_token = access_token
    credential.id_token = id_token
    credential.expires_at_ms = expires_at_ms
    data = json.loads(body)
    if not isinstance(data, dict):
        raise RuntimeError("unexpected usage payload")
    return data


def map_usage_window(window: Any) -> Dict[str, Any]:
    if not isinstance(window, dict):
        return {}
    used_percent = window.get("used_percent")
    window_seconds = window.get("limit_window_seconds")
    reset_at = window.get("reset_at")
    reset_after_seconds = window.get("reset_after_seconds")
    reset_at_ms = None
    if isinstance(reset_at, (int, float)) and reset_at > 0:
        reset_at_ms = int(reset_at * 1000)
    elif isinstance(reset_after_seconds, (int, float)) and reset_after_seconds > 0:
        reset_at_ms = to_unix_ms(utc_now()) + int(reset_after_seconds * 1000)
    window_minutes = None
    if isinstance(window_seconds, (int, float)) and window_seconds > 0:
        window_minutes = max(1, int(math.ceil(window_seconds / 60)))
    left_percent = None
    if isinstance(used_percent, (int, float)):
        left_percent = max(0, min(100, round(100 - float(used_percent))))
    return {
        "usedPercent": float(used_percent) if isinstance(used_percent, (int, float)) else None,
        "leftPercent": left_percent,
        "windowMinutes": window_minutes,
        "resetAtMs": reset_at_ms,
    }


def format_window_title(window_minutes: Optional[int], fallback: str = "quota") -> str:
    if window_minutes == 300:
        return "5h limit"
    if window_minutes == 10080:
        return "Weekly limit"
    if not window_minutes or window_minutes <= 0:
        return fallback
    if window_minutes % 1440 == 0:
        return f"{window_minutes // 1440}d limit"
    if window_minutes % 60 == 0:
        return f"{window_minutes // 60}h limit"
    return f"{window_minutes}m limit"


def format_reset(reset_at_ms: Optional[int]) -> Optional[str]:
    if not reset_at_ms:
        return None
    dt = datetime.fromtimestamp(reset_at_ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def format_limit_summary(window: Dict[str, Any]) -> str:
    left = window.get("leftPercent")
    reset = format_reset(window.get("resetAtMs"))
    if left is not None and reset:
        return f"{left}% left (resets {reset})"
    if left is not None:
        return f"{left}% left"
    if reset:
        return f"resets {reset}"
    return "unavailable"


def format_bar(percent: Optional[float], width: int = 16) -> str:
    if percent is None:
        return "[unknown]"
    normalized = max(0.0, min(100.0, float(percent)))
    filled = int(round((normalized / 100.0) * width))
    filled = max(0, min(width, filled))
    return f"[{('#' * filled) + ('-' * (width - filled))}]"


def redact_identifier(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    if len(value) <= 10:
        return value
    return f"{value[:4]}...{value[-4:]}"


def summarize_codex(project_root: Path, include_sensitive: bool) -> Dict[str, Any]:
    credentials = load_codex_credentials(project_root)
    if not credentials:
        return {
            "status": "unavailable",
            "message": "No Codex/OpenAI OAuth credentials found.",
            "accounts": [],
        }

    accounts: List[Dict[str, Any]] = []
    successes = 0
    for credential in credentials:
        account_payload: Dict[str, Any] = {
            "label": credential.label,
            "source": credential.source,
            "isActive": credential.is_active,
            "email": credential.email,
            "accountId": credential.account_id if include_sensitive else redact_identifier(credential.account_id),
            "organizationId": credential.organization_id if include_sensitive else redact_identifier(credential.organization_id),
        }
        try:
            payload = fetch_codex_usage(credential)
            primary = map_usage_window((payload.get("rate_limit") or {}).get("primary_window"))
            secondary = map_usage_window((payload.get("rate_limit") or {}).get("secondary_window"))
            code_review_source = payload.get("code_review_rate_limit")
            if not code_review_source and isinstance(payload.get("additional_rate_limits"), list):
                for entry in payload.get("additional_rate_limits") or []:
                    if isinstance(entry, dict) and entry.get("limit_name") == "code_review_rate_limit":
                        code_review_source = entry.get("rate_limit")
                        break
            code_review = map_usage_window((code_review_source or {}).get("primary_window") if isinstance(code_review_source, dict) else None)
            limits: List[Dict[str, Any]] = [
                {
                    "name": format_window_title(primary.get("windowMinutes")),
                    **primary,
                    "summary": format_limit_summary(primary),
                },
                {
                    "name": format_window_title(secondary.get("windowMinutes")),
                    **secondary,
                    "summary": format_limit_summary(secondary),
                },
            ]
            if code_review.get("windowMinutes") or code_review.get("usedPercent") is not None or code_review.get("resetAtMs"):
                limits.append({
                    "name": "Code review",
                    **code_review,
                    "summary": format_limit_summary(code_review),
                })
            additional = payload.get("additional_rate_limits")
            if isinstance(additional, list):
                for entry in additional:
                    if not isinstance(entry, dict):
                        continue
                    if entry.get("limit_name") == "code_review_rate_limit":
                        continue
                    mapped = map_usage_window((entry.get("rate_limit") or {}).get("primary_window") if isinstance(entry.get("rate_limit"), dict) else None)
                    limits.append(
                        {
                            "name": ensure_text(entry.get("limit_name")) or ensure_text(entry.get("metered_feature")) or "Additional limit",
                            **mapped,
                            "summary": format_limit_summary(mapped),
                        }
                    )

            credits = payload.get("credits") if isinstance(payload.get("credits"), dict) else {}
            credits_summary = None
            if credits:
                if ensure_bool(credits.get("unlimited")):
                    credits_summary = "unlimited"
                else:
                    credits_summary = ensure_text(credits.get("balance"))
                    if not credits_summary and ensure_bool(credits.get("has_credits")):
                        credits_summary = "available"

            account_payload.update(
                {
                    "status": "ok",
                    "planType": ensure_text(payload.get("plan_type")),
                    "credits": credits_summary,
                    "limits": limits,
                }
            )
            successes += 1
        except Exception as error:
            account_payload.update({"status": "error", "error": str(error)})
        accounts.append(account_payload)

    status = "ok" if successes == len(accounts) else "partial" if successes > 0 else "error"
    return {
        "status": status,
        "message": None,
        "accounts": accounts,
    }


def parse_copilot_report(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise RuntimeError("report has no header row")
        fields = {field.strip() for field in reader.fieldnames if field}
        required = {"date", "quantity"}
        missing = required - fields
        if missing:
            raise RuntimeError(f"report is missing required column(s): {', '.join(sorted(missing))}")

        rows: List[Dict[str, Any]] = []
        latest_month: Optional[Tuple[int, int]] = None
        for raw in reader:
            if not raw:
                continue
            date_text = ensure_text(raw.get("date"))
            if not date_text:
                continue
            try:
                date_value = datetime.fromisoformat(date_text.replace("Z", "+00:00"))
            except ValueError:
                continue
            if date_value.tzinfo is None:
                date_value = date_value.replace(tzinfo=timezone.utc)
            month_key = (date_value.year, date_value.month)
            if latest_month is None or month_key > latest_month:
                latest_month = month_key
            rows.append({"row": raw, "date": date_value, "month": month_key})

    if latest_month is None:
        raise RuntimeError("report contains no usable rows")

    monthly_rows = [entry for entry in rows if entry["month"] == latest_month]
    total_used = 0.0
    total_quota = None
    over_quota = 0.0
    by_model: Dict[str, float] = {}
    by_user: Dict[str, float] = {}

    for entry in monthly_rows:
        row = entry["row"]
        quantity_raw = ensure_text(row.get("quantity"))
        if quantity_raw is None:
            continue
        try:
            quantity = float(quantity_raw)
        except ValueError:
            continue
        total_used += quantity

        model = ensure_text(row.get("model")) or "unknown"
        by_model[model] = by_model.get(model, 0.0) + quantity

        username = ensure_text(row.get("username")) or "unknown"
        by_user[username] = by_user.get(username, 0.0) + quantity

        quota_raw = ensure_text(row.get("total_monthly_quota"))
        if quota_raw is not None:
            try:
                quota = float(quota_raw)
            except ValueError:
                quota = None
            if quota is not None:
                total_quota = quota if total_quota is None else max(total_quota, quota)

        exceeds = ensure_text(row.get("exceeds_quota"))
        if exceeds and exceeds.upper() == "TRUE":
            over_quota += quantity

    remaining = None if total_quota is None else max(0.0, total_quota - total_used)
    month_start = datetime(latest_month[0], latest_month[1], 1, tzinfo=timezone.utc)
    if latest_month[1] == 12:
        reset_at = datetime(latest_month[0] + 1, 1, 1, tzinfo=timezone.utc)
    else:
        reset_at = datetime(latest_month[0], latest_month[1] + 1, 1, tzinfo=timezone.utc)

    def top_entries(values: Dict[str, float]) -> List[Dict[str, Any]]:
        ordered = sorted(values.items(), key=lambda item: (-item[1], item[0]))
        return [{"name": name, "quantity": quantity} for name, quantity in ordered]

    return {
        "status": "ok",
        "source": "report",
        "reportPath": str(path),
        "month": month_start.strftime("%Y-%m"),
        "requestsUsed": total_used,
        "monthlyQuota": total_quota,
        "remaining": remaining,
        "overQuota": over_quota,
        "resetAt": reset_at.strftime("%Y-%m-%d %H:%M UTC"),
        "byModel": top_entries(by_model),
        "byUser": top_entries(by_user),
    }


def get_github_auth_token() -> Tuple[Optional[str], Optional[str]]:
    for env_name in ("GH_TOKEN", "GITHUB_TOKEN"):
        value = ensure_text(os.environ.get(env_name))
        if value:
            return value, None

    try:
        completed = subprocess.run(
            ["gh", "auth", "token"],
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except Exception as error:
        return None, f"failed to run gh auth token: {error}"

    token = ensure_text(completed.stdout)
    if completed.returncode != 0 or not token:
        stderr = ensure_text(completed.stderr)
        if stderr:
            return None, f"gh auth token failed: {stderr}"
        return None, "gh auth token failed"
    return token, None


def fetch_copilot_live_usage() -> Dict[str, Any]:
    token, error = get_github_auth_token()
    if error:
        raise RuntimeError(error)
    if not token:
        raise RuntimeError("no GitHub auth token available")

    request = urllib.request.Request(
        COPILOT_USER_INFO_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "opencode-provider-usage",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as http_error:
        body = http_error.read().decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"GitHub Copilot user lookup failed: HTTP {http_error.code} {body[:200]}") from http_error
    except Exception as request_error:
        raise RuntimeError(f"GitHub Copilot user lookup failed: {request_error}") from request_error

    if not isinstance(payload, dict):
        raise RuntimeError("unexpected GitHub Copilot user payload")

    quotas: List[Dict[str, Any]] = []
    quota_snapshots = payload.get("quota_snapshots")
    if isinstance(quota_snapshots, dict):
        for quota_id, raw in quota_snapshots.items():
            if not isinstance(raw, dict):
                continue
            entitlement = raw.get("entitlement") if isinstance(raw.get("entitlement"), (int, float)) else None
            remaining = raw.get("remaining") if isinstance(raw.get("remaining"), (int, float)) else None
            percent_remaining = raw.get("percent_remaining") if isinstance(raw.get("percent_remaining"), (int, float)) else None
            unlimited = ensure_bool(raw.get("unlimited"))
            used = None
            if entitlement is not None and remaining is not None and not unlimited:
                used = max(0.0, float(entitlement) - float(remaining))
            quotas.append(
                {
                    "quotaId": quota_id,
                    "entitlement": float(entitlement) if entitlement is not None else None,
                    "remaining": float(remaining) if remaining is not None else None,
                    "used": used,
                    "percentRemaining": float(percent_remaining) if percent_remaining is not None else None,
                    "overageCount": float(raw.get("overage_count")) if isinstance(raw.get("overage_count"), (int, float)) else None,
                    "overagePermitted": ensure_bool(raw.get("overage_permitted")),
                    "unlimited": unlimited,
                    "timestampUtc": ensure_text(raw.get("timestamp_utc")),
                }
            )

    quotas.sort(key=lambda item: (item.get("unlimited") is True, item.get("quotaId") != "premium_interactions", item.get("quotaId") or ""))

    return {
        "status": "ok",
        "source": "github-internal-user",
        "login": ensure_text(payload.get("login")),
        "accessTypeSku": ensure_text(payload.get("access_type_sku")),
        "copilotPlan": ensure_text(payload.get("copilot_plan")),
        "chatEnabled": ensure_bool(payload.get("chat_enabled")),
        "resetAt": ensure_text(payload.get("quota_reset_date_utc")) or ensure_text(payload.get("quota_reset_date")),
        "quotas": quotas,
    }


def summarize_copilot(report_path: Optional[str]) -> Dict[str, Any]:
    if not report_path:
        try:
            summary = fetch_copilot_live_usage()
        except Exception as error:
            return {
                "status": "manual",
                "message": f"Live Copilot usage lookup failed: {error}",
                "docsUrl": COPILOT_DOCS_URL,
                "billingUrl": COPILOT_MONITORING_URL,
            }

        summary["docsUrl"] = COPILOT_DOCS_URL
        summary["billingUrl"] = COPILOT_MONITORING_URL
        return summary

    path = Path(os.path.expanduser(report_path)).resolve()
    if not path.exists() or not path.is_file():
        return {
            "status": "error",
            "message": f"Copilot report not found: {path}",
            "docsUrl": COPILOT_DOCS_URL,
            "billingUrl": COPILOT_MONITORING_URL,
        }

    try:
        summary = parse_copilot_report(path)
    except Exception as error:
        return {
            "status": "error",
            "message": str(error),
            "docsUrl": COPILOT_DOCS_URL,
            "billingUrl": COPILOT_MONITORING_URL,
        }

    summary["docsUrl"] = COPILOT_DOCS_URL
    summary["billingUrl"] = COPILOT_MONITORING_URL
    return summary


def collect_codex_section(args: argparse.Namespace, project_root: Path) -> Dict[str, Any]:
    return summarize_codex(project_root, include_sensitive=args.include_sensitive)


def collect_copilot_section(args: argparse.Namespace, project_root: Path) -> Dict[str, Any]:
    del project_root
    return summarize_copilot(args.copilot_report)


SECTION_COLLECTORS = {
    "codex": collect_codex_section,
    "copilot": collect_copilot_section,
}


def requested_providers(provider: str) -> List[str]:
    if provider == "auto":
        return ["codex", "copilot"]
    return [provider]


def format_number(value: Optional[float]) -> str:
    if value is None:
        return "unknown"
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def stale_note(section: Any) -> Optional[str]:
    if not isinstance(section, dict):
        return None
    meta = section.get("_meta") if isinstance(section.get("_meta"), dict) else {}
    if not ensure_bool(meta.get("stale")):
        return None
    cached_at = ensure_text(meta.get("cachedAt"))
    if cached_at:
        return f"using cached data from {cached_at}"
    return "using cached data"


def format_text(result: Dict[str, Any]) -> str:
    lines: List[str] = []

    codex = result.get("codex")
    if isinstance(codex, dict):
        lines.append("Codex")
        status = codex.get("status")
        message = codex.get("message")
        accounts = codex.get("accounts") or []
        codex_stale = stale_note(codex)
        if status == "unavailable":
            lines.append(f"- {message}")
        else:
            if codex_stale:
                lines.append(f"- {codex_stale}")
            for account in accounts:
                if not isinstance(account, dict):
                    continue
                header = account.get("label") or "Account"
                source = account.get("source")
                active_suffix = " [active]" if account.get("isActive") else ""
                lines.append(f"- {header}{active_suffix}")
                if source:
                    lines.append(f"  source: {source}")
                if account.get("planType"):
                    lines.append(f"  plan: {account['planType']}")
                if account.get("credits"):
                    lines.append(f"  credits: {account['credits']}")
                if account.get("status") == "error":
                    lines.append(f"  error: {account.get('error')}")
                    continue
                for limit in account.get("limits") or []:
                    if not isinstance(limit, dict):
                        continue
                    left_percent = limit.get("leftPercent") if isinstance(limit.get("leftPercent"), (int, float)) else None
                    lines.append(f"  {limit.get('name', 'limit')}: {format_bar(left_percent)} {limit.get('summary', 'unavailable')}")
        lines.append("")

    copilot = result.get("copilot")
    if isinstance(copilot, dict):
        lines.append("Copilot")
        status = copilot.get("status")
        copilot_stale = stale_note(copilot)
        if status == "ok":
            if copilot_stale:
                lines.append(f"- {copilot_stale}")
            if copilot.get("source") == "github-internal-user":
                if copilot.get("login"):
                    lines.append(f"- User: {copilot.get('login')}")
                if copilot.get("copilotPlan") or copilot.get("accessTypeSku"):
                    plan_bits = []
                    if copilot.get("copilotPlan"):
                        plan_bits.append(str(copilot.get("copilotPlan")))
                    if copilot.get("accessTypeSku"):
                        plan_bits.append(str(copilot.get("accessTypeSku")))
                    lines.append(f"- Plan: {' / '.join(plan_bits)}")
                if copilot.get("resetAt"):
                    lines.append(f"- Resets: {copilot.get('resetAt')}")
                for quota in copilot.get("quotas") or []:
                    if not isinstance(quota, dict):
                        continue
                    quota_id = quota.get("quotaId") or "quota"
                    quota_name = {
                        "premium_interactions": "Premium requests",
                        "chat": "Chat quota",
                        "completions": "Completions",
                    }.get(quota_id, str(quota_id))
                    if quota.get("unlimited"):
                        lines.append(f"- {quota_name}: unlimited")
                        continue
                    percent_remaining = quota.get("percentRemaining") if isinstance(quota.get("percentRemaining"), (int, float)) else None
                    remaining = quota.get("remaining")
                    entitlement = quota.get("entitlement")
                    detail = ""
                    if remaining is not None and entitlement is not None:
                        detail = f" ({format_number(remaining)} / {format_number(entitlement)} remaining)"
                    overage_text = ""
                    if quota.get("overagePermitted"):
                        overage_text = ", overage allowed"
                    lines.append(f"- {quota_name}: {format_bar(percent_remaining)} {format_number(percent_remaining)}% left{detail}{overage_text}")
            else:
                lines.append(f"- Month: {copilot.get('month')}")
                remaining = copilot.get("remaining")
                monthly_quota = copilot.get("monthlyQuota")
                remaining_percent = None
                if isinstance(remaining, (int, float)) and isinstance(monthly_quota, (int, float)) and monthly_quota > 0:
                    remaining_percent = (float(remaining) / float(monthly_quota)) * 100.0
                lines.append(
                    f"- Premium requests: {format_number(copilot.get('requestsUsed'))}"
                    + (
                        f" / {format_number(monthly_quota)}" if monthly_quota is not None else ""
                    )
                )
                if remaining is not None:
                    lines.append(f"- Remaining: {format_bar(remaining_percent)} {format_number(remaining)}")
                if copilot.get("overQuota"):
                    lines.append(f"- Over quota: {format_number(copilot.get('overQuota'))}")
                lines.append(f"- Resets: {copilot.get('resetAt')}")
                by_model = copilot.get("byModel") or []
                if by_model:
                    top = ", ".join(
                        f"{entry.get('name')}={format_number(entry.get('quantity'))}" for entry in by_model[:5] if isinstance(entry, dict)
                    )
                    if top:
                        lines.append(f"- By model: {top}")
        else:
            lines.append(f"- {copilot.get('message')}")
            lines.append(f"- Docs: {copilot.get('docsUrl')}")
            lines.append(f"- Billing UI: {copilot.get('billingUrl')}")

    return "\n".join(lines).strip()


def build_result(args: argparse.Namespace) -> Dict[str, Any]:
    providers = requested_providers(args.provider)
    live_result: Dict[str, Any] = {
        "generatedAt": utc_now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "provider": args.provider,
    }
    project_root = Path(args.project_root).resolve()
    for provider in providers:
        collector = SECTION_COLLECTORS[provider]
        live_result[provider] = collector(args, project_root)

    cache_path = default_cache_path()
    cached = load_cache(cache_path)
    result = apply_cached_fallbacks(copy.deepcopy(live_result), cached, providers)
    try:
        persist_cache(cache_path, live_result, providers)
    except Exception:
        pass

    return result


def main() -> int:
    args = parse_args()
    try:
        result = build_result(args)
    except Exception as error:
        if args.format == "json":
            print(json.dumps({"status": "error", "message": str(error)}, indent=2))
        else:
            print(f"Error: {error}")
        return 1

    if args.format == "json":
        print(json.dumps(result, indent=2))
    else:
        print(format_text(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
