import { Download } from 'lucide-react';
import type { InstallState } from './useInstallPrompt';

export function InstallButton({ install, onShowInstructions }: { install: InstallState; onShowInstructions: () => void }) {
  if (install.kind === 'native') {
    return (
      <button className="install-button" type="button" onClick={() => void install.prompt()} title="Install Dink Derby on this device">
        <Download size={18} /><span>Install</span>
      </button>
    );
  }
  if (install.kind === 'ios') {
    return (
      <button className="install-button" type="button" onClick={onShowInstructions} title="Add Dink Derby to your home screen">
        <Download size={18} /><span>Install</span>
      </button>
    );
  }
  return null;
}
