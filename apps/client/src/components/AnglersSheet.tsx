import { useRef, useState } from 'react';
import type { Derby, DerbyParticipant, User } from '@dink-derby/shared-types';
import { Sheet } from './Sheet';
import { apiFetch } from '../lib/api';
import { applyMembershipPatches } from '../data/derbyAccess';
import { syncService } from '../sync';

export function AnglersSheet({ derby, participants, users, userId, onClose }: {
  derby: Derby; participants: DerbyParticipant[]; users: User[]; userId?: string; onClose: () => void;
}) {
  const [selected, setSelected] = useState<DerbyParticipant>();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const isCreator = userId === derby.createdByUserId;
  const name = (person: DerbyParticipant) => person.nickname || users.find(user => user.id === person.userId)?.displayName || 'Angler';

  async function remove() {
    if (!selected || inFlight.current) return;
    if (!navigator.onLine) { setError('Connect to remove an angler. Nothing has changed.'); return; }
    inFlight.current = true; setRemoving(true); setError('');
    try {
      const [response, { RemoveAnglerResponseSchema }] = await Promise.all([
        apiFetch(`/derbies/${encodeURIComponent(derby.id)}/anglers/${encodeURIComponent(selected.userId)}/remove`, { method: 'POST' }),
        import('@dink-derby/shared-types'),
      ]);
      const { participant } = RemoveAnglerResponseSchema.parse(await response.json());
      await applyMembershipPatches([participant]);
      syncService.requestSync();
      setNotice(`${name(selected)} was removed.`); setSelected(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not confirm removal. Try again.'); }
    finally { inFlight.current = false; setRemoving(false); }
  }

  return <Sheet titleId="anglers-title" onClose={onClose} busy={removing}>
    {selected ? <>
      <h2 id="anglers-title">Remove {name(selected)}?</h2>
      <p className="sheet__intro">Remove this angler from {derby.name}?</p>
      <p>They will keep read-only derby history, but cannot add catches, post, or rejoin using an invite code or QR code.</p>
      <p>Existing catches and messages stay in derby history, but their catches no longer count in standings or biggest fish. This cannot be undone here.</p>
      <p>The derby stays in their Past derbies. Their phone updates when it next connects.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="finish-actions">
        <button autoFocus type="button" className="button button--paper" disabled={removing} onClick={() => { setSelected(undefined); setError(''); }}>Keep angler</button>
        <button type="button" className="button button--primary" disabled={removing} onClick={() => void remove()}>{removing ? 'Removing…' : 'Confirm removal'}</button>
      </div>
    </> : <>
      <h2 id="anglers-title">Anglers</h2>
      {isCreator && <p className="sheet__intro">As the creator, you can remove an angler from this derby.</p>}
      {notice && <p role="status">{notice}</p>}
      <ul className="angler-list" aria-label="Derby anglers">
        {participants.filter(person => !person.removedAt).map(person => <li key={person.id}>
          <div><strong>{name(person)}</strong>{person.userId === derby.createdByUserId && <small>Creator</small>}</div>
          {isCreator && person.userId !== userId && <button type="button" className="button button--paper" aria-label={`Remove ${name(person)}`} onClick={() => { setSelected(person); setError(''); setNotice(''); }}>Remove</button>}
        </li>)}
      </ul>
      {participants.some(person => person.removedAt) && <details><summary>Removed anglers</summary><ul className="angler-list">{participants.filter(person => person.removedAt).map(person => <li key={person.id}><strong>{name(person)}</strong><small>Removed</small></li>)}</ul></details>}
    </>}
  </Sheet>;
}
