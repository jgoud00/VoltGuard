import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import {
  Check,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  X,
  ArrowRight,
  CircleHelp,
} from 'lucide-react';
import { MODES, validSimulation } from '../../../shared/telemetry.js';
import { profiles, scenarios } from '../format.js';
export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}) {
  return (
    <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger className="select-trigger" aria-label={label}>
        <Select.Value />
        <Select.Icon>
          <ChevronDown size={15} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="select-content"
          position="popper"
          sideOffset={6}
        >
          <Select.ScrollUpButton className="select-scroll">
            <ChevronUp size={15} />
          </Select.ScrollUpButton>
          <Select.Viewport>
            {Object.entries(options).map(([key, text]) => (
              <Select.Item key={key} value={key} className="select-item">
                <Select.ItemText>{text}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="select-scroll">
            <ChevronDown size={15} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
export function SimulationPanel({ config, busy, enabled, error, onChange }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          className="button secondary simulation-trigger"
          disabled={!enabled}
        >
          <FlaskConical size={15} />
          Simulation
          <ChevronDown size={13} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-heading">
            <span className="dialog-icon">
              <FlaskConical size={22} />
            </span>
            <Dialog.Close asChild>
              <button
                className="icon-button"
                aria-label="Close simulation settings"
              >
                <X size={19} />
              </button>
            </Dialog.Close>
          </div>
          <span className="overline">Test environment</span>
          <Dialog.Title>Simulation settings</Dialog.Title>
          <Dialog.Description>
            Publish a test signal through the same pipeline used by your device.
          </Dialog.Description>
          <div className="field">
            <label>Monitoring profile</label>
            <SelectField
              label="Monitoring profile"
              value={config.profile}
              options={Object.fromEntries(
                Object.entries(profiles).filter(([key]) => key !== 'LI_ION_2S'),
              )}
              disabled={busy}
              onChange={(profile) =>
                onChange({
                  profile,
                  mode: validSimulation(config.mode, profile)
                    ? config.mode
                    : 'NORMAL',
                })
              }
            />
          </div>
          <div className="scenario-heading">
            <label>Test scenario</label>
            <span>Current: {scenarios[config.mode] || config.mode}</span>
          </div>
          <div className="scenario-list">
            {MODES.map((mode) => (
              <button
                key={mode}
                disabled={busy || !validSimulation(mode, config.profile)}
                aria-pressed={config.mode === mode}
                className={`scenario-button ${config.mode === mode ? 'selected' : ''}`}
                onClick={() => onChange({ mode })}
              >
                <span className="scenario-radio">
                  {config.mode === mode && <span />}
                </span>
                {scenarios[mode]}
                {config.mode === mode && <Check size={15} />}
              </button>
            ))}
          </div>
          {error && <p className="dialog-error">{error}</p>}
          <div className="dialog-note">
            <CircleHelp size={16} />
            <p>
              Simulation generates representative readings. Battery estimates
              and AC power (PF = 1) are demonstration values.
            </p>
          </div>
          <Dialog.Close asChild>
            <button className="button primary dialog-done">
              Return to monitoring
              <ArrowRight size={15} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
