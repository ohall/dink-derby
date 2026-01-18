import React, { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Catch, SyncOutboxItem } from '@dink-derby/shared-types';
import { getOrCreateDeviceId } from '../utils/device';

export function LogCatchForm() {
  const { derbyId } = useParams({ from: '/derbies/$derbyId/log-catch' });
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const derby = useLiveQuery(() => db.derbies.get(derbyId), [derbyId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!derby) return;

    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const species = formData.get('species') as string;
    const lengthInInches = formData.get('lengthInInches') ? Number(formData.get('lengthInInches')) : undefined;
    const weightInPounds = formData.get('weightInPounds') ? Number(formData.get('weightInPounds')) : undefined;
    const count = 1; // Default for now

    const deviceId = await getOrCreateDeviceId();
    const catchId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newCatch: Catch = {
      id: catchId,
      derbyId: derby.id,
      userId: deviceId, // Using device ID as user ID for now
      species,
      lengthInInches,
      weightInPounds,
      count,
      caughtAt: now,
      createdAt: now,
      updatedAt: now,
      clientId: deviceId,
      isPendingSync: true,
    };

    const outboxItem: SyncOutboxItem = {
      id: crypto.randomUUID(),
      entityType: 'catch',
      entityId: catchId,
      operation: 'create',
      payload: newCatch,
      createdAt: now,
    };

    try {
      await db.transaction('rw', db.catches, db.syncOutbox, async () => {
        await db.catches.add(newCatch);
        await db.syncOutbox.add(outboxItem);
      });
      
      navigate({ to: '/derbies/$derbyId', params: { derbyId } });
    } catch (err) {
      console.error('Failed to log catch:', err);
      alert('Failed to log catch');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!derby) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="text-5xl mb-4 animate-pulse">🎣</div>
        <div className="text-xl font-bold" style={{ color: 'var(--accent-green)' }}>Loading derby...</div>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">🐟</div>
        <h2 className="text-4xl font-black mb-2" style={{ color: '#e8e8e6' }}>
          Log a Catch
        </h2>
        <p className="text-lg" style={{ color: 'var(--smoke-gray)' }}>Add your latest trophy to <span className="font-bold" style={{ color: 'var(--accent-green)' }}>{derby.name}</span></p>
      </div>

      <div className="card-tactile p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="species" className="block text-sm font-bold mb-2 uppercase tracking-wider flex items-center gap-2" style={{ color: '#e8e8e6' }}>
              <span>🐠</span> Species
            </label>
            <input
              type="text"
              name="species"
              id="species"
              placeholder="e.g. Largemouth Bass"
              className="input-field text-lg font-medium"
            />
            <p className="text-sm mt-2 font-medium" style={{ color: 'var(--smoke-gray)' }}>
              Optional - what did you catch?
            </p>
          </div>

          {derby.scoringMode === 'length' && (
            <div>
              <label htmlFor="lengthInInches" className="block text-sm font-bold mb-2 uppercase tracking-wider flex items-center gap-2" style={{ color: '#e8e8e6' }}>
                <span>📏</span> Length (inches)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.25"
                  name="lengthInInches"
                  id="lengthInInches"
                  required
                  placeholder="0.00"
                  className="input-field text-3xl font-black text-center"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl font-black" style={{ color: 'var(--accent-green)' }}>
                  "
                </div>
              </div>
            </div>
          )}

          {derby.scoringMode === 'weight' && (
            <div>
              <label htmlFor="weightInPounds" className="block text-sm font-bold mb-2 uppercase tracking-wider flex items-center gap-2" style={{ color: '#e8e8e6' }}>
                <span>⚖️</span> Weight (pounds)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  name="weightInPounds"
                  id="weightInPounds"
                  required
                  placeholder="0.00"
                  className="input-field text-3xl font-black text-center"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-black" style={{ color: 'var(--accent-green)' }}>
                  lbs
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn-secondary disabled:opacity-50 disabled:cursor-not-allowed text-xl py-4"
          >
            {isSubmitting ? '🎣 Logging...' : '🏆 Log This Beast'}
          </button>
        </form>
      </div>
    </div>
  );
}
