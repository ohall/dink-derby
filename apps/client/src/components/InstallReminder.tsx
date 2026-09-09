import { InstallButton } from './InstallButton';
import type { InstallState } from './useInstallPrompt';

export function InstallReminder({ install, onShowInstructions, onDismiss }: {
  install: InstallState; onShowInstructions: () => void; onDismiss: () => void;
}) {
  return <aside className="install-reminder page-width" aria-label="Install Dink Derby">
    <div><strong>Install Dink Derby</strong><p>Add it to your home screen for quick access.</p></div>
    <div className="install-reminder__actions">
      <InstallButton install={install} onShowInstructions={onShowInstructions} className="button button--primary" />
      <button className="text-button" type="button" onClick={onDismiss}>Not now</button>
    </div>
  </aside>;
}
