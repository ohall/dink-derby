import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Camera, Fish, HardDrive, ShieldCheck, Trophy, User as UserIcon, Waves, X } from 'lucide-react';
import type { Derby, User } from '@dink-derby/shared-types';
import { createDerby, saveCatch, updateProfile } from '../data/operations';
import { db } from '../db';

function Sheet({ children, titleId, onClose }: { children: ReactNode; titleId: string; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <button className="sheet__close" type="button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        {children}
      </section>
    </div>
  );
}

export function CatchSheet({ derby, onClose, onSaved }: { derby: Derby; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [measurement, setMeasurement] = useState('');
  const [species, setSpecies] = useState('Largemouth bass');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) return setPreview('');
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(measurement);
    if (!file || !value) return;
    setSaving(true);
    setError('');
    try {
      await saveCatch({ derby, species, measurement: value, note, photo: file });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The catch could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const unit = derby.scoringMode === 'weight' ? 'lb' : derby.scoringMode === 'count' ? 'fish' : 'in';

  return (
    <Sheet titleId="catch-sheet-title" onClose={onClose}>
      <p className="eyebrow">PHOTO · MEASURE · DONE</p>
      <h2 id="catch-sheet-title">Log a catch</h2>
      <p className="sheet__intro">It saves to this phone before the network gets a vote.</p>
      <form className="field-form" onSubmit={submit}>
        <label className={`photo-picker ${preview ? 'photo-picker--filled' : ''}`}>
          {preview ? <img src={preview} alt="Selected catch preview" /> : <><span><Camera size={27} /></span><strong>Add the proof</strong><small>Take a photo or choose one</small></>}
          <input type="file" accept="image/*" capture="environment" onChange={(event) => setFile(event.target.files?.[0])} required />
        </label>

        <div className="measurement-field">
          <label htmlFor="catch-measurement">{derby.scoringMode === 'count' ? 'How many?' : derby.scoringMode === 'weight' ? 'Weight' : 'Length'}</label>
          <div><input id="catch-measurement" value={measurement} onChange={(event) => setMeasurement(event.target.value)} type="number" inputMode="decimal" min="0.01" max="999" step={derby.scoringMode === 'count' ? '1' : '0.01'} placeholder={derby.scoringMode === 'count' ? '1' : '18.50'} required /><span>{unit}</span></div>
        </div>

        <div className="form-grid">
          <label><span>Species <small>optional</small></span><input value={species} onChange={(event) => setSpecies(event.target.value)} placeholder="Largemouth bass" /></label>
          <label><span>Note <small>optional</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Where it hit, what you threw…" maxLength={500} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="button button--primary button--full button--large" type="submit" disabled={saving || !file || !measurement}>{saving ? 'Saving to this phone…' : 'Save catch'}</button>
        <p className="durable-note"><ShieldCheck size={18} /> Photo and catch are committed together. Closing the app after this is safe.</p>
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

  async function submit(event: FormEvent) {
    event.preventDefault();
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
    <Sheet titleId="create-sheet-title" onClose={onClose}>
      <p className="eyebrow">SET THE STAKES</p>
      <h2 id="create-sheet-title">Start a derby</h2>
      <p className="sheet__intro">Just enough rules to prevent an argument. Probably.</p>
      <form className="field-form" onSubmit={submit}>
        <label><span>Derby name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekend Throwdown" required /></label>
        <label><span>Water</span><input value={water} onChange={(event) => setWater(event.target.value)} placeholder="Lake, pond, or river" required /></label>

        <fieldset className="choice-fieldset">
          <legend>What counts?</legend>
          <div className="choice-cards">
            {(['length', 'weight', 'count'] as const).map((value) => (
              <button key={value} className={mode === value ? 'active' : ''} type="button" onClick={() => setMode(value)}>
                {value === 'count' ? <Fish size={22} /> : value === 'weight' ? <Trophy size={22} /> : <Waves size={22} />}
                <strong>{value === 'count' ? 'Fish count' : value}</strong>
              </button>
            ))}
          </div>
        </fieldset>

        {mode !== 'count' && <div className="form-grid">
          <label><span>Scoring</span><select value={style} onChange={(event) => setStyle(event.target.value as NonNullable<Derby['scoringStyle']>)}><option value="biggest">Biggest fish</option><option value="best_n">Best N fish</option><option value="total">Total measurement</option></select></label>
          {style === 'best_n' && <label><span>Best how many?</span><input type="number" min="1" max="20" value={bestN} onChange={(event) => setBestN(Number(event.target.value))} /></label>}
        </div>}
        <label><span>Species <small>optional</small></span><input value={species} onChange={(event) => setSpecies(event.target.value)} placeholder="Open species" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button button--primary button--full button--large" type="submit" disabled={saving}>{saving ? 'Starting derby…' : 'Create derby'}</button>
      </form>
    </Sheet>
  );
}

export function JoinDerbySheet({ onClose, onJoined }: { onClose: () => void; onJoined: (derby: Derby) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    const derby = await db.derbies.where('inviteCode').equals(normalized).first();
    if (!derby) {
      setError('That derby is not cached on this phone. Joining a new crew requires a connection.');
      return;
    }
    onJoined(derby);
  }

  return (
    <Sheet titleId="join-sheet-title" onClose={onClose}>
      <p className="eyebrow">MEET THE CREW</p>
      <h2 id="join-sheet-title">Join a derby</h2>
      <p className="sheet__intro">Use the code your friend sent. Try <b>DINK-PINE</b> for the sample derby.</p>
      <form className="field-form" onSubmit={submit}>
        <label><span>Invite code</span><input className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="DINK-XXXXXX" autoCapitalize="characters" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button button--primary button--full button--large" type="submit">Find derby</button>
      </form>
    </Sheet>
  );
}

export function ProfileSheet({ user, onClose }: { user?: User; onClose: () => void }) {
  const [name, setName] = useState(user?.displayName || '');
  const [usage, setUsage] = useState<{ used?: number; quota?: number }>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    navigator.storage?.estimate().then((estimate) => setUsage({ used: estimate.usage, quota: estimate.quota })).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await updateProfile(name);
    setSaved(true);
    window.setTimeout(onClose, 500);
  }

  const megabytes = (value?: number) => value ? `${(value / 1_048_576).toFixed(value > 10_485_760 ? 0 : 1)} MB` : 'Unknown';

  return (
    <Sheet titleId="profile-sheet-title" onClose={onClose}>
      <p className="eyebrow">YOUR TACKLE BOX</p>
      <h2 id="profile-sheet-title">Angler profile</h2>
      <p className="sheet__intro">This identity stays available even when sign-in does not.</p>
      <form className="field-form" onSubmit={submit}>
        <div className="profile-crest"><UserIcon size={34} /></div>
        <label><span>Display name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <div className="storage-card">
          <HardDrive size={22} />
          <div><strong>Local field storage</strong><small>{megabytes(usage.used)} used · {megabytes(usage.quota)} available to the browser</small></div>
        </div>
        <button className="button button--primary button--full" type="submit">{saved ? 'Saved' : 'Save profile'}</button>
      </form>
    </Sheet>
  );
}
