import { Fish, User as UserIcon } from 'lucide-react';
import type { User } from '@dink-derby/shared-types';
import { useSyncStatus } from '../sync/useSyncStatus';
import { InstallButton } from './InstallButton';
import type { InstallState } from './useInstallPrompt';

type BrandHeaderProps = {
  user?: User;
  onHome: () => void;
  onProfile: () => void;
  showSync?: boolean;
  install?: InstallState;
  onShowInstall?: () => void;
};

export function BrandHeader({ user, onHome, onProfile, showSync = true, install, onShowInstall }: BrandHeaderProps) {
  const sync = useSyncStatus();

  return (
    <header className="brand-header">
      <div className="brand-header__inner">
        <button className="brand-lockup" type="button" onClick={onHome} aria-label="Dink Derby home">
          <span className="brand-lockup__mark"><Fish size={26} strokeWidth={2.6} /></span>
          <span className="brand-lockup__type">
            <strong>DINK DERBY</strong>
          </span>
        </button>

        <div className="brand-header__actions">
          {showSync && <div className={`sync-pill sync-pill--${sync.phase}`} title={sync.message}>
            <i aria-hidden="true" />
            <span>{sync.phase === 'syncing' ? 'Syncing' : sync.phase === 'offline' ? 'Offline' : sync.phase === 'error' ? 'Not synced' : sync.pendingCount ? `${sync.pendingCount} pending` : 'Synced'}</span>
          </div>}
          {install && onShowInstall && <InstallButton install={install} onShowInstructions={onShowInstall} />}
          <button className="profile-button" type="button" onClick={onProfile} aria-label="Edit angler profile" title={user?.displayName || 'Profile'}>
            <UserIcon size={18} /><span>Profile</span>
          </button>
        </div>
      </div>
    </header>
  );
}
