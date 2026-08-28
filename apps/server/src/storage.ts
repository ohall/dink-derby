import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { httpError } from './auth';

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
export const mediaBucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'catch-photos';

const storageClient = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : undefined;

function storage() {
  if (!storageClient) throw httpError(503, 'Catch-photo storage is not configured.');
  return storageClient.storage.from(mediaBucket);
}

export async function createMediaUpload(path: string) {
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error) throw httpError(502, `Photo upload could not be prepared: ${error.message}`);
  return data;
}

export async function createMediaDownload(path: string) {
  const { data, error } = await storage().createSignedUrl(path, 300);
  if (error) throw httpError(502, `Photo download could not be prepared: ${error.message}`);
  return data.signedUrl;
}
