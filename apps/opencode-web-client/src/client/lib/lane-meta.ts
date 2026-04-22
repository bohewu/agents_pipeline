import type { LaneAttribution, LaneContext } from '../../shared/types.js';

export interface LaneDisplayDetails {
  laneId?: string;
  kind?: LaneContext['kind'];
  label: string | null;
  detail: string | null;
}

export function describeLaneAttribution(lane?: LaneAttribution): LaneDisplayDetails {
  const laneId = resolveLaneId(lane);
  const laneContext = lane?.laneContext ?? parseLaneId(laneId);

  if (!laneContext) {
    return {
      laneId,
      label: laneId ? `Lane · ${laneId}` : null,
      detail: null,
    };
  }

  if (laneContext.kind === 'branch') {
    return {
      laneId: laneId ?? `branch:${laneContext.branch}`,
      kind: 'branch',
      label: `Branch · ${laneContext.branch}`,
      detail: null,
    };
  }

  return {
    laneId: laneId ?? `worktree:${laneContext.worktreePath}`,
    kind: 'worktree',
    label: laneContext.branch?.trim()
      ? `Worktree · ${laneContext.branch.trim()}`
      : `Worktree · ${laneContext.worktreePath}`,
    detail: laneContext.branch?.trim()
      ? `Path · ${laneContext.worktreePath}`
      : null,
  };
}

export function resolveLaneId(lane?: LaneAttribution): string | undefined {
  return lane?.laneId ?? deriveLaneId(lane?.laneContext);
}

function deriveLaneId(laneContext: LaneContext | undefined): string | undefined {
  if (!laneContext) return undefined;
  if (laneContext.kind === 'branch') {
    return `branch:${laneContext.branch}`;
  }

  return `worktree:${laneContext.worktreePath}`;
}

function parseLaneId(laneId?: string): LaneContext | undefined {
  if (!laneId) return undefined;

  if (laneId.startsWith('branch:')) {
    return {
      kind: 'branch',
      branch: laneId.slice('branch:'.length),
    };
  }

  if (laneId.startsWith('worktree:')) {
    return {
      kind: 'worktree',
      worktreePath: laneId.slice('worktree:'.length),
    };
  }

  return undefined;
}
