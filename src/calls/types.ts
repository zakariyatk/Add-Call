export interface Contact {
  id: string;
  name: string;
  number: string;
  favorite?: boolean;
}

export type CallDirection = 'outgoing' | 'incoming' | 'missed';

export interface CallRecord {
  id: string;
  name: string | null;
  number: string;
  direction: CallDirection;
  at: number;
  /** Seconds connected; 0 for missed or unanswered calls. */
  duration: number;
  video: boolean;
}

/** Who a call is with. */
export interface Peer {
  name: string | null;
  number: string;
}
