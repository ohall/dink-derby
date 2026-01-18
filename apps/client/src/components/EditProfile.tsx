import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { User, SyncOutboxItem } from '@dink-derby/shared-types';
import { getOrCreateDeviceId } from '../utils/device';
import { User as UserIcon, Fish, Trophy, Ruler, Award, Flame, Swords, Edit } from 'lucide-react';

export function EditProfile() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    getOrCreateDeviceId().then(setDeviceId);
  }, []);

  const currentUser = useLiveQuery(
    () => (deviceId ? db.users.get(deviceId) : undefined),
    [deviceId]
  );

  // Get user's catches for stats
  const userCatches = useLiveQuery(
    () => deviceId ? db.catches.where('userId').equals(deviceId).toArray() : undefined,
    [deviceId]
  );

  // Get user's derby participations
  const participations = useLiveQuery(
    () => deviceId ? db.derbyParticipants.where('userId').equals(deviceId).toArray() : undefined,
    [deviceId]
  );

  // Calculate achievement stats
  const stats = useMemo(() => {
    const totalCatches = userCatches?.length || 0;
    const totalDerbies = participations?.length || 0;
    const biggestCatch = userCatches?.reduce((max, c) => {
      const size = c.lengthInInches || c.weightInPounds || 0;
      return size > max ? size : max;
    }, 0) || 0;

    return { totalCatches, totalDerbies, biggestCatch };
  }, [userCatches, participations]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!deviceId) return;

    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const displayName = formData.get('displayName') as string;

    const now = new Date().toISOString();

    const user: User = {
      id: deviceId,
      displayName,
      createdAt: currentUser?.createdAt || now,
      updatedAt: now,
    };

    const outboxItem: SyncOutboxItem = {
      id: crypto.randomUUID(),
      entityType: 'user',
      entityId: deviceId,
      operation: currentUser ? 'update' : 'create',
      payload: user,
      createdAt: now,
    };

    try {
      await db.transaction('rw', db.users, db.syncOutbox, async () => {
        await db.users.put(user);
        await db.syncOutbox.add(outboxItem);
      });

      navigate({ to: '/' });
    } catch (err) {
      console.error('Failed to save profile:', err);
      alert('Failed to save profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!deviceId) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <UserIcon size={60} strokeWidth={2} className="mx-auto mb-4 animate-pulse" style={{ color: 'var(--accent-green)' }} />
        <div className="text-xl font-bold" style={{ color: 'var(--accent-green)' }}>Loading profile...</div>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Profile Header */}
      <div className="card-tactile p-8 text-center">
        <div className="w-32 h-32 mx-auto mb-6 rounded-sm flex items-center justify-center shadow-md" style={{ background: 'var(--moss-green)', color: '#e8e8e6' }}>
          <UserIcon size={64} strokeWidth={2.5} />
        </div>
        <h1 className="text-4xl font-black mb-2" style={{ color: '#e8e8e6' }}>
          {currentUser?.displayName || 'New Angler'}
        </h1>
        <p className="text-lg font-medium" style={{ color: 'var(--smoke-gray)' }}>
          {currentUser ? 'Your Fishing Profile' : 'Create Your Angler Identity'}
        </p>
      </div>

      {/* Achievement Stats */}
      {currentUser && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="stat-card text-center">
            <Fish size={48} strokeWidth={2} className="mx-auto mb-2" style={{ color: 'var(--accent-green)' }} />
            <div className="text-4xl font-black mb-1" style={{ color: 'var(--accent-green)' }}>{stats.totalCatches}</div>
            <div className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--smoke-gray)' }}>Total Catches</div>
          </div>
          <div className="stat-card text-center">
            <Trophy size={48} strokeWidth={2} className="mx-auto mb-2" style={{ color: 'var(--accent-green)' }} />
            <div className="text-4xl font-black mb-1" style={{ color: 'var(--accent-green)' }}>{stats.totalDerbies}</div>
            <div className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--smoke-gray)' }}>Derbies Joined</div>
          </div>
          <div className="stat-card text-center">
            <Ruler size={48} strokeWidth={2} className="mx-auto mb-2" style={{ color: 'var(--accent-green)' }} />
            <div className="text-4xl font-black mb-1" style={{ color: 'var(--accent-green)' }}>{stats.biggestCatch || '-'}</div>
            <div className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--smoke-gray)' }}>Biggest Catch</div>
          </div>
        </div>
      )}

      {/* Achievements */}
      {currentUser && stats.totalCatches > 0 && (
        <div className="card-tactile p-6">
          <h2 className="text-2xl font-black mb-4 flex items-center gap-2" style={{ color: '#e8e8e6' }}>
            <Award size={24} strokeWidth={2.5} /> Achievements
          </h2>
          <div className="space-y-3">
            {stats.totalCatches >= 1 && (
              <div className="flex items-center gap-4 p-4 rounded-sm border" style={{ background: 'rgba(107, 143, 90, 0.15)', borderColor: 'var(--accent-green)' }}>
                <Fish size={32} strokeWidth={2.5} style={{ color: 'var(--accent-green)' }} />
                <div className="flex-1">
                  <h3 className="font-bold" style={{ color: '#e8e8e6' }}>First Cast</h3>
                  <p className="text-sm" style={{ color: 'var(--smoke-gray)' }}>Logged your first catch</p>
                </div>
                <div className="badge">UNLOCKED</div>
              </div>
            )}
            {stats.totalCatches >= 10 && (
              <div className="flex items-center gap-4 p-4 rounded-sm border" style={{ background: 'rgba(107, 68, 35, 0.2)', borderColor: 'var(--rust-brown)' }}>
                <Flame size={32} strokeWidth={2.5} style={{ color: '#ff6b35' }} />
                <div className="flex-1">
                  <h3 className="font-bold" style={{ color: '#e8e8e6' }}>On Fire</h3>
                  <p className="text-sm" style={{ color: 'var(--smoke-gray)' }}>Caught 10+ fish</p>
                </div>
                <div className="badge">UNLOCKED</div>
              </div>
            )}
            {stats.totalDerbies >= 3 && (
              <div className="flex items-center gap-4 p-4 rounded-sm border" style={{ background: 'rgba(77, 58, 42, 0.25)', borderColor: 'var(--dirt-brown)' }}>
                <Swords size={32} strokeWidth={2.5} style={{ color: 'var(--stone-gray)' }} />
                <div className="flex-1">
                  <h3 className="font-bold" style={{ color: '#e8e8e6' }}>Derby Veteran</h3>
                  <p className="text-sm" style={{ color: 'var(--smoke-gray)' }}>Joined 3+ derbies</p>
                </div>
                <div className="badge">UNLOCKED</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Form */}
      <div className="card-tactile p-8">
        <h2 className="text-2xl font-black mb-6 flex items-center gap-2" style={{ color: '#e8e8e6' }}>
          <Edit size={24} strokeWidth={2.5} /> Edit Profile
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="displayName" className="block text-sm font-bold mb-2 uppercase tracking-wider" style={{ color: '#e8e8e6' }}>
              Display Name
            </label>
            <input
              type="text"
              name="displayName"
              id="displayName"
              required
              defaultValue={currentUser?.displayName || ''}
              placeholder="e.g. Trout Daddy"
              className="input-field text-lg font-medium"
            />
            <p className="text-sm mt-2 font-medium" style={{ color: 'var(--smoke-gray)' }}>
              This is how you'll appear on leaderboards and in the feed.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
