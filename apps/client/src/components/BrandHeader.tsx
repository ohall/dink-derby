import { Fish, User as UserIcon } from 'lucide-react';
import type { User } from '@dink-derby/shared-types';
import { useSyncStatus } from '../sync/useSyncStatus';

type BrandHeaderProps = {
  user?: User;
  onHome: () => void;
  onProfile: () => void;
};

export function BrandHeader({ user, onHome, onProfile }: BrandHeaderProps) {
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
          <div className={`sync-pill sync-pill--${sync.phase}`} title={sync.message}>
            <i aria-hidden="true" />
            <span>{sync.phase === 'syncing' ? 'Syncing' : sync.pendingCount ? `${sync.pendingCount} pending` : sync.phase === 'idle' ? 'Synced' : 'Saved here'}</span>
          </div>
          <button className="profile-button" type="button" onClick={onProfile} aria-label="Edit angler profile">
            <span>{user?.displayName?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || <UserIcon size={18} />}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
