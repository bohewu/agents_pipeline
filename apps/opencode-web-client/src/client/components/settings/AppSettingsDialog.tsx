import React from 'react';
import {
  AUTO_SLEEP_OPTIONS,
  COMPOSER_DENSITY_OPTIONS,
  INDICATOR_STYLE_OPTIONS,
  POLL_INTERVAL_OPTIONS,
  SESSION_VIEW_OPTIONS,
} from '../../lib/app-settings.js';
import { useStore } from '../../runtime/store.js';

export function AppSettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings, resetSettings } = useStore();

  return (
    <div className="oc-modal-backdrop" onClick={onClose}>
      <div className="oc-settings-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="oc-settings-dialog__header">
          <div>
            <div className="oc-settings-dialog__eyebrow">Settings</div>
            <h2 className="oc-settings-dialog__title">App preferences</h2>
            <p className="oc-settings-dialog__subtitle">Changes save automatically for this browser.</p>
          </div>
          <button type="button" onClick={onClose} className="oc-icon-button oc-icon-button--soft" aria-label="Close settings">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="oc-settings-grid">
          <section className="oc-settings-section">
            <div className="oc-settings-section__title">Behavior</div>
            <SettingsRow
              label="Inactive workspace polling"
              help="Refresh background workspace activity without keeping every repo live-subscribed."
            >
              <select
                value={String(settings.inactiveWorkspacePollIntervalMs)}
                onChange={(event) => updateSettings({ inactiveWorkspacePollIntervalMs: Number(event.target.value) as typeof settings.inactiveWorkspacePollIntervalMs })}
                className="oc-settings-select"
              >
                {POLL_INTERVAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </SettingsRow>

            <SettingsRow
              label="Inactive workspace auto-sleep"
              help="Stop inactive runtimes after no background activity for the selected time."
            >
              <select
                value={String(settings.inactiveWorkspaceAutoSleepMinutes)}
                onChange={(event) => updateSettings({ inactiveWorkspaceAutoSleepMinutes: Number(event.target.value) as typeof settings.inactiveWorkspaceAutoSleepMinutes })}
                className="oc-settings-select"
              >
                {AUTO_SLEEP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </SettingsRow>

            <SettingsRow
              label="Sessions default view"
              help="Used for workspaces that do not already have a saved sidebar filter."
            >
              <select
                value={settings.sessionsDefaultView}
                onChange={(event) => updateSettings({ sessionsDefaultView: event.target.value as typeof settings.sessionsDefaultView })}
                className="oc-settings-select"
              >
                {SESSION_VIEW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </SettingsRow>
          </section>

          <section className="oc-settings-section">
            <div className="oc-settings-section__title">Appearance</div>
            <SettingsRow
              label="Workspace activity indicator"
              help="Choose whether inactive workspace activity shows as a dot only or a dot with a small label."
            >
              <select
                value={settings.workspaceIndicatorStyle}
                onChange={(event) => updateSettings({ workspaceIndicatorStyle: event.target.value as typeof settings.workspaceIndicatorStyle })}
                className="oc-settings-select"
              >
                {INDICATOR_STYLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </SettingsRow>

            <SettingsRow
              label="Composer density"
              help="Switch between a tighter composer and a more relaxed input area."
            >
              <select
                value={settings.composerDensity}
                onChange={(event) => updateSettings({ composerDensity: event.target.value as typeof settings.composerDensity })}
                className="oc-settings-select"
              >
                {COMPOSER_DENSITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </SettingsRow>
          </section>
        </div>

        <div className="oc-settings-dialog__footer">
          <button type="button" onClick={resetSettings} className="oc-link-button">Reset defaults</button>
          <button type="button" onClick={onClose} className="oc-primary-button">Done</button>
        </div>
      </div>
    </div>
  );
}

function SettingsRow({
  label,
  help,
  children,
}: React.PropsWithChildren<{ label: string; help: string }>) {
  return (
    <label className="oc-settings-row">
      <div className="oc-settings-row__copy">
        <span className="oc-settings-row__label">{label}</span>
        <span className="oc-settings-row__help">{help}</span>
      </div>
      <div className="oc-settings-row__control">{children}</div>
    </label>
  );
}
