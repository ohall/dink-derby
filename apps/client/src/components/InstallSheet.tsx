import { Plus, Share } from 'lucide-react';
import { Sheet } from './Sheet';

export function InstallSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet titleId="install-sheet-title" onClose={onClose} closeLabel="Not now">
      <h2 id="install-sheet-title">Add to your home screen</h2>
      <p className="sheet__intro">
        Launch Dink Derby like a real app at the lake — full screen, one tap, no browser. Two taps in Safari:
      </p>
      <ol className="install-steps">
        <li>
          <span className="install-steps__icon"><Share size={22} /></span>
          <span>Tap the <strong>Share</strong> button in Safari’s toolbar.</span>
        </li>
        <li>
          <span className="install-steps__icon"><Plus size={22} /></span>
          <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
        </li>
      </ol>
      <p className="form-help">Works offline either way — installing just gets you there faster.</p>
    </Sheet>
  );
}
