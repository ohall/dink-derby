import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Camera, Fish, HardDrive, Ruler, Scale, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import type { Derby, User } from '@dink-derby/shared-types';
import { createDerby, joinDerby, saveCatch, updateProfile } from '../data/operations';
import { scoringRuleLabel } from '../domain/leaderboard';

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
    const value = measurement ? Number(measurement) : undefined;
    if (derby.scoringMode !== 'count' && (!value || value <= 0)) {
      setError(`Enter a valid ${derby.scoringMode}.`);
      return;
    }
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
  const requiresMeasurement = derby.scoringMode !== 'count';

  return (
    <Sheet titleId="catch-sheet-title" onClose={onClose}>
      <h2 id="catch-sheet-title">Log a catch</h2>
      <p className="sheet__intro">One fish per entry. {scoringRuleLabel(derby)}.</p>
      <form className="field-form" onSubmit={submit}>
        <label className={`photo-picker ${preview ? 'photo-picker--filled' : ''}`}>
          {preview ? <img src={preview} alt="Selected catch preview" /> : <><span><Camera size={27} /></span><strong>Add photo <small>optional</small></strong><small>Take a photo or choose one</small></>}
          <input type="file" accept="image/*" capture="environment" onChange={(event) => setFile(event.target.files?.[0])} />
        </label>

        {requiresMeasurement ? (
          <div className="measurement-field">
            <label htmlFor="catch-measurement">{derby.scoringMode === 'weight' ? 'Weight' : 'Length'}</label>
            <div><input id="catch-measurement" value={measurement} onChange={(event) => setMeasurement(event.target.value)} type="number" inputMode="decimal" min="0.01" max="999" step="0.01" placeholder={derby.scoringMode === 'weight' ? '2.75' : '18.50'} required /><span>{unit}</span></div>
          </div>
        ) : (
          <div className="count-entry-summary"><Fish size={24} /><div><strong>1 fish</strong><small>This catch adds one fish to your total.</small></div></div>
        )}

        <div className="form-grid">
          <label><span>Species <small>optional</small></span><input value={species} onChange={(event) => setSpecies(event.target.value)} placeholder="Largemouth bass" /></label>
          <label><span>Note <small>optional</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Catch details" maxLength={500} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="button button--primary button--full button--large" type="submit" disabled={saving || (requiresMeasurement && !measurement)}>{saving ? 'Saving catch…' : 'Save catch'}</button>
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
      <h2 id="create-sheet-title">Start a derby</h2>
      <p className="sheet__intro">Set the water, measurement, and scoring rule.</p>
      <form className="field-form" onSubmit={submit}>
        <label><span>Derby name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekend Throwdown" required /></label>
        <label><span>Water</span><input value={water} onChange={(event) => setWater(event.target.value)} placeholder="Lake, pond, or river" required /></label>

        <fieldset className="choice-fieldset">
          <legend>What counts?</legend>
          <div className="choice-cards">
            {(['length', 'weight', 'count'] as const).map((value) => (
              <button key={value} className={mode === value ? 'active' : ''} type="button" onClick={() => setMode(value)}>
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
        {error && <p className="form-error">{error}</p>}
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
    <Sheet titleId="join-sheet-title" onClose={onClose}>
      <h2 id="join-sheet-title">Join a derby</h2>
      <p className="sheet__intro">Enter the invite code from the derby organizer.</p>
      <form className="field-form" onSubmit={submit}>
        <label><span>Invite code</span><input className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="DINK-XXXXXX" autoCapitalize="characters" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button button--primary button--full button--large" type="submit" disabled={joining}>{joining ? 'Joining derby…' : 'Join derby'}</button>
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
      <h2 id="profile-sheet-title">Angler profile</h2>
      <p className="sheet__intro">This name appears in derbies and standings.</p>
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
