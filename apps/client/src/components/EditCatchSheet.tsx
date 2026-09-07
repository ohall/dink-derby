import { FormEvent, useState } from 'react';
import type { Catch, Derby } from '@dink-derby/shared-types';
import { correctCatch, setCatchRemoved } from '../data/operations';
import { Sheet } from './Sheet';

export function EditCatchSheet({ item, derby, onClose, onSaved }: {
  item: Catch; derby: Derby; onClose: () => void; onSaved: (removed: boolean) => void;
}) {
  const [measurement, setMeasurement] = useState(String((derby.scoringMode === 'weight' ? item.weightInPounds : item.lengthInInches) ?? ''));
  const [species, setSpecies] = useState(item.species || '');
  const [note, setNote] = useState(item.note || '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try {
      await correctCatch(item.id, { measurement: measurement ? Number(measurement) : undefined, species, note });
      onSaved(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save your changes.'); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (saving) return;
    setSaving(true); setError('');
    try { await setCatchRemoved(item.id, true); onSaved(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove this catch.'); }
    finally { setSaving(false); }
  }
  return <Sheet titleId="edit-catch-title" onClose={onClose} closeLabel="Cancel" busy={saving}>
    <h2 id="edit-catch-title">Edit catch</h2>
    <p className="sheet__intro">Update this fish’s details. Its original catch time and photo stay unchanged.</p>
    <form className="field-form" onSubmit={save}>
      {derby.scoringMode !== 'count' && <label><span>{derby.scoringMode === 'weight' ? 'Weight (lb)' : 'Length (in)'}</span>
        <input type="number" inputMode="decimal" min="0.01" max="999" step="0.01" required disabled={saving} value={measurement} onChange={event => setMeasurement(event.target.value)} />
      </label>}
      {derby.scoringMode === 'count' && <p>One fish per entry. Remove this catch if it was added by mistake.</p>}
      <label><span>Species <small>optional</small></span><input value={species} disabled={saving} onChange={event => setSpecies(event.target.value)} /></label>
      <label><span>Note <small>optional</small></span><input value={note} maxLength={500} disabled={saving} onChange={event => setNote(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button--primary button--full" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      {confirmRemove ? <div className="remove-confirmation">
        <p>Remove this fish from the derby and standings? You can restore it while the derby is active.</p>
        <div className="finish-actions"><button className="button button--paper" type="button" disabled={saving} onClick={() => setConfirmRemove(false)}>Keep catch</button>
          <button className="button button--danger" type="button" disabled={saving} onClick={() => void remove()}>Confirm removal</button></div>
      </div> : <button className="button button--paper" type="button" disabled={saving} onClick={() => setConfirmRemove(true)}>Remove catch</button>}
    </form>
  </Sheet>;
}
