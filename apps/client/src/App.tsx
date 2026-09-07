import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Fish } from 'lucide-react';
import { BrandHeader } from './components/BrandHeader';
import { HomeScreen } from './components/HomeScreen';
import { DerbyScreen } from './components/DerbyScreen';
import { CatchSheet, CreateDerbySheet, JoinDerbySheet, ProfileSheet } from './components/Sheets';
import { db } from './db';
import { initializeIdentity } from './data/identity';
import { syncService } from './sync';
import { resumableCatchDraft } from './data/catchDraft';
import { isDerbyComplete } from './domain/derbyLifecycle';
import { useAppRoute } from './components/useAppRoute';

type SheetName = 'create' | 'join' | 'profile' | 'catch' | null;

export default function App() {
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const { route, navigate } = useAppRoute();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [notice, setNotice] = useState('');
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const user = useLiveQuery(() => settings?.currentUserId ? db.users.get(settings.currentUserId) : undefined, [settings?.currentUserId]);
  const derbyQuery = useLiveQuery(async () => {
    const items = await db.derbies.toArray();
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, []);
  const derbies = derbyQuery ?? [];
  const catches = useLiveQuery(() => db.catches.toArray(), []) ?? [];
  const selectedDerby = derbies.find((derby) => derby.id === route.derbyId);
  const openDerby = (id: string) => {
    const derby = derbies.find(item => item.id === id);
    navigate({ derbyId: id, section: derby && isDerbyComplete(derby) ? 'standings' : 'feed', history: false });
  };
  const goHome = () => navigate({ section: 'feed', history: selectedDerby ? isDerbyComplete(selectedDerby) : route.history });

  useEffect(() => {
    let active = true;
    initializeIdentity()
      .then(async ({ isNew, user: identityUser }) => {
        if ('storage' in navigator && navigator.storage.persist) {
          await navigator.storage.persist().catch(() => false);
        }
        if (!active) return;
        syncService.start();
        if (isNew) setSheet('profile');
        else {
          const draft = await resumableCatchDraft(identityUser.id);
          if (!active) return;
          // An explicit derby URL takes precedence over a different old draft.
          if (draft && (!route.derbyId || route.derbyId === draft.derbyId)) {
            navigate({ derbyId: draft.derbyId, section: 'feed', history: false }, true); setSheet('catch');
          }
        }
        setReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setFatalError(error instanceof Error ? error.message : 'Dink Derby could not open local storage.');
      });
    return () => {
      active = false;
      syncService.stop();
    };
  }, []);

  useEffect(() => {
    const closeOnBack = () => setSheet(null);
    window.addEventListener('popstate', closeOnBack);
    return () => window.removeEventListener('popstate', closeOnBack);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (fatalError) {
    return <main className="fatal-screen"><Fish size={52} /><h1>Dink Derby could not open</h1><p>{fatalError}</p><button className="button button--primary" type="button" onClick={() => window.location.reload()}>Try again</button></main>;
  }

  if (!ready || !settings || !derbyQuery) {
    return <main className="loading-screen"><span><Fish size={42} /></span><p>Loading Dink Derby…</p></main>;
  }

  return (
    <div className="app-canvas">
      <BrandHeader user={user} showSync={!selectedDerby} onHome={goHome} onProfile={() => setSheet('profile')} />

      {selectedDerby ? (
        <DerbyScreen key={selectedDerby.id} derby={selectedDerby} tab={route.section} onTabChange={(section, replace) => navigate({ ...route, section }, replace)} currentUser={user} suspendPhotos={sheet === 'catch'} onBack={goHome} onLogCatch={() => setSheet('catch')} />
      ) : route.derbyId ? (
        <main className="page-width single-panel"><h1>Derby not on this device</h1><p>Join with the organizer’s invite code, or return to your derbies. If you have already joined, wait for this device to sync.</p><div className="finish-actions"><button className="button button--primary" type="button" onClick={() => setSheet('join')}>Join with code</button><button className="button button--paper" type="button" onClick={goHome}>All derbies</button></div></main>
      ) : (
        <HomeScreen user={user} derbies={derbies} catches={catches} history={route.history} onHistoryChange={history => navigate({ section: 'feed', history })} onOpenDerby={openDerby} onCreate={() => setSheet('create')} onJoin={() => setSheet('join')} />
      )}

      {sheet === 'create' && <CreateDerbySheet onClose={() => setSheet(null)} onCreated={derby => { navigate({ derbyId: derby.id, section: 'feed', history: false }); setSheet(null); }} />}
      {sheet === 'join' && <JoinDerbySheet onClose={() => setSheet(null)} onJoined={derby => { navigate({ derbyId: derby.id, section: isDerbyComplete(derby) ? 'standings' : 'feed', history: false }); setSheet(null); }} />}
      {sheet === 'profile' && <ProfileSheet user={user} onClose={() => setSheet(null)} />}
      {sheet === 'catch' && selectedDerby && <CatchSheet key={selectedDerby.id} derby={selectedDerby} userId={settings.currentUserId} onClose={() => setSheet(null)} onSaved={(message) => { setSheet(null); setNotice(message || 'Catch saved.'); }} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
