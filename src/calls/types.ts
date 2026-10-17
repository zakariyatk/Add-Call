import type { UserInfo } from './protocol';

/** Who a call is with: another Add Call user, addressed by email (and their account id, when known). */
export type Peer = UserInfo & { id?: string };

export type CallDirection = 'outgoing' | 'incoming' | 'missed';

export interface CallRecord {
  id: string;
  peer: Peer;
  direction: CallDirection;
  at: number;
  /** Seconds connected; 0 for missed or unanswered calls. */
  duration: number;
  video: boolean;
}
