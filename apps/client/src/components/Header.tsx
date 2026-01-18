import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { getOrCreateDeviceId } from '../utils/device';
import { useEffect, useState } from 'react';
import { Fish, User, UserPlus } from 'lucide-react';

export function Header() {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    getOrCreateDeviceId().then(setDeviceId);
  }, []);

  const user = useLiveQuery(
    () => (deviceId ? db.users.get(deviceId) : undefined),
    [deviceId]
  );

  return (
    <header className="relative">
      {/* Dark forest green background */}
      <div className="absolute inset-0" style={{ background: 'var(--forest-green)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4)' }}></div>

      <div className="relative container mx-auto px-4 py-6 flex justify-between items-center max-w-6xl">
        <Link to="/" className="group flex items-center gap-3">
          <Fish size={48} strokeWidth={2.5} className="transform group-hover:scale-105 transition-transform duration-200" style={{ color: '#e8e8e6' }} />
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: '#e8e8e6' }}>
              DINK DERBY
            </h1>
            <p className="text-xs font-medium tracking-wider" style={{ color: 'var(--accent-green)' }}>SCORE BIG OR GO HOME</p>
          </div>
        </Link>

        <Link
          to="/profile"
          className="group relative"
        >
          <div className="px-5 py-3 rounded-sm flex items-center gap-3 transition-all duration-200 border shadow-md" style={{ background: 'rgba(0, 0, 0, 0.2)', borderColor: 'rgba(107, 143, 90, 0.3)' }}>
            {user ? (
              <>
                <div className="flex flex-col items-end">
                  <span className="font-bold truncate max-w-[120px]" style={{ color: '#e8e8e6' }}>{user.displayName}</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--accent-green)' }}>View Profile</span>
                </div>
                <div className="w-10 h-10 rounded-sm flex items-center justify-center shadow-md" style={{ background: 'var(--moss-green)', color: '#e8e8e6' }}>
                  <User size={24} strokeWidth={2.5} />
                </div>
              </>
            ) : (
              <>
                <span className="font-bold" style={{ color: '#e8e8e6' }}>Create Profile</span>
                <div className="w-10 h-10 rounded-sm flex items-center justify-center shadow-md" style={{ background: 'var(--rust-brown)', color: '#e8e8e6' }}>
                  <UserPlus size={24} strokeWidth={2.5} />
                </div>
              </>
            )}
          </div>
        </Link>
      </div>

      {/* Bottom border */}
      <div className="h-1" style={{ background: 'var(--moss-green)', boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.3)' }}></div>
    </header>
  );
}
