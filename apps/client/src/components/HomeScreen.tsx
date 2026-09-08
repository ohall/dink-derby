import { ArrowRight, Fish, MapPin, Plus, Ticket } from 'lucide-react';
import type { Catch, Derby, User } from '@dink-derby/shared-types';
import { scoringRuleLabel } from '../domain/leaderboard';
import { isDerbyComplete, isDerbyInHistory } from '../domain/derbyLifecycle';

type HomeScreenProps = {
  user?: User;
  derbies: Derby[];
  catches: Catch[];
  removedDerbyIds?: readonly string[];
  onOpenDerby: (derbyId: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  history: boolean;
  onHistoryChange: (history: boolean) => void;
};

function derbyTiming(derby: Derby) {
  const now = Date.now();
  const start = derby.startsAt ? new Date(derby.startsAt).getTime() : undefined;
  const end = derby.endsAt ? new Date(derby.endsAt).getTime() : undefined;
  if (derby.status === 'finished' || (end && end < now)) return 'Finished';
  if (start && start > now) return `Starts ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(start)}`;
  return 'Live now';
}

export function HomeScreen({ user, derbies, catches, removedDerbyIds = [], onOpenDerby, onCreate, onJoin, history, onHistoryChange: setHistory }: HomeScreenProps) {
  const past = derbies.filter(derby => isDerbyInHistory(derby, removedDerbyIds));
  const visible = (history ? past : derbies.filter(derby => !isDerbyInHistory(derby, removedDerbyIds)))
    .slice().sort((a, b) => (b.endsAt || b.createdAt).localeCompare(a.endsAt || a.createdAt));
  return (
    <main className="home-screen page-width">
      <section className="home-toolbar">
        <div>
          <h1>Derbies</h1>
          <p>{user?.displayName || 'Angler'}</p>
        </div>
        <div className="home-toolbar__actions">
          <button className="button button--primary" type="button" onClick={onCreate}><Plus size={20} /> Start a derby</button>
          <button className="button button--paper" type="button" onClick={onJoin}><Ticket size={20} /> Join a derby</button>
        </div>
      </section>

      <nav className="derby-tabs" aria-label="Derby history">
        <button type="button" className={!history ? 'active' : ''} aria-pressed={!history} onClick={() => setHistory(false)}>Active derbies ({derbies.length - past.length})</button>
        <button type="button" className={history ? 'active' : ''} aria-pressed={history} onClick={() => setHistory(true)}>Past derbies ({past.length})</button>
      </nav>
      <section className="derby-library" aria-labelledby="your-derbies-title">
        <div className="section-title-row">
          <h2 id="your-derbies-title">{history ? 'Past derbies' : 'Your derbies'}</h2>
          <span>{visible.length} total</span>
        </div>

        {visible.length ? (
          <div className="derby-card-grid">
            {visible.map((derby) => {
              const derbyCatches = catches.filter((item) => item.derbyId === derby.id && !item.deletedAt);
              const former = removedDerbyIds.includes(derby.id);
              const pending = former ? 0 : derbyCatches.filter((item) => item.isPendingSync).length;
              const timing = former && !isDerbyComplete(derby) ? 'Participation ended' : derbyTiming(derby);
              return (
                <button className="derby-card" type="button" key={derby.id} onClick={() => onOpenDerby(derby.id)}>
                  <div className="derby-card__topline">
                    <span className="derby-card__number">{former ? 'Read-only history' : derby.createdByUserId === user?.id ? 'You’re the organizer' : 'Joined derby'}</span>
                    <span className={`status-stamp ${timing === 'Live now' ? 'status-stamp--live' : ''}`}>{timing}</span>
                  </div>
                  <h3>{derby.name}</h3>
                  <p><MapPin size={16} /> {derby.bodyOfWaterName}</p>
                  {history && isDerbyComplete(derby) && <p>Ended {new Date(derby.endsAt || derby.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                  {former && !isDerbyComplete(derby) && <p>The derby is still in progress.</p>}
                  {history && <p>Your catches: {derbyCatches.filter(item => item.userId === user?.id).length}</p>}
                  <div className="derby-card__stats">
                    <span><b>{derbyCatches.length} catch{derbyCatches.length === 1 ? '' : 'es'}</b></span>
                    <span>{scoringRuleLabel(derby)}</span>
                  </div>
                  <div className="derby-card__footer">
                    <span>{former ? 'View history' : history ? 'View results' : 'Open derby'}</span>
                    {pending > 0 && <span>{pending} waiting to sync</span>}
                    <ArrowRight size={19} />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-card">
            <span><Fish size={42} /></span>
            <div><h3>{history ? 'No past derbies yet' : 'No active derbies'}</h3><p>{history ? 'Completed derbies and derbies you no longer participate in will appear here.' : 'Start a derby or join one with an invite code.'}</p></div>
          </div>
        )}
      </section>
    </main>
  );
}
