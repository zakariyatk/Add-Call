import type { UserInfo } from './protocol';

/** Who a call is with: another Add Call user, addressed by email. */
export type Peer = UserInfo;

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
