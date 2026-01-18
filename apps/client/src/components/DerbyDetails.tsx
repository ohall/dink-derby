import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { getOrCreateDeviceId } from '../utils/device';
import { DerbyParticipant, SyncOutboxItem } from '@dink-derby/shared-types';
import clsx from 'clsx';
import { Fish, Trophy, MapPin, Plus, ArrowLeft, Circle, Camera, Crown, Medal } from 'lucide-react';

export function DerbyDetails() {
  const { derbyId } = useParams({ from: '/derbies/$derbyId' });
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'feed'>('leaderboard');

  useEffect(() => {
    getOrCreateDeviceId().then(setDeviceId);
  }, []);
  
  const derby = useLiveQuery(() => db.derbies.get(derbyId), [derbyId]);
  const catches = useLiveQuery(() => 
    db.catches.where('derbyId').equals(derbyId).reverse().sortBy('caughtAt'), 
    [derbyId]
  );
  
  // Fetch current user's participation status
  const participation = useLiveQuery(
    () => deviceId ? db.derbyParticipants.where({ derbyId, userId: deviceId }).first() : undefined,
    [derbyId, deviceId]
  );

  // Fetch all users involved in catches or participation for name resolution
  const users = useLiveQuery(() => db.users.toArray(), []);
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users?.forEach(u => map.set(u.id, u.displayName));
    return map;
  }, [users]);

  // --- Actions ---
  const handleJoin = async () => {
    if (!deviceId || !derby) return;
    
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    
    const participant: DerbyParticipant = {
      id,
      derbyId: derby.id,
      userId: deviceId,
      isAdmin: false,
      createdAt: now,
    };

    const outboxItem: SyncOutboxItem = {
      id: crypto.randomUUID(),
      entityType: 'derbyParticipant',
      entityId: id,
      operation: 'create',
      payload: participant,
      createdAt: now,
    };

    try {
      await db.transaction('rw', db.derbyParticipants, db.syncOutbox, async () => {
        await db.derbyParticipants.add(participant);
        await db.syncOutbox.add(outboxItem);
      });
    } catch (err) {
      console.error('Failed to join derby:', err);
      alert('Failed to join derby');
    }
  };

  // --- Leaderboard Calculation ---
  const leaderboard = useMemo(() => {
    if (!catches || !derby) return [];
    
    const totals = new Map<string, number>();
    
    catches.forEach(c => {
      const current = totals.get(c.userId) || 0;
      let score = 0;
      if (derby.scoringMode === 'length') score = c.lengthInInches || 0;
      else if (derby.scoringMode === 'weight') score = c.weightInPounds || 0;
      else score = c.count || 0;
      
      totals.set(c.userId, current + score);
    });

    return Array.from(totals.entries())
      .map(([userId, score]) => ({
        userId,
        displayName: userMap.get(userId) || 'Unknown Angler',
        score
      }))
      .sort((a, b) => b.score - a.score);
  }, [catches, derby, userMap]);

  if (!derby) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <Fish size={60} strokeWidth={2} className="mx-auto mb-4 animate-pulse" style={{ color: 'var(--accent-green)' }} />
        <div className="text-xl font-bold" style={{ color: 'var(--accent-green)' }}>Loading derby...</div>
      </div>
    </div>
  );

  const isParticipant = !!participation;

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="card-tactile p-8">
        <Link to="/" className="inline-flex items-center gap-2 mb-4 font-medium transition-colors hover:opacity-80" style={{ color: 'var(--accent-green)' }}>
          <ArrowLeft size={20} strokeWidth={2.5} />
          <span>Back to Derbies</span>
        </Link>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-4xl md:text-5xl font-black mb-3" style={{ color: '#e8e8e6' }}>
              {derby.name}
            </h2>
            <div className="flex items-center gap-2 text-lg mb-4" style={{ color: 'var(--smoke-gray)' }}>
              <MapPin size={20} strokeWidth={2.5} />
              <span className="font-medium">{derby.bodyOfWaterName}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="badge flex items-center gap-2">
                <Trophy size={16} strokeWidth={2.5} />
                {derby.scoringMode.toUpperCase()} MODE
              </span>
              {derby.scoringUnit && (
                <span className="px-3 py-1 rounded-sm text-sm font-bold" style={{ background: 'var(--stone-gray)', color: '#e8e8e6' }}>
                  {derby.scoringUnit}
                </span>
              )}
            </div>
          </div>

          {isParticipant ? (
            <Link
              to="/derbies/$derbyId/log-catch"
              params={{ derbyId }}
              className="btn-secondary whitespace-nowrap flex items-center gap-2"
            >
              <Plus size={24} strokeWidth={2.5} />
              <span>Log Catch</span>
            </Link>
          ) : (
            <button
              onClick={handleJoin}
              disabled={!deviceId}
              className="btn-primary whitespace-nowrap flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Fish size={24} strokeWidth={2.5} />
              <span>Join Derby</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-3">
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={clsx(
            "px-6 py-3 rounded-sm font-bold text-lg transition-all duration-200 flex items-center gap-2",
            activeTab === 'leaderboard'
              ? "shadow-md"
              : "glass hover:opacity-80"
          )}
          style={activeTab === 'leaderboard' ? { background: 'var(--forest-green)', color: '#e8e8e6' } : { color: 'var(--smoke-gray)' }}
        >
          <Trophy size={20} strokeWidth={2.5} />
          Leaderboard
        </button>
        <button
          onClick={() => setActiveTab('feed')}
          className={clsx(
            "px-6 py-3 rounded-sm font-bold text-lg transition-all duration-200 flex items-center gap-2",
            activeTab === 'feed'
              ? "shadow-md"
              : "glass hover:opacity-80"
          )}
          style={activeTab === 'feed' ? { background: 'var(--forest-green)', color: '#e8e8e6' } : { color: 'var(--smoke-gray)' }}
        >
          <Circle size={16} strokeWidth={2.5} fill={activeTab === 'feed' ? 'currentColor' : 'none'} className={activeTab === 'feed' ? 'pulse-live' : ''} />
          Live Feed
        </button>
      </div>

      {activeTab === 'leaderboard' ? (
        <div className="space-y-4">
          {leaderboard.length === 0 ? (
            <div className="card-tactile p-12 text-center">
              <Fish size={80} strokeWidth={2} className="mx-auto mb-4" style={{ color: 'var(--smoke-gray)' }} />
              <p className="text-xl font-medium" style={{ color: 'var(--smoke-gray)' }}>No scores yet. Be the first to catch!</p>
            </div>
          ) : (
            leaderboard.map((entry, idx) => {
              const isTopThree = idx < 3;
              const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';

              return (
                <div
                  key={entry.userId}
                  className={clsx(
                    "card-tactile p-6 flex items-center gap-6",
                    isTopThree && "ring-2 ring-offset-2"
                  )}
                  style={isTopThree ? {
                    ringColor: idx === 0 ? '#8b7355' : idx === 1 ? '#6b6660' : 'var(--chocolate-brown)',
                    ringOffsetColor: 'var(--bg-primary)'
                  } : {}}
                >
                  {/* Rank Badge */}
                  <div className={clsx(
                    "flex-shrink-0 w-16 h-16 rounded-sm flex items-center justify-center shadow-md",
                    rankClass
                  )}
                  style={!rankClass ? { background: 'var(--stone-gray)', color: '#e8e8e6' } : {}}
                  >
                    {isTopThree ? (
                      <Medal size={32} strokeWidth={2.5} style={{ color: idx === 0 ? '#1a1a18' : '#e8e8e6' }} />
                    ) : (
                      <span className="font-black text-2xl">#{idx + 1}</span>
                    )}
                  </div>

                  {/* Angler Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-2xl font-bold" style={{ color: '#e8e8e6' }}>{entry.displayName}</h3>
                      {idx === 0 && <Crown size={20} strokeWidth={2.5} style={{ color: '#8b7355' }} />}
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--smoke-gray)' }}>
                      {idx === 0 ? 'LEADING THE PACK' : `${leaderboard[0].score - entry.score} ${derby.scoringMode === 'length' ? 'inches' : derby.scoringMode === 'weight' ? 'lbs' : 'fish'} behind leader`}
                    </p>
                  </div>

                  {/* Score */}
                  <div className="text-right">
                    <div className="text-4xl font-black" style={{ color: 'var(--accent-green)' }}>
                      {entry.score.toLocaleString()}
                    </div>
                    <div className="text-sm font-bold" style={{ color: 'var(--smoke-gray)' }}>
                      {derby.scoringMode === 'length' && 'INCHES'}
                      {derby.scoringMode === 'weight' && 'POUNDS'}
                      {derby.scoringMode === 'count' && 'FISH'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {!catches || catches.length === 0 ? (
            <div className="card-tactile p-12 text-center">
              <Fish size={80} strokeWidth={2} className="mx-auto mb-4" style={{ color: 'var(--smoke-gray)' }} />
              <p className="text-xl font-medium" style={{ color: 'var(--smoke-gray)' }}>No fish caught yet. Cast your line!</p>
            </div>
          ) : (
            catches.map((c) => (
              <div key={c.id} className="card-tactile p-5 flex items-center gap-4 hover:shadow-lg transition-shadow">
                {/* Fish Icon/Photo */}
                <div className="flex-shrink-0 w-14 h-14 rounded-sm flex items-center justify-center shadow-md" style={{ background: 'var(--moss-green)' }}>
                  {c.photoUrl ? (
                    <Camera size={28} strokeWidth={2.5} style={{ color: '#e8e8e6' }} />
                  ) : (
                    <Fish size={28} strokeWidth={2.5} style={{ color: '#e8e8e6' }} />
                  )}
                </div>

                {/* Catch Details */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-lg truncate" style={{ color: '#e8e8e6' }}>
                    {c.species || 'Mystery Fish'}
                  </h4>
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--smoke-gray)' }}>
                    <span className="font-medium" style={{ color: 'var(--accent-green)' }}>{userMap.get(c.userId) || 'Unknown Angler'}</span>
                    <span>•</span>
                    <span>{new Date(c.caughtAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                {/* Score Badge */}
                <div className="flex-shrink-0 px-4 py-2 rounded-sm shadow-md" style={{ background: 'var(--rust-brown)' }}>
                  <div className="text-2xl font-black text-center" style={{ color: '#e8e8e6' }}>
                    {derby.scoringMode === 'length' && `${c.lengthInInches}"`}
                    {derby.scoringMode === 'weight' && `${c.weightInPounds}lb`}
                    {derby.scoringMode === 'count' && `${c.count}`}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
