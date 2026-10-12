-- Add Call: profiles, calls and the rules that keep them private.
--
-- Accounts live in Supabase Auth (auth.users). A call is one row in
-- public.calls; both browsers watch it over Realtime to ring, answer and
-- hang up. Rows are changed only through the functions below, which check
-- who is asking, so nobody can ring as someone else or touch other people's
-- calls. Audio and video go through LiveKit (see functions/livekit-token).

-- ---------- profiles ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- You can read your own profile. Other people are found only by exact email
-- (find_user), so the directory can't be listed.
create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    lower(new.email),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), 80)
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------- calls ----------

create table public.calls (
  id uuid primary key,
  caller_id uuid not null references public.profiles (id) on delete cascade,
  callee_id uuid not null references public.profiles (id) on delete cascade,
  caller_name text not null,
  caller_email text not null,
  callee_name text not null,
  callee_email text not null,
  video boolean not null default false,
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'ended')),
  end_reason text check (end_reason in ('declined', 'busy', 'offline', 'timeout', 'hangup', 'disconnected', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  constraint not_self check (caller_id <> callee_id)
);

create index calls_caller_idx on public.calls (caller_id, created_at desc);
create index calls_callee_idx on public.calls (callee_id, created_at desc);

alter table public.calls enable row level security;

-- Only the two people in a call can see it (this also filters Realtime).
create policy "participants read calls" on public.calls
  for select to authenticated using ((select auth.uid()) in (caller_id, callee_id));

-- Full rows in Realtime updates, so both sides see every field change.
alter table public.calls replica identity full;
alter publication supabase_realtime add table public.calls;

-- How long a call may ring before it counts as unanswered.
create or replace function public.ring_timeout()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '40 seconds' $$;

-- Looks up a confirmed account by exact email, for "Call someone".
create or replace function public.find_user(p_email text)
returns table (id uuid, email text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.name
  from public.profiles p
  join auth.users u on u.id = p.id
  where (select auth.uid()) is not null
    and p.email = lower(trim(p_email))
    and u.email_confirmed_at is not null
$$;

-- Starts ringing someone. The caller picks the id so it can show the call at once.
create or replace function public.start_call(p_id uuid, p_email text, p_video boolean)
returns public.calls
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  them public.profiles;
  r public.calls;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null then
    raise exception 'Sign in to make calls.' using errcode = '28000';
  end if;

  select p.* into them
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.email = lower(trim(p_email)) and u.email_confirmed_at is not null;
  if them.id is null then
    raise exception 'No one on Add Call uses that email.' using errcode = 'P0002';
  end if;
  if them.id = me.id then
    raise exception 'You can''t call yourself.' using errcode = '22023';
  end if;

  -- At most 10 new calls a minute per person.
  if (select count(*) from public.calls where caller_id = me.id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Too many calls. Wait a minute and try again.' using errcode = '54000';
  end if;

  -- Calls nobody answered or cancelled (a closed tab) stop counting as ringing.
  update public.calls
     set status = 'ended', end_reason = 'timeout', ended_at = now()
   where status = 'ringing'
     and created_at < now() - public.ring_timeout()
     and (caller_id in (me.id, them.id) or callee_id in (me.id, them.id));

  insert into public.calls (id, caller_id, callee_id, caller_name, caller_email, callee_name, callee_email, video)
  values (p_id, me.id, them.id, me.name, me.email, them.name, them.email, coalesce(p_video, false))
  returning * into r;
  return r;
end;
$$;

-- The person being called picks up.
create or replace function public.answer_call(p_id uuid)
returns public.calls
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.calls;
begin
  update public.calls
     set status = 'accepted', answered_at = now()
   where id = p_id
     and callee_id = (select auth.uid())
     and status = 'ringing'
     and created_at > now() - public.ring_timeout()
  returning * into r;
  if r.id is null then
    raise exception 'This call has ended.' using errcode = 'P0002';
  end if;
  return r;
end;
$$;

-- Either person ends the call (decline, cancel, hang up, busy, failure).
create or replace function public.end_call(p_id uuid, p_reason text)
returns public.calls
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.calls;
begin
  if p_reason not in ('declined', 'busy', 'timeout', 'hangup', 'disconnected', 'cancelled', 'failed') then
    raise exception 'Unknown reason.' using errcode = '22023';
  end if;
  update public.calls
     set status = 'ended', end_reason = p_reason, ended_at = now()
   where id = p_id
     and (select auth.uid()) in (caller_id, callee_id)
     and status <> 'ended'
  returning * into r;
  if r.id is null then
    select * into r from public.calls where id = p_id and (select auth.uid()) in (caller_id, callee_id);
  end if;
  return r;
end;
$$;

-- Reads go through the policies above; every change goes through these functions.
revoke insert, update, delete, truncate on public.profiles, public.calls from anon, authenticated;
revoke all on public.profiles, public.calls from anon;

revoke all on function public.find_user(text), public.start_call(uuid, text, boolean), public.answer_call(uuid), public.end_call(uuid, text) from public, anon;
grant execute on function public.find_user(text), public.start_call(uuid, text, boolean), public.answer_call(uuid), public.end_call(uuid, text) to authenticated;
revoke all on function public.handle_new_user(), public.handle_user_email_change() from public, anon, authenticated;

-- ---------- who's online (Realtime presence) ----------

-- Only signed-in people can join the private "online" channel.
create policy "signed-in users see who is online" on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'online' and realtime.messages.extension = 'presence');

create policy "signed-in users share their presence" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() = 'online' and realtime.messages.extension = 'presence');
