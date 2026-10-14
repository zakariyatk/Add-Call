-- Profile pictures and one-to-one chats (text, photos, files, voice notes).
--
-- Same model as calls: people read only what they're part of (row-level
-- security, which also filters Realtime), and every change goes through the
-- functions below, which check who is asking. Files live in Supabase Storage:
-- profile pictures in the public "avatars" bucket under <user id>/, chat
-- attachments in the private "chat-media" bucket under
-- <conversation id>/<sender id>/, readable only by the two people in it.

-- ---------- profile pictures ----------

alter table public.profiles
  add column avatar_path text
  constraint avatar_path_shape check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$');

-- Sets (or clears, with null) your picture. Returns the previous path, so the
-- app can delete the old file.
create or replace function public.set_avatar(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  old text;
begin
  if me is null then
    raise exception 'Sign in to change your picture.' using errcode = '28000';
  end if;
  if p_path is not null and (
    split_part(p_path, '/', 1) <> me::text
    or not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = p_path)
  ) then
    raise exception 'Upload the picture first.' using errcode = '22023';
  end if;
  select avatar_path into old from public.profiles where id = me;
  update public.profiles set avatar_path = p_path where id = me;
  return old;
end;
$$;

-- Pictures of people you know the email of (the same people find_user finds).
create or replace function public.get_avatars(p_emails text[])
returns table (email text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.email, p.avatar_path
  from public.profiles p
  join auth.users u on u.id = p.id
  where (select auth.uid()) is not null
    and u.email_confirmed_at is not null
    and p.email = any (p_emails[1:200])
$$;

-- ---------- conversations and messages ----------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- The two people, in a fixed order so each pair has one conversation.
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint ordered_pair check (user_a < user_b),
  constraint one_per_pair unique (user_a, user_b)
);

create index conversations_user_b_idx on public.conversations (user_b);

create table public.messages (
  id uuid primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('text', 'image', 'file', 'voice')),
  body text not null default '' check (length(body) <= 4000),
  attachment_path text,
  attachment_name text check (length(attachment_name) <= 200),
  attachment_size integer check (attachment_size between 0 and 26214400),
  attachment_mime text check (length(attachment_mime) <= 100),
  duration_ms integer check (duration_ms between 0 and 3600000),
  width integer check (width between 1 and 10000),
  height integer check (height between 1 and 10000),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  deleted_at timestamptz,
  pushed_at timestamptz
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_unread_idx on public.messages (recipient_id, conversation_id) where read_at is null;
create index messages_sender_idx on public.messages (sender_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "members read conversations" on public.conversations
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));
create policy "members read messages" on public.messages
  for select to authenticated using ((select auth.uid()) in (sender_id, recipient_id));

revoke insert, update, delete, truncate on public.conversations, public.messages from anon, authenticated;
revoke all on public.conversations, public.messages from anon;

-- Full rows in Realtime updates (ticks, deletions).
alter table public.messages replica identity full;
alter publication supabase_realtime add table public.messages;

-- Whether the signed-in user is in a conversation (takes text: used by Storage
-- and Realtime rules on paths and topic names).
create or replace function public.is_conversation_member(p_conversation text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_conversation is null or p_conversation !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from public.conversations c
    where c.id = p_conversation::uuid and (select auth.uid()) in (c.user_a, c.user_b)
  );
end;
$$;

