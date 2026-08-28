import 'dotenv/config';
import type { FastifyRequest } from 'fastify';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();

const authClient = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : undefined;

export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export async function authenticate(request: FastifyRequest, claimedUserId?: string) {
  if (!authClient) {
    if (process.env.NODE_ENV === 'production') throw httpError(503, 'Supabase authentication is not configured.');
    const developmentUserId = claimedUserId || request.headers['x-dink-user-id'];
    if (typeof developmentUserId !== 'string') throw httpError(401, 'A field identity is required.');
    return developmentUserId;
  }

  const authorization = request.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (!token) throw httpError(401, 'Sign in is required.');
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw httpError(401, 'Your Dink Derby session is no longer valid.');
  if (claimedUserId && data.user.id !== claimedUserId) throw httpError(403, 'This field identity does not match the signed-in user.');
  return data.user.id;
}
