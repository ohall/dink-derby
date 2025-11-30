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

  if (!derby) return <div>Loading...</div>;

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow-sm border border-stone-200">
      <h2 className="text-2xl font-bold mb-6 text-stone-800">Log a Catch</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="species" className="block text-sm font-medium text-stone-700 mb-1">
            Species
          </label>
          <input
            type="text"
            name="species"
            id="species"
            placeholder="e.g. Largemouth Bass"
            className="w-full p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {derby.scoringMode === 'length' && (
          <div>
            <label htmlFor="lengthInInches" className="block text-sm font-medium text-stone-700 mb-1">
              Length (inches)
            </label>
            <input
              type="number"
              step="0.25"
              name="lengthInInches"
              id="lengthInInches"
              required
              className="w-full p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-lg"
            />
          </div>
        )}

        {derby.scoringMode === 'weight' && (
          <div>
            <label htmlFor="weightInPounds" className="block text-sm font-medium text-stone-700 mb-1">
              Weight (lbs)
            </label>
            <input
              type="number"
              step="0.01"
              name="weightInPounds"
              id="weightInPounds"
              required
              className="w-full p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-lg"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-emerald-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Log Catch'}
        </button>
      </form>
    </div>
  );
}
