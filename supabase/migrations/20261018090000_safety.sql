-- Safety: blocking and reporting people, and the sign-in for app reviewers.
--
-- Blocking works both ways: neither person can call or message the other
-- until the blocker unblocks. Reports are kept for the team to review in the
-- Supabase dashboard (Table Editor → reports); nobody can read them through
-- the API. Deleting an account (the delete-account function) removes the
-- person's blocks with it, and keeps reports about them.

-- ---------- blocks ----------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint not_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
create policy "read own blocks" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.blocks from anon, authenticated;
revoke all on public.blocks from anon;

-- People you've blocked, newest first.
create or replace function public.list_blocks()
returns table (id uuid, username text, name text, email text, avatar_path text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.name, p.email, p.avatar_path, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc
  limit 1000
$$;

-- Blocks someone: takes them off your list and ends any call ringing between you.
create or replace function public.block_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in to block people.' using errcode = '28000';
  end if;
  if p_user = me then
    raise exception 'You can''t block yourself.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'No one on Add Call has that account.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.blocks where blocker_id = me) >= 1000 then
    raise exception 'You''ve blocked 1,000 people. Unblock someone first.' using errcode = '54000';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (me, p_user) on conflict do nothing;
  delete from public.contacts where owner_id = me and contact_id = p_user;
  update public.calls
     set status = 'ended', end_reason = 'declined', ended_at = now()
   where status <> 'ended'
     and ((caller_id = me and callee_id = p_user) or (caller_id = p_user and callee_id = me));
end;
$$;

create or replace function public.unblock_user(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.blocks where blocker_id = (select auth.uid()) and blocked_id = p_user
$$;

-- Calls and messages between two people where either blocked the other are
-- refused, whichever function inserts them.
create or replace function public.refuse_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_id uuid;
  to_id uuid;
  what text;
begin
  if tg_table_name = 'calls' then
    from_id := new.caller_id;
    to_id := new.callee_id;
    what := 'call';
  else
    from_id := new.sender_id;
    to_id := new.recipient_id;
    what := 'message';
  end if;
  if exists (select 1 from public.blocks where blocker_id = from_id and blocked_id = to_id) then
    raise exception 'You blocked this person. Unblock them to % them.', what using errcode = '42501';
  end if;
  if exists (select 1 from public.blocks where blocker_id = to_id and blocked_id = from_id) then
    raise exception 'You can''t % this person.', what using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger refuse_blocked_calls
  before insert on public.calls
  for each row execute function public.refuse_blocked();
create trigger refuse_blocked_messages
  before insert on public.messages
  for each row execute function public.refuse_blocked();

-- ---------- reports ----------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Kept when either account is deleted, so the emails are copied in.
  reporter_id uuid references public.profiles (id) on delete set null,
  reporter_email text not null,
  reported_id uuid references public.profiles (id) on delete set null,
  reported_email text not null,
  reported_username text,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')),
  details text not null default '' check (length(details) <= 1000),
  -- The reported message, copied as it was (it may be deleted later).
  message_id uuid,
  message_kind text,
  message_body text,
  message_attachment_path text,
  message_sent_at timestamptz,
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  notes text not null default ''
);

create index reports_open_idx on public.reports (created_at desc) where status = 'open';

-- No policies: reports are read and handled in the dashboard only.
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;

-- Reports someone (optionally one of their messages to you). Returns the report id.
create or replace function public.report_user(p_user uuid, p_reason text, p_details text default '', p_message uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  them public.profiles;
  m public.messages;
  r uuid;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null then
    raise exception 'Sign in to report people.' using errcode = '28000';
  end if;
  select * into them from public.profiles where id = p_user;
  if them.id is null then
    raise exception 'No one on Add Call has that account.' using errcode = 'P0002';
  end if;
  if them.id = me.id then
    raise exception 'You can''t report yourself.' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'inappropriate', 'impersonation', 'other') then
    raise exception 'Choose a reason.' using errcode = '22023';
  end if;
  if length(coalesce(p_details, '')) > 1000 then
    raise exception 'Keep the details to 1,000 characters.' using errcode = '22023';
  end if;
  if (select count(*) from public.reports where reporter_id = me.id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You''ve sent a lot of reports today. Try again tomorrow.' using errcode = '54000';
  end if;
  if p_message is not null then
    -- Only a message they sent to you.
    select * into m from public.messages where id = p_message and sender_id = them.id and recipient_id = me.id;
    if m.id is null then
      raise exception 'That message can''t be reported.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.reports (
    reporter_id, reporter_email, reported_id, reported_email, reported_username, reason, details,
    message_id, message_kind, message_body, message_attachment_path, message_sent_at
  ) values (
    me.id, me.email, them.id, them.email, them.username, p_reason, trim(coalesce(p_details, '')),
    m.id, m.kind, m.body, m.attachment_path, m.created_at
  )
  returning id into r;
  return r;
end;
$$;

-- ---------- sign-in for app reviewers ----------

-- Wrong codes tried for the review accounts (see functions/demo-sign-in),
-- so the shared code can't be guessed. Only that function writes here.
create table public.demo_sign_in_failures (
  at timestamptz not null default now()
);
create index demo_sign_in_failures_at_idx on public.demo_sign_in_failures (at);
alter table public.demo_sign_in_failures enable row level security;
revoke all on public.demo_sign_in_failures from anon, authenticated;

-- ---------- grants ----------

revoke all on function
  public.list_blocks(), public.block_user(uuid), public.unblock_user(uuid), public.report_user(uuid, text, text, uuid)
  from public, anon;
grant execute on function
  public.list_blocks(), public.block_user(uuid), public.unblock_user(uuid), public.report_user(uuid, text, text, uuid)
  to authenticated;
revoke all on function public.refuse_blocked() from public, anon, authenticated;
