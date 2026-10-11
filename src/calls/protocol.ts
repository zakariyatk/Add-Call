/*
 * Shared call types. Ringing, answering and hanging up happen through rows in
 * the Supabase `calls` table (see supabase/migrations); audio and video go
 * through a LiveKit room per call.
 */

/** An unanswered call stops ringing after this long (the database allows a little more). */
export const RING_TIMEOUT_MS = 30_000;

export interface UserInfo {
  email: string;
  name: string;
}

export interface PresenceUser extends UserInfo {
  /** In a call or ringing. */
  busy: boolean;
}

export type EndReason = 'declined' | 'busy' | 'offline' | 'timeout' | 'hangup' | 'disconnected' | 'cancelled' | 'failed' | 'elsewhere';

/** A row of public.calls, as the database returns it. */
export interface CallRow {
  id: string;
  caller_id: string;
  callee_id: string;
  caller_name: string;
  caller_email: string;
  callee_name: string;
  callee_email: string;
  video: boolean;
  status: 'ringing' | 'accepted' | 'ended';
  end_reason: Exclude<EndReason, 'elsewhere'> | null;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && EMAIL.test(v);
