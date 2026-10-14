-- Stickers in chats. A sticker message carries the sticker's id in `body`
-- (e.g. "face-with-tears-of-joy"); the images ship with the app
-- (public/stickers), so there's nothing to upload.

alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'image', 'file', 'voice', 'sticker'));

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
  has_file boolean := p_kind in ('image', 'file', 'voice');
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
  if p_kind not in ('text', 'image', 'file', 'voice', 'sticker') then
    raise exception 'Unknown message type.' using errcode = '22023';
  end if;
  if p_kind = 'text' and length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Type a message first.' using errcode = '22023';
  end if;
  if p_kind = 'sticker' and coalesce(p_body, '') !~ '^[a-z0-9-]{1,60}$' then
    raise exception 'Unknown sticker.' using errcode = '22023';
  end if;
  if has_file and (
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
    case when has_file then p_attachment_path end,
    case when has_file then left(p_attachment_name, 200) end,
    case when has_file then p_attachment_size end,
    case when has_file then left(p_attachment_mime, 100) end,
    case when p_kind = 'voice' then p_duration_ms end,
    case when p_kind = 'image' then p_width end,
    case when p_kind = 'image' then p_height end
  )
  returning * into r;
  update public.conversations set last_message_at = r.created_at where id = c.id;
  return r;
end;
$$;

revoke all on function public.send_message(uuid, uuid, text, text, text, text, integer, text, integer, integer, integer) from public, anon;
grant execute on function public.send_message(uuid, uuid, text, text, text, text, integer, text, integer, integer, integer) to authenticated;
