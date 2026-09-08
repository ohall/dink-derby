import { FormEvent, useEffect, useRef, useState } from 'react';
import { Camera, Fish, HardDrive, Ruler, Scale, ShieldCheck, User as UserIcon } from 'lucide-react';
import type { Derby, User } from '@dink-derby/shared-types';
import { createDerby, joinDerby, saveCatch, updateProfile } from '../data/operations';
import { identifyCatch } from '../lib/api';
import { scoringRuleLabel } from '../domain/leaderboard';
import { preparePhoto } from '../utils/photo';
import { useCatchDraft } from './useCatchDraft';
import { Sheet } from './Sheet';
import { getCatchLocation } from '../utils/location';

export function CatchSheet({ derby, userId, onClose, onSaved }: { derby: Derby; userId: string; onClose: () => void; onSaved: (message?: string) => void }) {
  const { draft, update, pendingWrites, error: draftError, flush } = useCatchDraft(derby.id, userId, derby.speciesFilter || '');
  const [preview, setPreview] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [saving, setSaving] = useState(false);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const photoTask = useRef<AbortController>();
  const submitting = useRef(false);
  const photo = draft?.photo;
  const measurement = draft?.measurement ?? '';

  useEffect(() => {
    if (!photo) return setPreview('');
    const url = URL.createObjectURL(new Blob([photo.bytes], { type: photo.contentType }));
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => () => photoTask.current?.abort(), []);

  async function selectPhoto(file?: File) {
    if (!file) return;
    photoTask.current?.abort();
    const task = new AbortController();
    photoTask.current = task;
    setPreparing(true);
    setPhotoError('');
    // Drop the old preview before starting another decode.
    await update({ photo: undefined });
    try {
      const prepared = await preparePhoto(file, task.signal);
      if (!task.signal.aborted) await update({ photo: prepared });
    } catch (reason) {
      if (!task.signal.aborted) setPhotoError(reason instanceof Error ? reason.message : 'This photo could not be prepared. You can save without it.');
    } finally {
      if (!task.signal.aborted) setPreparing(false);
    }
  }

  function removePhoto() {
    photoTask.current?.abort();
    setPreparing(false);
    setPhotoError('');
    void update({ photo: undefined });
  }

  async function close() {
    if (submitting.current) return;
    photoTask.current?.abort();
    // Never claim a draft was saved or discard its in-memory fields after a
    // quota/write failure. Keep the form open so saving or retrying is possible.
    if (!draft || await update({ isOpen: false })) onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || submitting.current) return;
    const value = measurement ? Number(measurement) : undefined;
    if (derby.scoringMode !== 'count' && (!value || !Number.isFinite(value) || value <= 0)) {
      setError(`Enter a valid ${derby.scoringMode}.`);
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError('');
    // Saving remains available during photo preparation. A cancelled photo
    // cannot hold up the fish or attach itself to a later draft.
    photoTask.current?.abort();
    try {
      await flush();
      setLocating(includeLocation);
      const { lat, lon, error: locationError } = includeLocation ? await getCatchLocation() : { lat: undefined, lon: undefined, error: undefined };
      setLocating(false);
      const { item: saved, photoError: storageError } = await saveCatch({ id: draft.id, derby, species: draft.species, measurement: value, note: draft.note, photo, lat, lon });
      if (saved.photoMediaId) void identifyCatch(saved.id).catch(() => undefined);
      const notices = [storageError || (preparing ? 'Catch saved without a photo.' : ''), locationError ? `Catch saved without a location. ${locationError}` : ''].filter(Boolean);
      onSaved(notices.join(' ') || undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The catch could not be saved.');
    } finally {
      submitting.current = false;
      setPreparing(false);
      setSaving(false);
      setLocating(false);
    }
  }

  const unit = derby.scoringMode === 'weight' ? 'lb' : derby.scoringMode === 'count' ? 'fish' : 'in';
  const requiresMeasurement = derby.scoringMode !== 'count';

  return (
    <Sheet titleId="catch-sheet-title" onClose={() => void close()} closeLabel="Save draft & close" busy={saving}>
      <h2 id="catch-sheet-title">Log a catch</h2>
      <p className="sheet__intro">One fish per entry. {scoringRuleLabel(derby)}.</p>
      <form className="field-form catch-form" onSubmit={submit}>
        {requiresMeasurement ? (
          <div className="measurement-field">
            <label htmlFor="catch-measurement">{derby.scoringMode === 'weight' ? 'Weight' : 'Length'}</label>
            <div><input id="catch-measurement" value={measurement} disabled={!draft || saving} onChange={(event) => void update({ measurement: event.target.value })} type="number" inputMode="decimal" min="0.01" max="999" step="0.01" placeholder={derby.scoringMode === 'weight' ? '2.75' : '18.50'} required aria-describedby="measurement-help" /><span>{unit}</span></div>
            <small id="measurement-help">{derby.scoringMode === 'weight' ? 'Enter pounds as a decimal (2 lb 8 oz = 2.5).' : 'Enter the length in inches.'}</small>
          </div>
        ) : (
          <div className="count-entry-summary"><Fish size={24} /><div><strong>1 fish</strong><small>No measurement needed. Tap Save catch to add it.</small></div></div>
        )}
        <label><span>Species <small>optional</small></span><input value={draft?.species ?? ''} disabled={!draft || saving} onChange={(event) => void update({ species: event.target.value })} placeholder="Fish species" /></label>
        <label className={`photo-picker ${preview ? 'photo-picker--filled' : ''}`}>
          {preview ? <img src={preview} alt="Selected catch preview" /> : <><span><Camera size={27} /></span><strong>{preparing ? 'Preparing photo…' : 'Add photo'} <small>optional</small></strong><small>Choose a photo or use your camera</small></>}
          <input aria-label="Catch photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={!draft || saving || preparing || pendingWrites > 0} onChange={(event) => {
            const input = event.currentTarget;
            // Keep the native file selection alive until reading is finished;
            // clearing it early can revoke mobile file access.
            void selectPhoto(input.files?.[0]).finally(() => { input.value = ''; });
          }} />
        </label>
        {(photo || preparing) && <button className="button button--small" type="button" disabled={saving} onClick={removePhoto}>{preparing ? 'Skip photo' : 'Remove photo'}</button>}
        {photoError && <p className="form-error" role="status">{photoError}</p>}

        <div className="catch-location-option">
          <label className="checkbox-field"><input type="checkbox" checked={includeLocation} disabled={saving} onChange={event => setIncludeLocation(event.target.checked)} aria-describedby="catch-location-help" /><span>Include my location</span></label>
          <small id="catch-location-help">Adds this catch to the map. Shared with derby members; no continuous tracking.</small>
        </div>
        <details className="catch-extras"><summary>Add a note <small>optional</small></summary>
          <div className="field-form">
            <label><span>Note</span><input value={draft?.note ?? ''} disabled={!draft || saving} onChange={(event) => void update({ note: event.target.value })} placeholder="Catch details" maxLength={500} /></label>
          </div>
        </details>
        {draftError && <p className="form-error" role="status">{draftError}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button--primary button--full button--large sheet-save" type="submit" disabled={!draft || saving}>{locating ? 'Getting location…' : saving ? 'Saving catch…' : preparing ? 'Save catch without photo' : 'Save catch'}</button>
        <p className="durable-note"><ShieldCheck size={18} /> Saved on this device first, then synced when online.</p>
      </form>
    </Sheet>
  );
}

export function CreateDerbySheet({ onClose, onCreated }: { onClose: () => void; onCreated: (derby: Derby) => void }) {
  const [name, setName] = useState('');
  const [water, setWater] = useState('');
  const [mode, setMode] = useState<Derby['scoringMode']>('length');
  const [style, setStyle] = useState<NonNullable<Derby['scoringStyle']>>('biggest');
  const [bestN, setBestN] = useState(5);
  const [species, setSpecies] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const scoringOption = style === 'best_n' ? `best_${bestN === 3 ? 3 : 5}` : style;

  function changeScoring(value: string) {
    if (value === 'best_3' || value === 'best_5') {
      setStyle('best_n');
      setBestN(value === 'best_3' ? 3 : 5);
      return;
    }
    setStyle(value as 'biggest' | 'total');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !water.trim()) { setError('Enter a derby name and the water you’re fishing.'); return; }
    setSaving(true);
    setError('');
    try {
      const derby = await createDerby({ name, bodyOfWaterName: water, scoringMode: mode, scoringStyle: style, bestN, speciesFilter: species });
      onCreated(derby);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The derby could not be created.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet titleId="create-sheet-title" onClose={onClose} busy={saving}>
      <h2 id="create-sheet-title">Start a derby</h2>
      <p className="sheet__intro">Set the water, measurement, and scoring rule.</p>
      <form className="field-form" onSubmit={submit}>
        <label><span>Derby name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekend Throwdown" required /></label>
        <label><span>Water</span><input value={water} onChange={(event) => setWater(event.target.value)} placeholder="Lake, pond, or river" required /></label>

        <fieldset className="choice-fieldset">
          <legend>What counts?</legend>
          <div className="choice-cards">
            {(['length', 'weight', 'count'] as const).map((value) => (
              <button key={value} className={mode === value ? 'active' : ''} aria-pressed={mode === value} type="button" onClick={() => setMode(value)}>
                {value === 'count' ? <Fish size={22} /> : value === 'weight' ? <Scale size={22} /> : <Ruler size={22} />}
                <strong>{value === 'count' ? 'Fish count' : value === 'weight' ? 'Weight' : 'Length'}</strong>
              </button>
            ))}
          </div>
        </fieldset>

        {mode !== 'count' ? <>
          <label><span>Scoring</span><select value={scoringOption} onChange={(event) => changeScoring(event.target.value)}><option value="biggest">Biggest single fish</option><option value="best_3">Best 3 fish</option><option value="best_5">Best 5 fish</option><option value="total">Total of all fish</option></select></label>
          <p className="rule-summary">Biggest fish is tracked separately for every {mode} derby.</p>
        </> : <p className="rule-summary">Each catch adds exactly 1 fish. No measurement is required.</p>}
        <label><span>Species <small>optional</small></span><input value={species} onChange={(event) => setSpecies(event.target.value)} placeholder="Open species" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button--primary button--full button--large" type="submit" disabled={saving}>{saving ? 'Starting derby…' : 'Create derby'}</button>
      </form>
    </Sheet>
  );
}

export function JoinDerbySheet({ onClose, onJoined }: { onClose: () => void; onJoined: (derby: Derby) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setJoining(true);
    setError('');
    try {
      onJoined(await joinDerby(code));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That derby could not be joined.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <Sheet titleId="join-sheet-title" onClose={onClose} busy={joining}>
      <h2 id="join-sheet-title">Join a derby</h2>
      <p className="sheet__intro">Enter the invite code from the derby organizer.</p>
      <form className="field-form" onSubmit={submit}>
        <label><span>Invite code</span><input className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="Paste your invite code" autoCapitalize="characters" autoComplete="off" spellCheck={false} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button--primary button--full button--large" type="submit" disabled={joining}>{joining ? 'Joining derby…' : 'Join derby'}</button>
      </form>
    </Sheet>
  );
}

export function ProfileSheet({ user, onClose }: { user?: User; onClose: () => void }) {
  const [name, setName] = useState(user?.displayName || '');
  const [usage, setUsage] = useState<{ used?: number; quota?: number }>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    navigator.storage?.estimate().then((estimate) => setUsage({ used: estimate.usage, quota: estimate.quota })).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('Enter a display name.'); return; }
    setSaving(true); setError('');
    try { await updateProfile(name.trim()); setSaved(true); onClose(); }
    catch { setError('Your name could not be saved. Please try again.'); }
    finally { setSaving(false); }
  }

  const megabytes = (value?: number) => value ? `${(value / 1_048_576).toFixed(value > 10_485_760 ? 0 : 1)} MB` : 'Unknown';

  return (
    <Sheet titleId="profile-sheet-title" onClose={onClose} busy={saving}>
      <h2 id="profile-sheet-title">Angler profile</h2>
      <p className="sheet__intro">This name appears in derbies and standings.</p>
      <form className="field-form" onSubmit={submit}>
        <div className="profile-crest"><UserIcon size={34} /></div>
        <label><span>Display name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <details className="storage-details"><summary>Device storage</summary><div className="storage-card">
          <HardDrive size={22} />
          <div><strong>Saved on this device</strong><small>{megabytes(usage.used)} used · {megabytes(usage.quota)} storage limit. This is storage, not phone memory.</small></div>
        </div></details>
        <p className="form-help">This profile belongs to this browser. Using another browser may create a different angler.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button--primary button--full" type="submit" disabled={saving}>{saved ? 'Saved' : saving ? 'Saving…' : 'Save profile'}</button>
      </form>
    </Sheet>
  );
}
