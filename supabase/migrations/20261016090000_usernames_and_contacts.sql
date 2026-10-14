-- Usernames (unique, like Instagram handles) and a personal contact list.
--
-- People find each other by exact @username (or exact email, as before);
-- there is no search that lists accounts. Each person keeps their own list of
-- contacts, which only they can see. Calls and messages work with anyone,
-- listed or not.

-- ---------- usernames ----------

alter table public.profiles
  add column username text
  constraint username_shape check (
    username ~ '^[a-z0-9._]{3,30}$'
    and username !~ '^\.'
    and username !~ '\.$'
    and username !~ '\.\.'
  );

create unique index profiles_username_key on public.profiles (username);

-- Names nobody can take.
create or replace function public.username_reserved(p_username text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_username in (
    'admin', 'administrator', 'root', 'support', 'help', 'helpdesk', 'security', 'system', 'official',
    'addcall', 'add.call', 'add_call', 'adddots', 'staff', 'team', 'moderator', 'mod', 'info', 'contact',
    'null', 'undefined', 'me', 'you', 'everyone', 'nobody', 'anonymous', 'test', 'api', 'www', 'mail'
  )
$$;

-- Why a username can't be used, or null when it can.
create or replace function public.username_problem(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u text := lower(trim(p_username));
begin
  if u is null or length(u) < 3 then
    return 'Use at least 3 characters.';
  elsif length(u) > 30 then
    return 'Use 30 characters or fewer.';
  elsif u !~ '^[a-z0-9._]+$' then
    return 'Use only letters, numbers, periods and underscores.';
  elsif u ~ '^\.' or u ~ '\.$' then
    return 'A username can''t start or end with a period.';
  elsif u ~ '\.\.' then
    return 'A username can''t have two periods in a row.';
  elsif u ~ '^[0-9._]+$' then
    return 'Include at least one letter.';
  elsif public.username_reserved(u) then
    return 'That username isn''t available.';
  elsif exists (select 1 from public.profiles where username = u and id <> (select auth.uid())) then
    return 'That username is taken.';
  end if;
  return null;
end;
$$;

-- Sets (or changes) your username.
create or replace function public.set_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  u text := lower(trim(p_username));
  problem text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to choose a username.' using errcode = '28000';
  end if;
  problem := public.username_problem(u);
  if problem is not null then
    raise exception '%', problem using errcode = '22023';
  end if;
  update public.profiles set username = u where id = (select auth.uid());
  return u;
exception
  when unique_violation then
    raise exception 'That username is taken.' using errcode = '23505';
end;
$$;

-- Finds one person by exact @username or exact email (confirmed accounts only).
create or replace function public.find_person(p_query text)
returns table (id uuid, username text, name text, email text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.name, p.email, p.avatar_path
  from public.profiles p
  join auth.users u on u.id = p.id
  where (select auth.uid()) is not null
    and u.email_confirmed_at is not null
    and (
      p.username = lower(ltrim(trim(p_query), '@'))
      or (position('@' in ltrim(trim(p_query), '@')) > 0 and p.email = lower(trim(p_query)))
    )
  limit 1
$$;

-- Pictures and usernames of people you know the email of (replaces get_avatars).
drop function public.get_avatars(text[]);
create function public.get_avatars(p_emails text[])
returns table (email text, avatar_path text, username text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.email, p.avatar_path, p.username
  from public.profiles p
  join auth.users u on u.id = p.id
  where (select auth.uid()) is not null
    and u.email_confirmed_at is not null
    and p.email = any (p_emails[1:200])
$$;

-- ---------- my list (contacts) ----------

create table public.contacts (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  constraint not_self check (owner_id <> contact_id)
);

alter table public.contacts enable row level security;
create policy "read own contacts" on public.contacts
  for select to authenticated using (owner_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.contacts from anon, authenticated;
revoke all on public.contacts from anon;

-- Your list, A–Z.
create or replace function public.list_contacts()
returns table (id uuid, username text, name text, email text, avatar_path text, added_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.name, p.email, p.avatar_path, c.created_at
  from public.contacts c
  join public.profiles p on p.id = c.contact_id
  where c.owner_id = (select auth.uid())
  order by lower(coalesce(nullif(p.name, ''), p.username, p.email))
  limit 1000
$$;

-- Adds someone (by @username or email) to your list.
create or replace function public.add_contact(p_query text)
returns table (id uuid, username text, name text, email text, avatar_path text, added_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  them record;
begin
  if me is null then
    raise exception 'Sign in to add people.' using errcode = '28000';
  end if;
  select * into them from public.find_person(p_query);
  if them.id is null then
    raise exception 'No one on Add Call has that username.' using errcode = 'P0002';
  end if;
  if them.id = me then
    raise exception 'That''s you.' using errcode = '22023';
  end if;
  if (select count(*) from public.contacts where owner_id = me) >= 1000 then
    raise exception 'Your list is full (1,000 people).' using errcode = '54000';
  end if;
  insert into public.contacts (owner_id, contact_id) values (me, them.id) on conflict do nothing;
  return query
    select p.id, p.username, p.name, p.email, p.avatar_path, c.created_at
    from public.contacts c join public.profiles p on p.id = c.contact_id
    where c.owner_id = me and c.contact_id = them.id;
end;
$$;

create or replace function public.remove_contact(p_contact uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.contacts where owner_id = (select auth.uid()) and contact_id = p_contact
$$;

-- ---------- chats show usernames ----------

drop function public.list_conversations();
create function public.list_conversations()
returns table (
  id uuid,
  peer_id uuid,
  peer_email text,
  peer_name text,
  peer_avatar text,
  peer_username text,
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
    p.id, p.email, p.name, p.avatar_path, p.username,
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

revoke all on function
  public.username_reserved(text), public.username_problem(text), public.set_username(text), public.find_person(text),
  public.get_avatars(text[]), public.list_contacts(), public.add_contact(text), public.remove_contact(uuid), public.list_conversations()
  from public, anon;
grant execute on function
  public.username_problem(text), public.set_username(text), public.find_person(text),
  public.get_avatars(text[]), public.list_contacts(), public.add_contact(text), public.remove_contact(uuid), public.list_conversations()
  to authenticated;
