import { useEffect, useRef, useState } from 'react';
import { db, type CatchDraft } from '../db';
import { openCatchDraft } from '../data/catchDraft';

export function useCatchDraft(derbyId: string, userId: string, defaultSpecies = '') {
  const [draft, setDraft] = useState<CatchDraft>();
  const [pendingWrites, setPendingWrites] = useState(0);
  const [error, setError] = useState('');
  const current = useRef<CatchDraft>();
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    void openCatchDraft(derbyId, userId, defaultSpecies).then(value => {
      if (active) { current.current = value; setDraft(value); }
    }).catch(() => {
      if (active) setError('This device could not open your catch draft. Close this form and try again.');
    });
    return () => { active = false; };
  }, [derbyId, userId, defaultSpecies]);

  function update(fields: Partial<CatchDraft>) {
    if (!current.current) return Promise.resolve(false);
    const next = { ...current.current, ...fields, updatedAt: new Date().toISOString() };
    current.current = next;
    setDraft(next);
    setPendingWrites(count => count + 1);
    const write = writes.current.then(() => db.catchDrafts.put(next));
    // Keep subsequent writes working after a quota or storage error.
    writes.current = write.catch(() => undefined);
    return write.then(() => { setError(''); return true; }).catch(reason => {
      console.warn('Catch draft could not be persisted.', reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason));
      setError('Draft could not be backed up on this device. Save the catch before leaving this page.');
      return false;
    }).finally(() => setPendingWrites(count => count - 1));
  }

  return { draft, update, pendingWrites, error, flush: () => writes.current };
}
