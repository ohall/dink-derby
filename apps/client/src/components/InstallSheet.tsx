import { Sheet } from './Sheet';
import type { InstallPlatform } from './useInstallPrompt';

export function InstallSheet({ platform, onClose }: { platform: InstallPlatform; onClose: () => void }) {
  return (
    <Sheet titleId="install-sheet-title" onClose={onClose} closeLabel="Done">
      <h2 id="install-sheet-title">Install Dink Derby</h2>
      <p className="sheet__intro">Use your browser’s menu to install this app.</p>
      <ol className="install-steps">
        {platform === 'ios' ? <>
          <li><span>In Safari, tap <strong>Share</strong> (it may be inside the <strong>More ···</strong> menu).</span></li>
          <li><span>Choose <strong>Add to Home Screen</strong>. If it is missing, look under <strong>Edit Actions</strong>.</span></li>
          <li><span>Turn on <strong>Open as Web App</strong> if shown, then tap <strong>Add</strong>.</span></li>
        </> : platform === 'android' ? <>
          <li><span>In Chrome, open the <strong>More ⋮</strong> menu beside the address bar.</span></li>
          <li><span>Choose <strong>Install and create shortcut</strong> or <strong>Add to Home screen</strong>, then <strong>Install</strong>.</span></li>
          <li><span>Confirm the installation, then open Dink Derby from your home screen or app list.</span></li>
        </> : <>
          <li><span>In Chrome or Edge, look for the <strong>Install</strong> icon in the address bar, or the install option in the browser’s menu.</span></li>
          <li><span>In Safari on a Mac, choose <strong>File → Add to Dock</strong>.</span></li>
        </>}
      </ol>
      <p className="form-help">No install option? Open dinkderby.com directly in {platform === 'ios' ? 'Safari' : platform === 'android' ? 'Chrome' : 'Chrome, Edge, or Safari'}, not inside another app or a private tab. If it is already installed, open its app icon.</p>
      <p className="form-help">You can keep using Dink Derby in this browser without installing.</p>
      <p className="form-help">Some browsers give installed apps separate storage. If your derbies don’t appear in the app, return to this browser and keep its data.</p>
    </Sheet>
  );
}