-- Opens (or starts) the conversation with someone, by exact email.
create or replace function public.open_conversation(p_email text)
returns table (id uuid, peer_id uuid, peer_email text, peer_name text, peer_avatar text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  them public.profiles;
  conv uuid;
begin
  if me is null then
    raise exception 'Sign in to send messages.' using errcode = '28000';
  end if;
  select p.* into them
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.email = lower(trim(p_email)) and u.email_confirmed_at is not null;
  if them.id is null then
    raise exception 'No one on Add Call uses that email.' using errcode = 'P0002';
  end if;
  if them.id = me then
    raise exception 'You can''t message yourself.' using errcode = '22023';
  end if;

  insert into public.conversations (user_a, user_b, created_by)
  values (least(me, them.id), greatest(me, them.id), me)
  on conflict (user_a, user_b) do nothing;
  select c.id into conv from public.conversations c where c.user_a = least(me, them.id) and c.user_b = greatest(me, them.id);

  return query select conv, them.id, them.email, them.name, them.avatar_path;
end;
$$;

-- Your conversations, newest first, with the last message and unread count.
-- Empty conversations someone else opened with you stay hidden until they write.
create or replace function public.list_conversations()
returns table (
  id uuid,
  peer_id uuid,
  peer_email text,
  peer_name text,
  peer_avatar text,
  updated_at timestamptz,
  unread integer,
  last_id uuid,
  last_sender_id uuid,
  last_kind text,
  last_body text,
  last_attachment_name text,
  last_duration_ms integer,
  last_created_at timestamptz,
  last_delivered_at timestamptz,
  last_read_at timestamptz,
  last_deleted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id)
  select
    c.id,
    p.id, p.email, p.name, p.avatar_path,
    coalesce(c.last_message_at, c.created_at),
    (select count(*)::integer from public.messages m
      where m.conversation_id = c.id and m.recipient_id = me.id and m.read_at is null and m.deleted_at is null),
    l.id, l.sender_id, l.kind, l.body, l.attachment_name, l.duration_ms, l.created_at, l.delivered_at, l.read_at, l.deleted_at
  from me
  join public.conversations c on me.id in (c.user_a, c.user_b)
  join public.profiles p on p.id = case when c.user_a = me.id then c.user_b else c.user_a end
  left join lateral (
    select * from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1
  ) l on true
  where me.id is not null and (c.last_message_at is not null or c.created_by = me.id)
  order by coalesce(c.last_message_at, c.created_at) desc
  limit 200
$$;

-- Sends a message. The app picks the id (so it can show the message at once,
-- and retrying never sends twice) and uploads any attachment first.
create or replace function public.send_message(
  p_id uuid,
  p_conversation uuid,
  p_kind text,
  p_body text default '',
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_size integer default null,
  p_attachment_mime text default null,
  p_duration_ms integer default null,
  p_width integer default null,
  p_height integer default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.conversations;
  r public.messages;
begin
  select * into r from public.messages where id = p_id;
  if r.id is not null then
    if r.sender_id <> me then
      raise exception 'Message id already used.' using errcode = '23505';
    end if;
    return r; -- a retry of a message that already went through
  end if;

  select * into c from public.conversations where id = p_conversation and me in (user_a, user_b);
  if c.id is null then
    raise exception 'Conversation not found.' using errcode = 'P0002';
  end if;
  if p_kind not in ('text', 'image', 'file', 'voice') then
    raise exception 'Unknown message type.' using errcode = '22023';
  end if;
  if p_kind = 'text' and length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Type a message first.' using errcode = '22023';
  end if;
  if p_kind <> 'text' and (
    p_attachment_path is null
    or p_attachment_path not like c.id::text || '/' || me::text || '/%'
    or not exists (select 1 from storage.objects where bucket_id = 'chat-media' and name = p_attachment_path)
  ) then
    raise exception 'Upload the attachment first.' using errcode = '22023';
  end if;
  -- At most 60 messages a minute per person.
  if (select count(*) from public.messages where sender_id = me and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'You''re sending messages too fast. Wait a moment.' using errcode = '54000';
  end if;

  insert into public.messages (
    id, conversation_id, sender_id, recipient_id, kind, body,
    attachment_path, attachment_name, attachment_size, attachment_mime, duration_ms, width, height
  ) values (
    p_id, c.id, me, case when c.user_a = me then c.user_b else c.user_a end, p_kind, coalesce(p_body, ''),
    case when p_kind = 'text' then null else p_attachment_path end,
    case when p_kind = 'text' then null else left(p_attachment_name, 200) end,
    case when p_kind = 'text' then null else p_attachment_size end,
    case when p_kind = 'text' then null else left(p_attachment_mime, 100) end,
    case when p_kind = 'voice' then p_duration_ms end,
    case when p_kind = 'image' then p_width end,
    case when p_kind = 'image' then p_height end
  )
  returning * into r;
  update public.conversations set last_message_at = r.created_at where id = c.id;
  return r;
end;
$$;

-- Messages to you have reached this device.
create or replace function public.mark_delivered()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages set delivered_at = now()
  where recipient_id = (select auth.uid()) and delivered_at is null
$$;

-- You've seen a conversation: its messages to you are read.
create or replace function public.mark_read(p_conversation uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages set read_at = now(), delivered_at = coalesce(delivered_at, now())
  where conversation_id = p_conversation and recipient_id = (select auth.uid()) and read_at is null
$$;

-- Deletes one of your messages for everyone (within 2 days, like most chat apps).
-- Returns its attachment path, so the app can delete the file.
create or replace function public.delete_message(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  old text;
begin
  select attachment_path into old from public.messages
   where id = p_id and sender_id = (select auth.uid()) and deleted_at is null and created_at > now() - interval '2 days';
  update public.messages
     set deleted_at = now(), body = '', attachment_path = null, attachment_name = null,
         attachment_size = null, attachment_mime = null, duration_ms = null, width = null, height = null
   where id = p_id and sender_id = (select auth.uid()) and deleted_at is null and created_at > now() - interval '2 days';
  if not found then
    raise exception 'This message can no longer be deleted.' using errcode = 'P0002';
  end if;
  return old;
end;
$$;

revoke all on function
  public.set_avatar(text), public.get_avatars(text[]), public.is_conversation_member(text), public.open_conversation(text),
  public.list_conversations(), public.send_message(uuid, uuid, text, text, text, text, integer, text, integer, integer, integer),
  public.mark_delivered(), public.mark_read(uuid), public.delete_message(uuid)
  from public, anon;
grant execute on function
  public.set_avatar(text), public.get_avatars(text[]), public.is_conversation_member(text), public.open_conversation(text),
  public.list_conversations(), public.send_message(uuid, uuid, text, text, text, text, integer, text, integer, integer, integer),
  public.mark_delivered(), public.mark_read(uuid), public.delete_message(uuid)
  to authenticated;

-- ---------- storage ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png']),
  ('chat-media', 'chat-media', false, 26214400, null)
on conflict (id) do nothing;

-- Profile pictures: anyone can view (public bucket, unguessable names); you
-- can only add or remove files in your own folder.
create policy "upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Chat files: <conversation id>/<sender id>/<file>. Both people can read them;
-- only the sender adds or removes their own.
create policy "members read chat media" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-media' and public.is_conversation_member((storage.foldername(name))[1]));
create policy "members upload chat media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.is_conversation_member((storage.foldername(name))[1])
  );
create policy "senders delete chat media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[2] = (select auth.uid())::text);

-- ---------- Realtime ----------

-- New messages and ticks reach each person on their own private channel.
create policy "signed-in users join their own chat channel" on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'chat:' || (select auth.uid())::text);

-- "typing…": a broadcast channel per conversation, for its two members only.
create policy "members see typing" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'typing:%'
    and public.is_conversation_member(substr(realtime.topic(), 8))
  );
create policy "members send typing" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'typing:%'
    and public.is_conversation_member(substr(realtime.topic(), 8))
  );
