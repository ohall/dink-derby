import type {
  JoinDerbyRequest,
  JoinDerbyResponse,
} from '@dink-derby/shared-types';
import { getAccessToken, supabase } from './supabase';
import { db } from '../db';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const settings = await db.settings.get('app');
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (settings?.currentUserId) headers.set('X-Dink-User-Id', settings.currentUserId);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { message?: string } | undefined;
    throw new Error(body?.message || `Derby server returned ${response.status}`);
  }
  return response;
}

export async function joinDerbyRequest(input: JoinDerbyRequest) {
  const response = await apiFetch('/join', { method: 'POST', body: JSON.stringify(input) });
  return response.json() as Promise<JoinDerbyResponse>;
}

export async function uploadMedia(mediaId: string, contentType: string, blob: Blob) {
  if (!supabase) return undefined;
  const response = await apiFetch('/media/upload-url', {
    method: 'POST',
    body: JSON.stringify({ mediaId, contentType }),
  });
  const details = await response.json() as { bucket: string; path: string; token: string };
  const uploaded = await supabase.storage.from(details.bucket).uploadToSignedUrl(details.path, details.token, blob, {
    contentType,
    upsert: false,
  });
  if (uploaded.error) throw uploaded.error;
  await apiFetch(`/media/${encodeURIComponent(mediaId)}/complete`, {
    method: 'POST',
    body: JSON.stringify({ path: details.path }),
  });
  return details.path;
}

export async function getMediaDownloadUrl(mediaId: string) {
  const response = await apiFetch(`/media/${encodeURIComponent(mediaId)}/download-url`);
  const details = await response.json() as { signedUrl: string };
  return details.signedUrl;
}
