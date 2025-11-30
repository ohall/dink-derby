import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Link } from '@tanstack/react-router';

export function DerbyList() {
  const derbies = useLiveQuery(() => db.derbies.toArray());

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-stone-800">Your Derbies</h2>
        <Link 
          to="/new" 
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold shadow-sm hover:bg-emerald-700"
        >
          New Derby
        </Link>
      </div>

      {!derbies || derbies.length === 0 ? (
        <div className="text-center py-12 bg-stone-200 rounded-xl border-2 border-dashed border-stone-400">
          <p className="text-stone-600 text-lg">No derbies found.</p>
          <p className="text-stone-500 text-sm mt-2">Start a new one or sync to find existing ones.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {derbies.map((derby) => (
            <li key={derby.id} className="bg-white p-4 rounded-xl shadow-sm border border-stone-200">
              <h3 className="font-bold text-lg">{derby.name}</h3>
              <p className="text-stone-500">{derby.bodyOfWaterName}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
