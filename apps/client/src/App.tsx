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
import { isDerbyComplete, isDerbyInHistory } from './domain/derbyLifecycle';
import { useAppRoute } from './components/useAppRoute';
import { useInstallPrompt } from './components/useInstallPrompt';
import { InstallSheet } from './components/InstallSheet';
import { clearInviteFromUrl, parseDerbyInvite } from './domain/invites';

type SheetName = 'create' | 'join' | 'profile' | 'catch' | 'install' | null;

function incomingInvite() {
  const url = new URL(window.location.href);
  const hasInvite = url.searchParams.has('join') || new URLSearchParams(url.hash.slice(1)).has('join');
  return hasInvite ? parseDerbyInvite(url.href, url.origin) ?? '' : undefined;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const { route, navigate } = useAppRoute();
  const install = useInstallPrompt();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [invite, setInvite] = useState(incomingInvite);
  const [notice, setNotice] = useState('');
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const user = useLiveQuery(() => settings?.currentUserId ? db.users.get(settings.currentUserId) : undefined, [settings?.currentUserId]);
  const derbyQuery = useLiveQuery(async () => {
    const items = await db.derbies.toArray();
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, []);
  const removedDerbyIds = settings?.removedDerbyIds ?? [];
  const derbies = derbyQuery ?? [];
  const catches = useLiveQuery(() => db.catches.toArray(), []) ?? [];
  const selectedDerby = derbies.find((derby) => derby.id === route.derbyId);
  const openDerby = (id: string) => {
    const derby = derbies.find(item => item.id === id);
    navigate({ derbyId: id, section: derby && isDerbyInHistory(derby, removedDerbyIds) ? 'standings' : 'feed', history: false });
  };
  const goHome = () => navigate({ section: 'feed', history: selectedDerby ? isDerbyInHistory(selectedDerby, removedDerbyIds) : route.history });
  const closeInvite = () => { clearInviteFromUrl(); setInvite(undefined); setSheet(null); };

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
        else if (invite !== undefined) setSheet('join');
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
    if (!ready) return;
    const openIncomingInvite = () => {
      const next = incomingInvite();
      setInvite(next); setSheet(next !== undefined ? 'join' : null);
    };
    window.addEventListener('popstate', openIncomingInvite);
    window.addEventListener('hashchange', openIncomingInvite);
    return () => { window.removeEventListener('popstate', openIncomingInvite); window.removeEventListener('hashchange', openIncomingInvite); };
  }, [ready]);

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
      <BrandHeader user={user} showSync={!selectedDerby} onHome={goHome} onProfile={() => setSheet('profile')} install={install.state} onShowInstall={() => setSheet('install')} />

      {selectedDerby ? (
        <DerbyScreen key={selectedDerby.id} derby={selectedDerby} isFormerParticipant={removedDerbyIds.includes(selectedDerby.id)} tab={route.section} onTabChange={(section, replace) => navigate({ ...route, section }, replace)} currentUser={user} suspendPhotos={sheet === 'catch' && !removedDerbyIds.includes(selectedDerby.id)} onBack={goHome} onLogCatch={() => setSheet('catch')} />
      ) : route.derbyId ? (
        <main className="page-width single-panel"><h1>Derby not on this device</h1><p>Scan a participant’s QR code or enter their invite code. If you have already joined, wait for this device to sync.</p><div className="finish-actions"><button className="button button--primary" type="button" onClick={() => setSheet('join')}>Join a derby</button><button className="button button--paper" type="button" onClick={goHome}>All derbies</button></div></main>
      ) : (
        <HomeScreen user={user} derbies={derbies} removedDerbyIds={removedDerbyIds} catches={catches} history={route.history} onHistoryChange={history => navigate({ section: 'feed', history })} onOpenDerby={openDerby} onCreate={() => setSheet('create')} onJoin={() => setSheet('join')} />
      )}

      {sheet === 'create' && <CreateDerbySheet onClose={() => setSheet(null)} onCreated={derby => { navigate({ derbyId: derby.id, section: 'feed', history: false }); setSheet(null); }} />}
      {sheet === 'join' && <JoinDerbySheet key={invite ?? 'manual'} initialCode={invite} invalidLink={invite === ''} onClose={closeInvite} onJoined={derby => { closeInvite(); navigate({ derbyId: derby.id, section: isDerbyComplete(derby) ? 'standings' : 'feed', history: false }); }} />}
      {sheet === 'profile' && <ProfileSheet user={user} onClose={() => setSheet(invite !== undefined ? 'join' : null)} />}
      {sheet === 'catch' && selectedDerby && !removedDerbyIds.includes(selectedDerby.id) && <CatchSheet key={`catch-${selectedDerby.id}`} derby={selectedDerby} userId={settings.currentUserId} onClose={() => setSheet(null)} onSaved={(message) => { setSheet(null); setNotice(message || 'Catch saved.'); }} />}
      {sheet === 'install' && <InstallSheet onClose={() => { install.dismiss(); setSheet(null); }} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
