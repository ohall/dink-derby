import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Camera,
  Check,
  Clock3,
  Copy,
  Fish,
  Flame,
  Laugh,
  MapPin,
  MessageCircle,
  Ruler,
  Scale,
  Send,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import type { Catch, Derby, Reaction, User } from '@dink-derby/shared-types';
import { db } from '../db';
import { buildLeaderboard, findBiggestFish, formatScore, scoringLabel, scoringRuleLabel, type BiggestFish } from '../domain/leaderboard';
import { sendMessage, toggleReaction } from '../data/operations';
import { useSyncStatus } from '../sync/useSyncStatus';
import { syncService } from '../sync';
import { getMediaDownloadUrl } from '../lib/api';

type DerbyScreenProps = {
  derby: Derby;
  currentUser?: User;
  onBack: () => void;
  onLogCatch: () => void;
};

function formatRemaining(endsAt?: string) {
  if (!endsAt) return 'Open derby';
  const remaining = Math.max(0, new Date(endsAt).getTime() - Date.now());
  if (!remaining) return 'Finished';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}h ${minutes.toString().padStart(2, '0')}m left`;
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

const REACTION_KINDS: Reaction['reaction'][] = ['fire', 'fish', 'laugh', 'trophy'];

function ReactionIcon({ kind, reacted }: { kind: Reaction['reaction']; reacted: boolean }) {
  const size = 15;
  const fill = reacted ? 'currentColor' : 'none';
  switch (kind) {
    case 'fire': return <Flame size={size} fill={fill} />;
    case 'fish': return <Fish size={size} fill={fill} />;
    case 'laugh': return <Laugh size={size} fill={fill} />;
    case 'trophy': return <Trophy size={size} fill={fill} />;
  }
}

function ReactionBar({ derbyId, targetType, targetId, reactions, currentUserId }: {
  derbyId: string;
  targetType: Reaction['targetType'];
  targetId: string;
  reactions: Reaction[];
  currentUserId?: string;
}) {
  return (
    <div className="reaction-bar">
      {REACTION_KINDS.map((kind) => {
        const list = reactions.filter((reaction) => reaction.targetId === targetId && reaction.reaction === kind);
        const reacted = reactions.some((reaction) => reaction.targetId === targetId && reaction.userId === currentUserId && reaction.reaction === kind);
        return (
          <button
            key={kind}
            className={reacted ? 'reacted' : ''}
            type="button"
            aria-label={`${kind} reaction`}
            onClick={() => void toggleReaction(derbyId, targetType, targetId, kind)}
          >
            <ReactionIcon kind={kind} reacted={reacted} />
            {list.length > 0 && <span>{list.length}</span>}
          </button>
        );
      })}
    </div>
  );
}

function LocalPhoto({ mediaId, alt }: { mediaId?: string; alt: string }) {
  const media = useLiveQuery(() => (mediaId ? db.media.get(mediaId) : undefined), [mediaId]);
  const [url, setUrl] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (media?.blob) {
      objectUrl = URL.createObjectURL(media.blob);
      setUrl(objectUrl);
    } else if (media?.remoteUrl && mediaId) {
      getMediaDownloadUrl(mediaId).then((next) => {
        if (active) setUrl(next);
      }).catch(() => {
        if (active) setUrl('');
      });
    } else {
      setUrl('');
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [media]);

  if (!mediaId) return null;
  if (!url) return <div className="catch-photo catch-photo--fallback" role="img" aria-label={alt}><Fish size={54} strokeWidth={1.4} /><span>PHOTO UNAVAILABLE</span></div>;
  return <img className="catch-photo" src={url} alt={alt} />;
}

export function DerbyScreen({ derby, currentUser, onBack, onLogCatch }: DerbyScreenProps) {
  const [tab, setTab] = useState<'feed' | 'standings' | 'activity' | 'rules'>('feed');
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState('');
  const [, forceClock] = useState(0);
  const sync = useSyncStatus();
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const participants = useLiveQuery(() => db.derbyParticipants.where('derbyId').equals(derby.id).toArray(), [derby.id]) ?? [];
  const catches = useLiveQuery(() => db.catches.where('derbyId').equals(derby.id).reverse().sortBy('caughtAt'), [derby.id]) ?? [];
  const messages = useLiveQuery(() => db.chatMessages.where('derbyId').equals(derby.id).reverse().sortBy('sentAt'), [derby.id]) ?? [];
  const reactions = useLiveQuery(() => db.reactions.where('derbyId').equals(derby.id).toArray(), [derby.id]) ?? [];
  const events = useLiveQuery(() => db.derbyEvents.where('derbyId').equals(derby.id).reverse().sortBy('sequence'), [derby.id]) ?? [];
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const leaderboard = useMemo(() => buildLeaderboard(derby, catches, participants, users), [derby, catches, participants, users]);
  const biggestFish = useMemo(() => findBiggestFish(derby, catches, participants, users), [derby, catches, participants, users]);

  useEffect(() => {
    const interval = window.setInterval(() => forceClock((value) => value + 1), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const feed = useMemo(
    () => [
      ...catches.map((item) => ({ kind: 'catch' as const, date: item.caughtAt, item })),
      ...messages.map((item) => ({ kind: 'message' as const, date: item.sentAt, item })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [catches, messages],
  );

  async function copyInvite() {
    if (!derby.inviteCode) return;
    await navigator.clipboard?.writeText(derby.inviteCode).catch(() => undefined);
    setToast(`${derby.inviteCode} copied`);
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    const next = message;
    setMessage('');
    await sendMessage(derby.id, next);
  }

  return (
    <main className="derby-screen page-width">
      <div className="derby-topline">
        <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={19} /> All derbies</button>
        <button className="invite-button" type="button" onClick={copyInvite}><Copy size={17} /> {derby.inviteCode || 'Invite crew'}</button>
      </div>

      <section className="derby-banner">
        <div className="derby-banner__copy">
          <p className="eyebrow"><span className="live-dot" /> {derby.status === 'finished' ? 'FINAL RESULTS' : 'LIVE DERBY'}</p>
          <h1>{derby.name}</h1>
          <p className="derby-location"><MapPin size={17} /> {derby.bodyOfWaterName}</p>
          <div className="derby-banner__facts">
            <span><Clock3 size={18} /><b>{formatRemaining(derby.endsAt)}</b></span>
            <span><Users size={18} /><b>{participants.length} anglers</b></span>
            <span><Fish size={18} /><b>{catches.length} catches</b></span>
          </div>
        </div>
        <div className="derby-banner__leader">
          <span className="leader-kicker"><Trophy size={17} /> LEADER</span>
          <strong>{leaderboard[0] ? formatScore(derby, leaderboard[0].score) : '—'}<small>{scoringLabel(derby)}</small></strong>
          <p>{leaderboard[0]?.displayName || 'No catches yet'}</p>
          <button className="button button--coral" type="button" onClick={onLogCatch}><Camera size={20} /> Log a catch</button>
        </div>
      </section>

      <div className={`field-status field-status--${sync.phase}`}>
        <span>{sync.phase === 'idle' && !sync.pendingCount ? <Check size={17} /> : <ShieldCheck size={17} />}</span>
        <p><strong>{sync.message}</strong>{sync.pendingCount ? ` · ${sync.pendingCount} item${sync.pendingCount === 1 ? '' : 's'} waiting` : ''}</p>
        {sync.phase === 'error' && <button type="button" onClick={() => void syncService.retry()}>Try again</button>}
      </div>

      <nav className="derby-tabs" aria-label="Derby sections">
        <button type="button" className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}><MessageCircle size={18} /> Feed</button>
        <button type="button" className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}><Trophy size={18} /> Standings</button>
        <button type="button" className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><Clock3 size={18} /> Activity</button>
        <button type="button" className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}><Ruler size={18} /> Rules</button>
      </nav>

      {tab === 'feed' && (
        <section className="feed-layout">
          <div className="feed-column">
            <div className="section-title-row section-title-row--compact">
              <h2>Derby feed</h2>
              <button className="button button--primary button--small" type="button" onClick={onLogCatch}><Camera size={18} /> Log catch</button>
            </div>

            {feed.length ? <div className="feed-list">
              {feed.map((entry) => {
                const author = userById.get(entry.item.userId)?.displayName || 'Angler';
                if (entry.kind === 'message') {
                  return (
                    <article className="message-card" key={entry.item.id}>
                      <span className="mini-avatar mini-avatar--lake">{initials(author)}</span>
                      <div>
                        <p><strong>{author}</strong> {entry.item.text}</p>
                        <small>{relativeTime(entry.item.sentAt)} {entry.item.isPendingSync ? '· saved here' : ''}</small>
                        <ReactionBar derbyId={derby.id} targetType="chatMessage" targetId={entry.item.id} reactions={reactions} currentUserId={currentUser?.id} />
                      </div>
                    </article>
                  );
                }
                const item = entry.item as Catch;
                const measure = derby.scoringMode === 'weight' ? item.weightInPounds : derby.scoringMode === 'count' ? item.count : item.lengthInInches;
                return (
                  <article className="catch-card" key={item.id}>
                    <header>
                      <span className="mini-avatar mini-avatar--gold">{initials(author)}</span>
                      <div><strong>{author}</strong><small>{relativeTime(item.caughtAt)} · {item.isPendingSync ? 'saved on this phone' : 'synced'}</small></div>
                      {item.isPendingSync && <span className="pending-tag">PENDING</span>}
                    </header>
                    <LocalPhoto mediaId={item.photoMediaId} alt={`${item.species || 'Fish'} logged by ${author}`} />
                    <div className="catch-card__body">
                      <div><p className="fish-species">{item.species || 'Fish'}</p>{item.note && <p>{item.note}</p>}</div>
                      <strong className="catch-measure">{measure ?? '—'}<small>{scoringLabel(derby)}</small></strong>
                    </div>
                    <footer>
                      <ReactionBar derbyId={derby.id} targetType="catch" targetId={item.id} reactions={reactions} currentUserId={currentUser?.id} />
                      <span>{item.isPendingSync ? 'Provisional score' : 'Counts in standings'}</span>
                    </footer>
                  </article>
                );
              })}
            </div> : <div className="empty-feed"><Fish size={42} /><h3>No catches or messages yet</h3></div>}

            <form className="chat-composer" onSubmit={submitMessage}>
              <label className="sr-only" htmlFor="derby-chat">Message the derby</label>
              <input id="derby-chat" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message the derby" maxLength={300} />
              <button type="submit" aria-label="Send message"><Send size={18} /></button>
            </form>
          </div>

          <aside className="standings-peek">
            <h2>Standings</h2>
            <Leaderboard derby={derby} rows={leaderboard} currentUserId={currentUser?.id} />
            <button className="text-button" type="button" onClick={() => setTab('standings')}>See full standings</button>
          </aside>
        </section>
      )}

      {tab === 'standings' && (
        <section className="single-panel standings-full">
          <div className="section-title-row"><h2>Leaderboard</h2><span>{scoringRuleLabel(derby)}</span></div>
          {biggestFish && <BiggestFishCard derby={derby} biggest={biggestFish} />}
          <Leaderboard derby={derby} rows={leaderboard} currentUserId={currentUser?.id} detailed />
        </section>
      )}

      {tab === 'activity' && (
        <section className="single-panel activity-panel">
          <div className="section-title-row"><h2>Derby activity</h2><span>{events.length} event{events.length === 1 ? '' : 's'}</span></div>
          {events.length ? (
            <div className="activity-list">
              {events.map((event) => (
                <ActivityRow key={event.id} event={event} userById={userById} />
              ))}
            </div>
          ) : (
            <div className="empty-feed"><Clock3 size={42} /><h3>No activity yet</h3><p>Catches, reactions, and chat will show up here.</p></div>
          )}
        </section>
      )}

      {tab === 'rules' && (
        <section className="single-panel rules-panel">
          <div><h2>Derby rules</h2></div>
          <div className="rule-grid">
            <Rule icon={derby.scoringMode === 'weight' ? <Scale /> : derby.scoringMode === 'length' ? <Ruler /> : <Fish />} label="Measurement" value={derby.scoringMode === 'count' ? 'No measurement required' : `${derby.scoringMode === 'weight' ? 'Weight' : 'Length'} · ${scoringLabel(derby)}`} />
            <Rule icon={<Trophy />} label="Scoring" value={scoringRuleLabel(derby)} />
            <Rule icon={<Fish />} label="Catch entry" value="One fish per entry" />
            {derby.scoringMode !== 'count' && <Rule icon={<Scale />} label="Biggest fish" value="Tracked separately in standings" />}
            <Rule icon={<Fish />} label="Species" value={derby.speciesFilter || 'Open species'} />
            <Rule icon={<Camera />} label="Photo" value="Optional" />
            <Rule icon={<ShieldCheck />} label="Offline catches" value="Saved locally until synced" />
          </div>
        </section>
      )}

      <button className="floating-catch-button" type="button" onClick={onLogCatch}><Camera size={20} /> Log catch</button>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function BiggestFishCard({ derby, biggest }: { derby: Derby; biggest: BiggestFish }) {
  return (
    <div className="biggest-fish-card">
      <span><Fish size={25} /></span>
      <div><small>Biggest fish</small><strong>{biggest.displayName}</strong><p>{biggest.item.species || 'Fish'}</p></div>
      <strong>{formatScore(derby, biggest.score)}<small>{scoringLabel(derby)}</small></strong>
    </div>
  );
}

function Leaderboard({ derby, rows, currentUserId, detailed = false }: { derby: Derby; rows: ReturnType<typeof buildLeaderboard>; currentUserId?: string; detailed?: boolean }) {
  return (
    <ol className={`leaderboard ${detailed ? 'leaderboard--detailed' : ''}`}>
      {rows.map((row, index) => (
        <li key={row.userId} className={row.userId === currentUserId ? 'is-you' : ''}>
          <span className={`rank rank--${index + 1}`}>{index + 1}</span>
          <span className="mini-avatar mini-avatar--paper">{initials(row.displayName)}</span>
          <span className="leaderboard__angler"><strong>{row.displayName}{row.userId === currentUserId ? ' · YOU' : ''}</strong><small>{row.catchCount} catch{row.catchCount === 1 ? '' : 'es'}{row.pendingCount ? ` · ${row.pendingCount} pending` : ''}</small></span>
          <strong className="leaderboard__score">{formatScore(derby, row.score)}<small>{scoringLabel(derby)}</small></strong>
        </li>
      ))}
    </ol>
  );
}

function Rule({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rule-card"><span>{icon}</span><p><small>{label}</small><strong>{value}</strong></p></div>;
}

function ActivityRow({ event, userById }: { event: import('../db').DerbyEventEntry; userById: Map<string, User> }) {
  const payload = event.payload as { userId?: string; displayName?: string; species?: string; lengthInInches?: number; weightInPounds?: number; count?: number; text?: string; reaction?: string } | undefined;
  const userName = payload?.userId ? userById.get(payload.userId)?.displayName || 'Someone' : 'Someone';

  let text = '';
  if (event.type === 'catch.create') {
    const species = payload?.species || 'a fish';
    const measure = payload?.lengthInInches ? `${payload.lengthInInches} in` : payload?.weightInPounds ? `${payload.weightInPounds} lb` : payload?.count ? `${payload.count} fish` : '';
    text = `${userName} logged ${species}${measure ? ` at ${measure}` : ''}`;
  } else if (event.type === 'chatMessage.create') {
    text = `${userName} said "${payload?.text ?? '…'}"`;
  } else if (event.type === 'reaction.create') {
    text = `${userName} reacted with ${payload?.reaction ?? 'a reaction'}`;
  } else if (event.type === 'derby.create') {
    text = `${userName} started this derby`;
  } else if (event.type === 'derbyParticipant.create') {
    text = `${userName} joined the derby`;
  } else {
    text = event.type;
  }

  return (
    <div className="activity-row">
      <small>{relativeTime(event.serverCreatedAt)}</small>
      <p>{text}</p>
    </div>
  );
}
