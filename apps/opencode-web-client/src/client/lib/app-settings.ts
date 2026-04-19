export type WorkspaceIndicatorStyle = 'dot' | 'dot-label';
export type SessionsDefaultView = 'all' | 'roots' | 'branches';
export type ComposerDensity = 'compact' | 'comfortable';

export interface AppSettings {
  inactiveWorkspacePollIntervalMs: 15000 | 30000 | 60000;
  inactiveWorkspaceAutoSleepMinutes: 0 | 15 | 30 | 60;
  workspaceIndicatorStyle: WorkspaceIndicatorStyle;
  sessionsDefaultView: SessionsDefaultView;
  composerDensity: ComposerDensity;
  showReasoningSummaries: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  inactiveWorkspacePollIntervalMs: 15000,
  inactiveWorkspaceAutoSleepMinutes: 30,
  workspaceIndicatorStyle: 'dot-label',
  sessionsDefaultView: 'all',
  composerDensity: 'comfortable',
  showReasoningSummaries: false,
};

export const POLL_INTERVAL_OPTIONS: Array<{ value: AppSettings['inactiveWorkspacePollIntervalMs']; label: string }> = [
  { value: 15000, label: 'Every 15 seconds' },
  { value: 30000, label: 'Every 30 seconds' },
  { value: 60000, label: 'Every 60 seconds' },
];

export const AUTO_SLEEP_OPTIONS: Array<{ value: AppSettings['inactiveWorkspaceAutoSleepMinutes']; label: string }> = [
  { value: 0, label: 'Off' },
  { value: 15, label: 'After 15 minutes' },
  { value: 30, label: 'After 30 minutes' },
  { value: 60, label: 'After 60 minutes' },
];

export const INDICATOR_STYLE_OPTIONS: Array<{ value: AppSettings['workspaceIndicatorStyle']; label: string }> = [
  { value: 'dot', label: 'Dot only' },
  { value: 'dot-label', label: 'Dot + label' },
];

export const SESSION_VIEW_OPTIONS: Array<{ value: AppSettings['sessionsDefaultView']; label: string }> = [
  { value: 'all', label: 'All sessions' },
  { value: 'roots', label: 'Chats only' },
  { value: 'branches', label: 'Branches first' },
];

export const COMPOSER_DENSITY_OPTIONS: Array<{ value: AppSettings['composerDensity']; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
];

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_APP_SETTINGS;
  }

  const candidate = value as Partial<AppSettings>;

  return {
    inactiveWorkspacePollIntervalMs: POLL_INTERVAL_OPTIONS.some((option) => option.value === candidate.inactiveWorkspacePollIntervalMs)
      ? candidate.inactiveWorkspacePollIntervalMs!
      : DEFAULT_APP_SETTINGS.inactiveWorkspacePollIntervalMs,
    inactiveWorkspaceAutoSleepMinutes: AUTO_SLEEP_OPTIONS.some((option) => option.value === candidate.inactiveWorkspaceAutoSleepMinutes)
      ? candidate.inactiveWorkspaceAutoSleepMinutes!
      : DEFAULT_APP_SETTINGS.inactiveWorkspaceAutoSleepMinutes,
    workspaceIndicatorStyle: INDICATOR_STYLE_OPTIONS.some((option) => option.value === candidate.workspaceIndicatorStyle)
      ? candidate.workspaceIndicatorStyle!
      : DEFAULT_APP_SETTINGS.workspaceIndicatorStyle,
    sessionsDefaultView: SESSION_VIEW_OPTIONS.some((option) => option.value === candidate.sessionsDefaultView)
      ? candidate.sessionsDefaultView!
      : DEFAULT_APP_SETTINGS.sessionsDefaultView,
    composerDensity: COMPOSER_DENSITY_OPTIONS.some((option) => option.value === candidate.composerDensity)
      ? candidate.composerDensity!
      : DEFAULT_APP_SETTINGS.composerDensity,
    showReasoningSummaries: typeof candidate.showReasoningSummaries === 'boolean'
      ? candidate.showReasoningSummaries
      : DEFAULT_APP_SETTINGS.showReasoningSummaries,
  };
}
