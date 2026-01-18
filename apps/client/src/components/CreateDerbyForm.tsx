import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { db } from '../db';
import { Derby, SyncOutboxItem } from '@dink-derby/shared-types';
import { getOrCreateDeviceId } from '../utils/device';
import { Flag, Ruler, Scale, Hash } from 'lucide-react';

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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <Flag size={60} strokeWidth={2} className="mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
        <h2 className="text-4xl font-black mb-2" style={{ color: 'var(--accent-green)' }}>
          Start a New Derby
        </h2>
        <p className="text-lg" style={{ color: 'var(--smoke-gray)' }}>Create an epic fishing competition</p>
      </div>

      <div className="card-tactile p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-bold mb-2 uppercase tracking-wider" style={{ color: '#e8e8e6' }}>
              Derby Name
            </label>
            <input
              type="text"
              name="name"
              id="name"
              required
              placeholder="e.g. Memorial Day Dink Fest"
              className="input-field text-lg font-medium"
            />
          </div>

          <div>
            <label htmlFor="bodyOfWaterName" className="block text-sm font-bold mb-2 uppercase tracking-wider" style={{ color: '#e8e8e6' }}>
              Body of Water
            </label>
            <input
              type="text"
              name="bodyOfWaterName"
              id="bodyOfWaterName"
              required
              placeholder="e.g. Rock Pond"
              className="input-field text-lg font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-3 uppercase tracking-wider" style={{ color: '#e8e8e6' }}>
              Scoring Mode
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="cursor-pointer group">
                <input type="radio" name="scoringMode" value="length" className="peer sr-only" required defaultChecked />
                <div className="text-center p-4 rounded-sm border-2 transition-all peer-checked:border-accent-green" style={{ borderColor: 'var(--stone-gray)', background: 'var(--bg-elevated)' }}>
                  <Ruler size={32} strokeWidth={2.5} className="mx-auto mb-2" style={{ color: '#e8e8e6' }} />
                  <div className="font-bold" style={{ color: '#e8e8e6' }}>Length</div>
                </div>
              </label>
              <label className="cursor-pointer group">
                <input type="radio" name="scoringMode" value="weight" className="peer sr-only" />
                <div className="text-center p-4 rounded-sm border-2 transition-all peer-checked:border-accent-green" style={{ borderColor: 'var(--stone-gray)', background: 'var(--bg-elevated)' }}>
                  <Scale size={32} strokeWidth={2.5} className="mx-auto mb-2" style={{ color: '#e8e8e6' }} />
                  <div className="font-bold" style={{ color: '#e8e8e6' }}>Weight</div>
                </div>
              </label>
              <label className="cursor-pointer group">
                <input type="radio" name="scoringMode" value="count" className="peer sr-only" />
                <div className="text-center p-4 rounded-sm border-2 transition-all peer-checked:border-accent-green" style={{ borderColor: 'var(--stone-gray)', background: 'var(--bg-elevated)' }}>
                  <Hash size={32} strokeWidth={2.5} className="mx-auto mb-2" style={{ color: '#e8e8e6' }} />
                  <div className="font-bold" style={{ color: '#e8e8e6' }}>Count</div>
                </div>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating Derby...' : 'Create Derby'}
          </button>
        </form>
      </div>
    </div>
  );
}
