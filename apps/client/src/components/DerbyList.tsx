import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Link } from '@tanstack/react-router';
import { Trophy, MapPin, Plus, Fish } from 'lucide-react';

export function DerbyList() {
  const derbies = useLiveQuery(() => db.derbies.toArray());

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-4xl font-black" style={{ color: 'var(--accent-green)' }}>
            Your Derbies
          </h2>
          <p className="font-medium mt-1" style={{ color: 'var(--smoke-gray)' }}>Join the competition or start a new one</p>
        </div>
        <Link
          to="/new"
          className="btn-secondary flex items-center gap-2 justify-center"
        >
          <Plus size={24} strokeWidth={2.5} />
          <span>New Derby</span>
        </Link>
      </div>

      {/* Derby List */}
      {!derbies || derbies.length === 0 ? (
        <div className="card-tactile p-12 text-center">
          <Fish size={80} strokeWidth={2} className="mx-auto mb-6" style={{ color: 'var(--smoke-gray)' }} />
          <p className="text-2xl font-bold mb-2" style={{ color: '#e8e8e6' }}>No derbies found</p>
          <p className="text-lg" style={{ color: 'var(--smoke-gray)' }}>Start a new one or sync to find existing derbies</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {derbies.map((derby) => (
            <Link
              key={derby.id}
              to="/derbies/$derbyId"
              params={{ derbyId: derby.id }}
              className="card-tactile p-6 group cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-16 h-16 rounded-sm flex items-center justify-center shadow-md transition-transform group-hover:scale-105" style={{ background: 'var(--moss-green)' }}>
                  <Trophy size={32} strokeWidth={2.5} style={{ color: '#e8e8e6' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-black mb-2 transition-colors" style={{ color: '#e8e8e6' }}>
                    {derby.name}
                  </h3>
                  <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--smoke-gray)' }}>
                    <MapPin size={16} strokeWidth={2.5} />
                    <span className="font-medium">{derby.bodyOfWaterName}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 rounded-sm text-xs font-bold" style={{ background: 'var(--rust-brown)', color: '#e8e8e6' }}>
                      {derby.scoringMode.toUpperCase()}
                    </span>
                    {!derby.isArchived && (
                      <span className="px-3 py-1 rounded-sm text-xs font-bold border flex items-center gap-1" style={{ background: 'rgba(107, 143, 90, 0.2)', color: 'var(--accent-green)', borderColor: 'var(--accent-green)' }}>
                        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent-green)' }}></span>
                        ACTIVE
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
