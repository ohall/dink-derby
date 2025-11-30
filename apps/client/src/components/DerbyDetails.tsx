import { useParams, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

export function DerbyDetails() {
  const { derbyId } = useParams({ from: '/derbies/$derbyId' });
  
  const derby = useLiveQuery(() => db.derbies.get(derbyId), [derbyId]);
  const catches = useLiveQuery(() => 
    db.catches.where('derbyId').equals(derbyId).reverse().sortBy('caughtAt'), 
    [derbyId]
  );

  if (!derby) return <div className="p-4">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Link to="/" className="text-sm text-emerald-600 hover:underline mb-1 block">← Back to Derbies</Link>
          <h2 className="text-2xl font-bold text-stone-800">{derby.name}</h2>
          <p className="text-stone-500">{derby.bodyOfWaterName}</p>
        </div>
        <Link 
          to="/derbies/$derbyId/log-catch" 
          params={{ derbyId }}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold shadow-sm hover:bg-emerald-700"
        >
          Log Catch
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="p-4 bg-stone-50 border-b border-stone-200 font-semibold text-stone-700 flex justify-between">
          <span>Live Feed</span>
          <span>{derby.scoringMode === 'length' ? 'Length' : derby.scoringMode === 'weight' ? 'Weight' : 'Count'}</span>
        </div>
        
        {!catches || catches.length === 0 ? (
          <div className="p-8 text-center text-stone-500">
            No fish caught yet. Get out there!
          </div>
        ) : (
          <ul>
            {catches.map((c) => (
              <li key={c.id} className="p-4 border-b border-stone-100 last:border-0 flex justify-between items-center">
                <div>
                  <span className="font-medium block">{c.species || 'Unknown Fish'}</span>
                  <span className="text-xs text-stone-400">
                    {new Date(c.caughtAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="font-bold text-lg">
                  {derby.scoringMode === 'length' && `${c.lengthInInches}"`}
                  {derby.scoringMode === 'weight' && `${c.weightInPounds}lb`}
                  {derby.scoringMode === 'count' && `${c.count}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
