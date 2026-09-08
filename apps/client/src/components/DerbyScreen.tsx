import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  Flag,
  Pencil,
} from 'lucide-react';
import type { Catch, Derby, Reaction, User } from '@dink-derby/shared-types';
import { db } from '../db';
import { buildLeaderboard, findBiggestFish, formatScore, scoringLabel, scoringRuleLabel, type BiggestFish } from '../domain/leaderboard';
import { finishDerby, sendMessage, setCatchRemoved, toggleReaction } from '../data/operations';
import { catchWithinDerby, isDerbyComplete } from '../domain/derbyLifecycle';
import { useSyncStatus } from '../sync/useSyncStatus';
import { syncService } from '../sync';
import { getMediaDownloadUrl } from '../lib/api';
import { Sheet } from './Sheet';
import { EditCatchSheet } from './EditCatchSheet';
import type { DerbySection } from '../domain/navigation';
import { DerbyMap } from './DerbyMap';
import { InviteQr } from './InviteQr';

type DerbyScreenProps = {
  derby: Derby;
  tab: DerbySection;
  onTabChange: (section: DerbySection, replace?: boolean) => void;
  currentUser?: User;
  onBack: () => void;
  onLogCatch: () => void;
  suspendPhotos?: boolean;
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
            aria-pressed={reacted}
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
    if (mediaId && (media?.bytes || media?.blob)) {
      objectUrl = URL.createObjectURL(media.bytes ? new Blob([media.bytes], { type: media.contentType }) : media.blob!);
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
  }, [media, mediaId]);

  if (!mediaId) return null;
  if (!url) return <div className="catch-photo catch-photo--fallback" role="img" aria-label={alt}><Fish size={54} strokeWidth={1.4} /><span>PHOTO UNAVAILABLE</span></div>;
  return <img className="catch-photo" src={url} alt={alt} loading="lazy" decoding="async" />;
}

