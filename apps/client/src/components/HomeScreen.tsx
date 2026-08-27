import { ArrowRight, Fish, MapPin, Plus, Ticket, Trophy } from 'lucide-react';
import type { Catch, Derby, User } from '@dink-derby/shared-types';
import { scoringLabel } from '../domain/leaderboard';

type HomeScreenProps = {
  user?: User;
  derbies: Derby[];
  catches: Catch[];
  onOpenDerby: (derbyId: string) => void;
  onCreate: () => void;
  onJoin: () => void;
};

function derbyTiming(derby: Derby) {
  const now = Date.now();
  const start = derby.startsAt ? new Date(derby.startsAt).getTime() : undefined;
  const end = derby.endsAt ? new Date(derby.endsAt).getTime() : undefined;
  if (derby.status === 'finished' || (end && end < now)) return 'Finished';
  if (start && start > now) return `Starts ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(start)}`;
  return 'Live now';
}

export function HomeScreen({ user, derbies, catches, onOpenDerby, onCreate, onJoin }: HomeScreenProps) {
  return (
    <main className="home-screen page-width">
      <section className="home-hero">
        <div className="home-hero__copy">
          <p className="eyebrow">FIELD NOTES · ADIRONDACKS</p>
          <h1>Hey {user?.displayName?.split(' ')[0] || 'angler'}, the lake is calling.</h1>
          <p>Keep the score, keep the receipts, and keep fishing when the signal disappears.</p>
          <div className="home-hero__actions">
            <button className="button button--primary" type="button" onClick={onCreate}><Plus size={20} /> Start a derby</button>
            <button className="button button--paper" type="button" onClick={onJoin}><Ticket size={20} /> Join with code</button>
          </div>
        </div>
        <div className="home-hero__terrain" aria-hidden="true" />
      </section>

      <section className="derby-library" aria-labelledby="your-derbies-title">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">YOUR WATER, YOUR RULES</p>
            <h2 id="your-derbies-title">Your derbies</h2>
          </div>
          <span>{derbies.length} total</span>
        </div>

        {derbies.length ? (
          <div className="derby-card-grid">
            {derbies.map((derby) => {
              const derbyCatches = catches.filter((item) => item.derbyId === derby.id && !item.deletedAt);
              const pending = derbyCatches.filter((item) => item.isPendingSync).length;
              return (
                <button className="derby-card" type="button" key={derby.id} onClick={() => onOpenDerby(derby.id)}>
                  <div className="derby-card__topline">
                    <span className="derby-card__number">DERBY № {derby.id.slice(-4).toUpperCase()}</span>
                    <span className={`status-stamp ${derbyTiming(derby) === 'Live now' ? 'status-stamp--live' : ''}`}>{derbyTiming(derby)}</span>
                  </div>
                  <span className="derby-card__crest"><Trophy size={27} /></span>
                  <h3>{derby.name}</h3>
                  <p><MapPin size={16} /> {derby.bodyOfWaterName}</p>
                  <div className="derby-card__stats">
                    <span><b>{derbyCatches.length}</b> catches</span>
                    <span><b>{derby.scoringStyle === 'best_n' ? `Best ${derby.bestN ?? 5}` : derby.scoringStyle ?? 'Biggest'}</b> · {scoringLabel(derby)}</span>
                  </div>
                  <div className="derby-card__footer">
                    <span>{pending ? `${pending} saved on this phone` : 'Everything synced'}</span>
                    <ArrowRight size={19} />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-card">
            <span><Fish size={42} /></span>
            <div><h3>No derbies yet.</h3><p>Start one before the cooler gets warm.</p></div>
            <button className="text-button" type="button" onClick={onCreate}>Create the first one <ArrowRight size={18} /></button>
          </div>
        )}
      </section>
    </main>
  );
}
