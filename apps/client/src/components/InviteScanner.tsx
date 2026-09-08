import { useEffect, useRef, useState } from 'react';
import { startInviteScanner } from '../utils/scanInvite';

export function InviteScanner({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('Opening camera…');
  const [error, setError] = useState('');
  useEffect(() => {
    setError(''); setStatus('Opening camera…');
    return startInviteScanner(video.current!, { onCode: code => onCodeRef.current(code), onStatus: setStatus, onError: setError });
  }, [attempt]);
  return <section className="invite-scanner" aria-label="Scan derby QR code">
    <video ref={video} muted playsInline aria-label="QR scanner camera preview" hidden={!!error} />
    <p role="status">{error || status}</p>
    {error && <button type="button" className="button button--paper button--full" onClick={() => setAttempt(value => value + 1)}>Try camera again</button>}
    <button type="button" className="button button--paper button--full" onClick={onCancel}>Cancel scan</button>
  </section>;
}
