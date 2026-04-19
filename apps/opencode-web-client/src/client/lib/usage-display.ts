import type { UsageDetails } from '../../shared/types.js';

export interface UsageHighlight {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'success' | 'warning' | 'muted';
}

export function getUsageHighlights(usage?: UsageDetails): UsageHighlight[] {
  if (!usage || usage.status !== 'ok') return [];
  const highlights: UsageHighlight[] = [];
  const data = usage.data as Record<string, any>;

  const codexLimits = data.codex?.accounts?.[0]?.limits;
  if (Array.isArray(codexLimits)) {
    for (const limit of codexLimits.slice(0, 2)) {
      const leftPercent = typeof limit.leftPercent === 'number' ? limit.leftPercent : null;
      highlights.push({
        id: `codex:${limit.name}`,
        label: `Codex ${String(limit.name).replace(/\s+limit$/i, '')}`,
        value: leftPercent != null ? `${Math.round(leftPercent)}% left` : 'Available',
        detail: typeof limit.summary === 'string' ? limit.summary : 'Codex quota window',
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
    highlights.push({
      id: 'copilot:premium',
      label: 'Copilot premium',
      value: remaining != null && entitlement != null ? `${remaining}/${entitlement} left` : 'Quota available',
      detail: percentRemaining != null ? `${percentRemaining}% remaining this cycle` : 'Premium interactions quota',
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