export function DerbyScreen({ derby, tab, onTabChange: setTab, currentUser, onBack, onLogCatch, suspendPhotos }: DerbyScreenProps) {
  const complete = isDerbyComplete(derby);
  const wasComplete = useRef(complete);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [editingCatch, setEditingCatch] = useState<Catch>();
  const [catchNotice, setCatchNotice] = useState('');
  const [restoringId, setRestoringId] = useState<string>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');
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
  const scoredCatches = catches.filter(item => catchWithinDerby(derby, item));
  const winners = leaderboard.filter(row => row.score > 0 && row.score === leaderboard[0]?.score && row.catchCount === leaderboard[0]?.catchCount);
  const completionPending = useLiveQuery(() => db.syncOutbox.where('derbyId').equals(derby.id).filter(op => op.entityType === 'derby').count(), [derby.id]);

  useEffect(() => {
    if (complete && !wasComplete.current) setTab('standings', true);
    wasComplete.current = complete;
  }, [complete, setTab]);

  async function completeDerby() {
    setFinishing(true);
    setFinishError('');
    try { await finishDerby(derby.id); setConfirmFinish(false); }
    catch (error) { setFinishError(error instanceof Error ? error.message : 'Could not finish derby.'); }
    finally { setFinishing(false); }
  }

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
      ...catches.filter(item => !item.deletedAt).map((item) => ({ kind: 'catch' as const, date: item.caughtAt, item })),
      ...messages.map((item) => ({ kind: 'message' as const, date: item.sentAt, item })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [catches, messages],
  );

  async function copyInvite() {
    if (!derby.inviteCode) return;
    setCopyError('');
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(derby.inviteCode);
      setToast('Invite code copied');
    } catch { setCopyError('Could not copy automatically. Select the code above and copy it.'); }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || sending) return;
    const next = message;
    setSending(true); setMessageError('');
    try { await sendMessage(derby.id, next); setMessage(''); }
    catch { setMessageError('Message not saved. Your text is still here; try again.'); }
    finally { setSending(false); }
  }

  async function restoreCatch(id: string) {
    setRestoringId(id);
    try { await setCatchRemoved(id, false); setCatchNotice('Catch restored. Standings updated on this device.'); }
    catch (reason) { setCatchNotice(reason instanceof Error ? reason.message : 'Could not restore this catch.'); }
    finally { setRestoringId(undefined); }
  }

  const removedCatches = catches.filter(item => item.deletedAt && item.userId === currentUser?.id);

  return (
    <main className="derby-screen page-width">
      <div className="derby-topline">
        <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={19} /> All derbies</button>
        <button className="invite-button" type="button" onClick={() => setInviteOpen(true)}><Users size={17} /> Invite anglers</button>
      </div>

      <section className="derby-banner">
        <div className="derby-banner__copy">
          <p className="eyebrow">{!complete && <span className="live-dot" />} {complete ? 'COMPLETED DERBY' : 'LIVE DERBY'}</p>
          <div className="derby-title-row"><h1>{derby.name}</h1>
            {!complete && currentUser?.id === derby.createdByUserId && <button className="button button--paper finish-derby-button" type="button" onClick={() => setConfirmFinish(true)}><Flag size={18} /> Finish derby</button>}
          </div>
          <p className="derby-location"><MapPin size={17} /> {derby.bodyOfWaterName}</p>
          <div className="derby-banner__facts">
            {(complete || derby.endsAt) && <span><Clock3 size={18} /><b>{complete ? `Ended ${new Date(derby.endsAt || derby.updatedAt).toLocaleString()}` : formatRemaining(derby.endsAt)}</b></span>}
            <span><Users size={18} /><b>{participants.length} angler{participants.length === 1 ? '' : 's'}</b></span>
            <span><Fish size={18} /><b>{scoredCatches.length} catch{scoredCatches.length === 1 ? '' : 'es'}</b></span>
          </div>
        </div>
        {scoredCatches.length > 0 && <div className="derby-banner__leader">
          <span className="leader-kicker"><Trophy size={17} /> {complete ? 'TOP SCORE' : 'LEADER'}</span>
          <strong>{leaderboard[0] ? formatScore(derby, leaderboard[0].score) : '—'}<small>{scoringLabel(derby)}</small></strong>
          <p>{leaderboard[0]?.displayName || 'No catches yet'}</p>
        </div>}
      </section>

      <div className={`field-status field-status--${sync.phase}`}>
        <span>{sync.phase === 'idle' && !sync.pendingCount ? <Check size={17} /> : <ShieldCheck size={17} />}</span>
        <p><strong>{sync.message}</strong>{sync.pendingCount ? ` · ${sync.pendingCount} item${sync.pendingCount === 1 ? '' : 's'} waiting` : ''}</p>
        {sync.phase === 'error' && <button type="button" onClick={() => void syncService.retry()}>Try again</button>}
        {sync.rejectedEditCount > 0 && <button type="button" onClick={() => void syncService.dismissRejectedEdits().catch(() => setToast('Could not dismiss the rejected edit. Try again.'))}>Use server version</button>}
      </div>

      {complete && <section className="completion-summary" aria-label="Derby results summary">
        <p className="eyebrow">{winners.length > 1 ? 'JOINT WINNERS' : 'WINNER'}</p>
        <h2>{winners.length ? winners.map(row => row.displayName).join(' & ') : 'No scoring catches'}</h2>
        <p>{scoredCatches.length} catch{scoredCatches.length === 1 ? '' : 'es'} · {participants.length} angler{participants.length === 1 ? '' : 's'} · {scoringRuleLabel(derby)}</p>
        {!!completionPending && <p role="status">Completion saved on this device — waiting for server confirmation.</p>}
        <p className="completion-note">Catch entry is closed. Catches recorded before the end time may still arrive from offline phones and update these results.</p>
      </section>}

      <nav className="derby-tabs" aria-label="Derby sections">
        <button type="button" className={tab === 'feed' ? 'active' : ''} aria-pressed={tab === 'feed'} onClick={() => setTab('feed')}><MessageCircle size={18} /> Catches & chat</button>
        <button type="button" className={tab === 'standings' ? 'active' : ''} aria-pressed={tab === 'standings'} onClick={() => setTab('standings')}><Trophy size={18} /> {complete ? 'Results' : 'Standings'}</button>
        <button type="button" className={tab === 'map' ? 'active' : ''} aria-pressed={tab === 'map'} onClick={() => setTab('map')}><MapPin size={18} /> Map</button>
        <button type="button" className={tab === 'rules' || tab === 'activity' ? 'active' : ''} aria-pressed={tab === 'rules' || tab === 'activity'} onClick={() => setTab('rules')}><Ruler size={18} /> Rules & info</button>
      </nav>

      {tab === 'map' && <DerbyMap derby={derby} catches={catches} users={users} currentUserId={currentUser?.id} suspended={suspendPhotos} />}

      {tab === 'feed' && (
        <section className="feed-layout">
          <div className="feed-column">
            <div className="section-title-row section-title-row--compact">
              <h2>Catches & chat</h2>
            </div>
            {catchNotice && <p className="catch-notice" role="status">{catchNotice}</p>}

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
                      {!complete && item.userId === currentUser?.id && <button className="catch-edit-button" type="button" onClick={() => setEditingCatch(item)}><Pencil size={16} /> Edit catch</button>}
                      {item.isPendingSync && <span className="pending-tag">PENDING</span>}
                    </header>
                    <LocalPhoto mediaId={suspendPhotos ? undefined : item.photoMediaId} alt={`${item.species || 'Fish'} logged by ${author}`} />
                    <div className="catch-card__body">
                      <div><p className="fish-species">{item.species || 'Fish'}</p>{item.note && <p>{item.note}</p>}</div>
                      <strong className="catch-measure">{measure ?? '—'}<small>{scoringLabel(derby)}</small></strong>
                    </div>
                    <footer>
                      <ReactionBar derbyId={derby.id} targetType="catch" targetId={item.id} reactions={reactions} currentUserId={currentUser?.id} />
                      <span>{!catchWithinDerby(derby, item) ? 'Outside derby cutoff · not scored' : item.isPendingSync ? 'Provisional score' : 'Counts in standings'}</span>
                    </footer>
                  </article>
                );
            })}
            </div> : <div className="empty-feed"><Fish size={42} /><h3>No catches or messages yet</h3></div>}

            {removedCatches.length > 0 && <details className="removed-catches"><summary>Removed catches ({removedCatches.length})</summary>
              {removedCatches.map(item => <div key={item.id}><span>{item.species || 'Fish'} · {new Date(item.caughtAt).toLocaleString()}</span>
                {!complete && <button className="button button--paper" type="button" disabled={!!restoringId} onClick={() => void restoreCatch(item.id)}>{restoringId === item.id ? 'Restoring…' : 'Restore catch'}</button>}</div>)}
              {complete && <p>This derby is closed. Removed catches do not count in results.</p>}
            </details>}

            <form className="chat-composer" onSubmit={submitMessage}>
              <label className="sr-only" htmlFor="derby-chat">Message the derby</label>
              <input id="derby-chat" value={message} disabled={sending} onChange={(event) => setMessage(event.target.value)} placeholder="Message the derby" maxLength={300} />
              <button type="submit" aria-label="Send message" disabled={sending || !message.trim()}><Send size={18} /><span>{sending ? 'Sending…' : 'Send'}</span></button>
            </form>
            {messageError && <p className="form-error" role="alert">{messageError}</p>}
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
          <div className="section-title-row"><h2>{complete ? 'Derby results' : 'Leaderboard'}</h2><span>{scoringRuleLabel(derby)}</span></div>
          {biggestFish && <BiggestFishCard derby={derby} biggest={biggestFish} />}
          <Leaderboard derby={derby} rows={leaderboard} currentUserId={currentUser?.id} detailed />
        </section>
      )}

      {tab === 'activity' && (
        <section className="single-panel activity-panel">
          <button className="text-button" type="button" onClick={() => setTab('rules')}><ArrowLeft size={18} /> Back to rules & info</button>
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
          <p className="organizer-label">Organizer: {userById.get(derby.createdByUserId)?.displayName || 'Derby organizer'}{currentUser?.id === derby.createdByUserId ? ' (you)' : ''}</p>
          <div className="rule-grid">
            <Rule icon={derby.scoringMode === 'weight' ? <Scale /> : derby.scoringMode === 'length' ? <Ruler /> : <Fish />} label="Measurement" value={derby.scoringMode === 'count' ? 'No measurement required' : `${derby.scoringMode === 'weight' ? 'Weight' : 'Length'} · ${scoringLabel(derby)}`} />
            <Rule icon={<Trophy />} label="Scoring" value={scoringRuleLabel(derby)} />
            <Rule icon={<Trophy />} label="Ties" value="More catches wins; equal score and catch count share the place" />
            <Rule icon={<Fish />} label="Catch entry" value="One fish per entry" />
            {derby.scoringMode !== 'count' && <Rule icon={<Scale />} label="Biggest fish" value="Tracked separately in standings" />}
            <Rule icon={<Fish />} label="Species" value={derby.speciesFilter || 'Open species'} />
            <Rule icon={<Camera />} label="Photo" value="Optional" />
            <Rule icon={<ShieldCheck />} label="Offline catches" value="Saved locally until synced" />
          </div>
          <button className="button button--paper" type="button" onClick={() => setTab('activity')}><Clock3 size={18} /> View activity</button>
        </section>
      )}

      {!complete && <div className="catch-action-bar"><button className="button button--primary" type="button" onClick={onLogCatch}><Fish size={20} /> Log a catch</button></div>}
      {editingCatch && <EditCatchSheet key={editingCatch.id} item={editingCatch} derby={derby} onClose={() => setEditingCatch(undefined)} onSaved={removed => {
        setEditingCatch(undefined); setCatchNotice(removed ? 'Catch removed. You can restore it under Removed catches while the derby is active.' : 'Catch updated. Standings updated on this device.');
      }} />}
      {inviteOpen && <Sheet titleId="invite-title" onClose={() => setInviteOpen(false)}>
        <h2 id="invite-title">Invite anglers</h2>
        <p className="sheet__intro">Show this QR code to another angler, or share the invite code below.</p>
        {derby.inviteCode && <InviteQr code={derby.inviteCode} name={derby.name} />}
        {!complete && !!completionPending && <p role="status">This derby needs to sync before other anglers can join.</p>}
        <div className="field-form"><label><span>Invite code</span><input className="invite-code" readOnly value={derby.inviteCode || ''} onFocus={event => event.target.select()} /></label>
          <button className="button button--primary" type="button" onClick={() => void copyInvite()} disabled={!derby.inviteCode}><Copy size={18} /> Copy invite code</button>
          {copyError && <p className="form-error" role="alert">{copyError}</p>}
        </div>
      </Sheet>}
      {confirmFinish && <Sheet titleId="finish-title" onClose={() => setConfirmFinish(false)} busy={finishing}>
          <h2 id="finish-title">Finish this derby?</h2>
          <p>Close catch entry for {derby.name} and move it to Past derbies. This cannot be undone here.</p>
          <p>{scoredCatches.length} catch{scoredCatches.length === 1 ? '' : 'es'} · {participants.length} angler{participants.length === 1 ? '' : 's'}</p>
          <div className="finish-preview"><strong>{winners.length ? `Current leader: ${winners.map(row => row.displayName).join(' & ')}` : 'No scoring catches yet'}</strong><p>{scoringRuleLabel(derby)}{leaderboard[0] ? ` · ${formatScore(derby, leaderboard[0].score)} ${scoringLabel(derby)}` : ''}</p>{biggestFish && <p>Biggest fish: {formatScore(derby, biggestFish.score)} {scoringLabel(derby)} · {biggestFish.displayName}</p>}</div>
          <p>Ask everyone to sync first. Catches already recorded on offline phones can arrive later and change the results.</p>
          {!!sync.pendingCount && <p role="status">This device has {sync.pendingCount} changes waiting to sync. Completion will also be queued.</p>}
          {finishError && <p role="alert" className="form-error">{finishError}</p>}
          <div className="finish-actions">
            <button autoFocus className="button button--paper" type="button" disabled={finishing} onClick={() => setConfirmFinish(false)}>Keep fishing</button>
            <button className="button button--primary" type="button" disabled={finishing} onClick={() => void completeDerby()}>{finishing ? 'Finishing…' : 'Finish and view results'}</button>
          </div>
      </Sheet>}
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
      {rows.map((row) => {
        const rank = rows.findIndex(other => other.score === row.score && other.catchCount === row.catchCount) + 1;
        return (
        <li key={row.userId} className={row.userId === currentUserId ? 'is-you' : ''}>
          <span className={`rank rank--${rank}`}>{rank}</span>
          <span className="mini-avatar mini-avatar--paper">{initials(row.displayName)}</span>
          <span className="leaderboard__angler"><strong>{row.displayName}{row.userId === currentUserId ? ' · YOU' : ''}</strong><small>{row.catchCount} catch{row.catchCount === 1 ? '' : 'es'}{row.pendingCount ? ` · ${row.pendingCount} pending` : ''}</small></span>
          <strong className="leaderboard__score">{formatScore(derby, row.score)}<small>{scoringLabel(derby)}</small></strong>
        </li>
      ); })}
    </ol>
  );
}

function Rule({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rule-card"><span>{icon}</span><p><small>{label}</small><strong>{value}</strong></p></div>;
}

function ActivityRow({ event, userById }: { event: import('../db').DerbyEventEntry; userById: Map<string, User> }) {
  const payload = event.payload as { userId?: string; createdByUserId?: string; deletedAt?: string; displayName?: string; species?: string; lengthInInches?: number; weightInPounds?: number; count?: number; text?: string; reaction?: string } | undefined;
  const authorId = payload?.userId || payload?.createdByUserId;
  const userName = authorId ? userById.get(authorId)?.displayName || 'Someone' : 'Someone';

  let text = '';
  if (event.type === 'catch.create') {
    const species = payload?.species || 'a fish';
    const measure = payload?.lengthInInches ? `${payload.lengthInInches} in` : payload?.weightInPounds ? `${payload.weightInPounds} lb` : payload?.count ? `${payload.count} fish` : '';
    text = `${userName} logged ${species}${measure ? ` at ${measure}` : ''}`;
  } else if (event.type === 'catch.update') {
    text = `${userName} ${payload?.deletedAt ? 'removed' : 'updated'} a catch`;
  } else if (event.type === 'derby.update') {
    text = `${userName} finished this derby`;
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
