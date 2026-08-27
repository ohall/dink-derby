import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Fish } from 'lucide-react';
import { BrandHeader } from './components/BrandHeader';
import { HomeScreen } from './components/HomeScreen';
import { DerbyScreen } from './components/DerbyScreen';
import { CatchSheet, CreateDerbySheet, JoinDerbySheet, ProfileSheet } from './components/Sheets';
import { db } from './db';
import { seedFieldDemo } from './data/seed';
import { syncService } from './sync';

type SheetName = 'create' | 'join' | 'profile' | 'catch' | null;

export default function App() {
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [selectedDerbyId, setSelectedDerbyId] = useState<string>();
  const [sheet, setSheet] = useState<SheetName>(null);
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const user = useLiveQuery(() => settings?.currentUserId ? db.users.get(settings.currentUserId) : undefined, [settings?.currentUserId]);
  const derbies = useLiveQuery(async () => {
    const items = await db.derbies.toArray();
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, []) ?? [];
  const catches = useLiveQuery(() => db.catches.toArray(), []) ?? [];
  const selectedDerby = derbies.find((derby) => derby.id === selectedDerbyId);

  useEffect(() => {
    let active = true;
    seedFieldDemo()
      .then(async () => {
        if ('storage' in navigator && navigator.storage.persist) {
          await navigator.storage.persist().catch(() => false);
        }
        if (!active) return;
        syncService.start();
        setReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setFatalError(error instanceof Error ? error.message : 'Dink Derby could not open its field storage.');
      });
    return () => {
      active = false;
      syncService.stop();
    };
  }, []);

  if (fatalError) {
    return <main className="fatal-screen"><Fish size={52} /><h1>We snagged a branch.</h1><p>{fatalError}</p><button className="button button--primary" type="button" onClick={() => window.location.reload()}>Try again</button></main>;
  }

  if (!ready || !settings) {
    return <main className="loading-screen"><span><Fish size={42} /></span><p>Putting the dinks on the board…</p></main>;
  }

  return (
    <div className="app-canvas">
      <BrandHeader user={user} onHome={() => setSelectedDerbyId(undefined)} onProfile={() => setSheet('profile')} />

      {selectedDerby ? (
        <DerbyScreen derby={selectedDerby} currentUser={user} onBack={() => setSelectedDerbyId(undefined)} onLogCatch={() => setSheet('catch')} />
      ) : (
        <HomeScreen user={user} derbies={derbies} catches={catches} onOpenDerby={setSelectedDerbyId} onCreate={() => setSheet('create')} onJoin={() => setSheet('join')} />
      )}

      <footer className="site-footer page-width"><strong>DINKDERBY.COM</strong><span>Built for bad service and good stories.</span></footer>

      {sheet === 'create' && <CreateDerbySheet onClose={() => setSheet(null)} onCreated={(derby) => { setSelectedDerbyId(derby.id); setSheet(null); }} />}
      {sheet === 'join' && <JoinDerbySheet onClose={() => setSheet(null)} onJoined={(derby) => { setSelectedDerbyId(derby.id); setSheet(null); }} />}
      {sheet === 'profile' && <ProfileSheet user={user} onClose={() => setSheet(null)} />}
      {sheet === 'catch' && selectedDerby && <CatchSheet derby={selectedDerby} onClose={() => setSheet(null)} onSaved={() => setSheet(null)} />}
    </div>
  );
}
