import { createClient } from '@supabase/supabase-js';
import { db } from '../db';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
// Enable only after SMTP delivery and both OTP email templates are verified.
export const isAccountRecoveryEnabled = isSupabaseConfigured && import.meta.env.VITE_ACCOUNT_RECOVERY_ENABLED === 'true';

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : undefined;

export async function getAccessToken() {
  if (!supabase) return undefined;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const owner = (await db.settings.get('app'))?.currentUserId;
  if (!data.session || (owner && data.session.user.id !== owner)) {
    throw new Error('Sign in to your saved account in Profile. Your local catches have not been changed.');
  }
  return data.session?.access_token;
}

export function createSignInClient() {
  if (!supabase) throw new Error('Account sign-in is not configured.');
  // Verify a different account without replacing the current guest session.
  return createClient(supabaseUrl!, supabaseKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'dink-sign-in' },
  });
}
