import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { db } from '../db';
import { Derby, SyncOutboxItem } from '@dink-derby/shared-types';
import { getOrCreateDeviceId } from '../utils/device';

export function CreateDerbyForm() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const bodyOfWaterName = formData.get('bodyOfWaterName') as string;
    const scoringMode = formData.get('scoringMode') as Derby['scoringMode'];

    const deviceId = await getOrCreateDeviceId();
    const derbyId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newDerby: Derby = {
      id: derbyId,
      name,
      bodyOfWaterName,
      scoringMode,
      createdByUserId: deviceId, // Using device ID as user ID for now
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };

    const outboxItem: SyncOutboxItem = {
      id: crypto.randomUUID(),
      entityType: 'derby',
      entityId: derbyId,
      operation: 'create',
      payload: newDerby,
      createdAt: now,
    };

    try {
      await db.transaction('rw', db.derbies, db.syncOutbox, async () => {
        await db.derbies.add(newDerby);
        await db.syncOutbox.add(outboxItem);
      });
      
      navigate({ to: '/' });
    } catch (err) {
      console.error('Failed to create derby:', err);
      alert('Failed to create derby');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow-sm border border-stone-200">
      <h2 className="text-2xl font-bold mb-6 text-stone-800">Start a New Derby</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-stone-700 mb-1">
            Derby Name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            required
            placeholder="e.g. Memorial Day Dink Fest"
            className="w-full p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="bodyOfWaterName" className="block text-sm font-medium text-stone-700 mb-1">
            Body of Water
          </label>
          <input
            type="text"
            name="bodyOfWaterName"
            id="bodyOfWaterName"
            required
            placeholder="e.g. Rock Pond"
            className="w-full p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Scoring Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="cursor-pointer">
              <input type="radio" name="scoringMode" value="length" className="peer sr-only" required defaultChecked />
              <div className="text-center p-2 border rounded-lg peer-checked:bg-emerald-50 peer-checked:border-emerald-600 peer-checked:text-emerald-800 hover:bg-stone-50">
                📏 Length
              </div>
            </label>
            <label className="cursor-pointer">
              <input type="radio" name="scoringMode" value="weight" className="peer sr-only" />
              <div className="text-center p-2 border rounded-lg peer-checked:bg-emerald-50 peer-checked:border-emerald-600 peer-checked:text-emerald-800 hover:bg-stone-50">
                ⚖️ Weight
              </div>
            </label>
            <label className="cursor-pointer">
              <input type="radio" name="scoringMode" value="count" className="peer sr-only" />
              <div className="text-center p-2 border rounded-lg peer-checked:bg-emerald-50 peer-checked:border-emerald-600 peer-checked:text-emerald-800 hover:bg-stone-50">
                🔢 Count
              </div>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-emerald-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create Derby'}
        </button>
      </form>
    </div>
  );
}
