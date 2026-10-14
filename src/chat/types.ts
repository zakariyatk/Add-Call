/*
 * Chat types. A conversation is between two people; messages are rows in
 * public.messages (see the chat_and_avatars migration), watched over Realtime.
 */

export type MessageKind = 'text' | 'image' | 'file' | 'voice' | 'sticker';

/** A row of public.messages, as the database returns it. */
export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  kind: MessageKind;
  body: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_mime: string | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  deleted_at: string | null;
}

/** Where one of my messages is: ticks in the chat. */
export type SendStatus = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

export interface Message extends MessageRow {
  /** Only on messages this device is still sending. */
  local?: {
    status: 'sending' | 'failed';
    /** Shown while uploading (object URL for photos and voice notes). */
    previewUrl?: string;
    /** Kept to retry a failed upload. */
    blob?: Blob;
    error?: string;
  };
}

export interface ConversationPeer {
  id: string;
  email: string;
  name: string;
  avatarPath: string | null;
  /** @username without the @ (null until they choose one). */
  username: string | null;
}

export interface Conversation {
  id: string;
  peer: ConversationPeer;
  updatedAt: number;
  unread: number;
  last: Pick<MessageRow, 'id' | 'sender_id' | 'kind' | 'body' | 'attachment_name' | 'duration_ms' | 'created_at' | 'delivered_at' | 'read_at' | 'deleted_at'> | null;
}

/** A row of list_conversations(). */
export interface ConversationRow {
  id: string;
  peer_id: string;
  peer_email: string;
  peer_name: string;
  peer_avatar: string | null;
  peer_username?: string | null;
  updated_at: string;
  unread: number;
  last_id: string | null;
  last_sender_id: string | null;
  last_kind: MessageKind | null;
  last_body: string | null;
  last_attachment_name: string | null;
  last_duration_ms: number | null;
  last_created_at: string | null;
  last_delivered_at: string | null;
  last_read_at: string | null;
  last_deleted_at: string | null;
}
