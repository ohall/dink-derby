import { useEffect, useState } from 'react';
import type { QRCodeSVG } from 'qrcode.react';
import { derbyInviteUrl } from '../domain/invites';

export function InviteQr({ code, name }: { code: string; name: string }) {
  const [Qr, setQr] = useState<typeof QRCodeSVG>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    import('qrcode.react').then(module => { if (active) setQr(() => module.QRCodeSVG); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <div className="invite-qr">
    <strong>{name}</strong>
    {Qr ? <Qr value={derbyInviteUrl(code, window.location.origin)} size={256} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" role="img" aria-label={`QR code to join ${name}`} /> :
      <p role="status">{failed ? 'QR code could not load. Share the invite code below.' : 'Loading QR code…'}</p>}
    <p>Scan with a phone camera, or choose Join a derby → Scan QR code.</p>
  </div>;
}
