import { Download } from 'lucide-react';
import type { InstallState } from './useInstallPrompt';

export function InstallButton({ install, onShowInstructions, className = 'install-button' }: { install: InstallState; onShowInstructions: () => void; className?: string }) {
  if (install.kind === 'installed' || install.kind === 'checking') return null;
  const onClick = async () => {
    if (install.kind === 'prompting') return;
    if (install.kind === 'native' && await install.prompt()) return;
    onShowInstructions();
  };
  return (
    <button className={className} type="button" disabled={install.kind === 'prompting'} onClick={() => void onClick()} title="Install Dink Derby on this device">
      <Download size={18} aria-hidden="true" /><span>{install.kind === 'prompting' ? 'Installing…' : 'Install app'}</span>
    </button>
  );
}
