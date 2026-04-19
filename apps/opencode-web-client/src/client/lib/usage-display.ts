import type { UsageDetails } from '../../shared/types.js';

export interface UsageHighlight {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'success' | 'warning' | 'muted';
}

const WINDOW_MINUTES_PATTERN = /windowminutes/i;
const TIMESTAMP_PATTERN = /(timestamp|generatedat|updatedat|createdat|expiresat|resetat)(ms)?$/i;

export function getUsageHighlights(usage?: UsageDetails): UsageHighlight[] {
  if (!usage || usage.status !== 'ok') return [];
  const highlights: UsageHighlight[] = [];
  const data = usage.data as Record<string, any>;

  const codexLimits = data.codex?.accounts?.[0]?.limits;
  if (Array.isArray(codexLimits)) {
    for (const limit of codexLimits.slice(0, 3)) {
      const leftPercent = typeof limit.leftPercent === 'number' ? limit.leftPercent : null;
      const resetAt = formatUsageTimestamp(limit.resetAtMs);
      const windowLabel = formatUsageWindow(limit.windowMinutes, limit.name);
      highlights.push({
        id: `codex:${limit.name}`,
        label: `Codex ${windowLabel}`,
        value: leftPercent != null ? `${Math.round(leftPercent)}% left` : 'Available',
        detail: resetAt ? `Resets ${resetAt}` : 'Codex quota window',
        tone: leftPercent != null && leftPercent < 25 ? 'warning' : 'success',
      });
    }
  }

  const copilotQuota = Array.isArray(data.copilot?.quotas)
    ? data.copilot.quotas.find((quota: any) => quota.quotaId === 'premium_interactions')
    : null;
  if (copilotQuota) {
    const remaining = typeof copilotQuota.remaining === 'number' ? Math.round(copilotQuota.remaining) : null;
    const entitlement = typeof copilotQuota.entitlement === 'number' ? Math.round(copilotQuota.entitlement) : null;
    const percentRemaining = typeof copilotQuota.percentRemaining === 'number'
      ? Math.round(copilotQuota.percentRemaining)
      : null;
    const resetAt = formatUsageTimestamp(data.copilot?.resetAt);
    highlights.push({
      id: 'copilot:premium',
      label: 'Copilot premium',
      value: remaining != null && entitlement != null ? `${remaining}/${entitlement} left` : 'Quota available',
      detail: [
        percentRemaining != null ? `${percentRemaining}% remaining this cycle` : null,
        resetAt ? `resets ${resetAt}` : null,
      ].filter(Boolean).join(' · ') || 'Premium interactions quota',
      tone: percentRemaining != null && percentRemaining < 25 ? 'warning' : 'success',
    });
  }

  return highlights;
}

export function getUsageBadgeSummary(usage?: UsageDetails): string | null {
  const [first] = getUsageHighlights(usage);
  if (!first) return null;
  return `${first.label} ${first.value}`;
}

export function formatUsageValue(label: string, value: unknown): string {
  if (typeof value === 'number' && WINDOW_MINUTES_PATTERN.test(label)) {
    return formatUsageWindow(value);
  }

  if (TIMESTAMP_PATTERN.test(label)) {
    const formatted = formatUsageTimestamp(value);
    if (formatted) return formatted;
  }

  return formatPrimitive(value);
}

export function formatUsageTimestamp(value: unknown): string | null {
  const date = toDate(value);
  if (!date) return null;

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const withinWeek = Math.abs(date.getTime() - now.getTime()) < 6 * 24 * 60 * 60 * 1000;
  const dayLabel = sameDay
    ? 'Today'
    : withinWeek
      ? new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)
      : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  const timezoneLabel = new Intl.DateTimeFormat(undefined, {
    timeZoneName: 'short',
  }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value;

  return `${dayLabel} ${timeLabel}${timezoneLabel ? ` ${timezoneLabel}` : ''}`;
}

export function formatUsageWindow(value: unknown, fallback?: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return typeof fallback === 'string' && fallback.trim().length > 0 ? fallback : 'quota window';
  }

  if (value === 300) return '5h window';
  if (value === 10080) return 'Weekly window';
  if (value % 1440 === 0) return `${value / 1440}d window`;
  if (value % 60 === 0) return `${value / 60}h window`;
  return `${value}m window`;
}

function formatPrimitive(value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toDate(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}
