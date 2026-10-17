-- Android app: ring the phone through Firebase Cloud Messaging (FCM), even
-- when the app is closed.
--
-- Each phone saves its FCM token here after sign-in; the call-push Edge
-- Function sends calls and messages to these tokens as well as to browsers'
-- Web Push subscriptions (push_subscriptions).

create table public.fcm_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint token_fits check (length(token) between 20 and 4096)
);

create index fcm_tokens_user_idx on public.fcm_tokens (user_id);

-- Like push_subscriptions: only the Edge Function (service role) reads these.
alter table public.fcm_tokens enable row level security;
revoke all on public.fcm_tokens from anon, authenticated;

-- Saves this phone's token for the signed-in user. A phone that signs in with
-- another account moves its token to that account.
create or replace function public.save_fcm_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to turn on call notifications.' using errcode = '28000';
  end if;
  -- At most 10 phones per person; the oldest make way.
  delete from public.fcm_tokens
   where token in (
     select token from public.fcm_tokens
      where user_id = (select auth.uid()) and token <> p_token
      order by created_at desc
     offset 9
   );
  insert into public.fcm_tokens (token, user_id)
  values (p_token, (select auth.uid()))
  on conflict (token) do update set user_id = excluded.user_id, created_at = now();
end;
$$;

-- Removes this phone's token (turning notifications off, signing out).
create or replace function public.delete_fcm_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.fcm_tokens where token = p_token and user_id = (select auth.uid())
$$;

-- Whether someone who isn't online can still be rung: a browser with call
-- notifications on, or the Android app.
create or replace function public.can_ring_offline(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.profiles p
    where p.email = lower(trim(p_email))
      and p.id <> (select auth.uid())
      and (
        exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
        or exists (select 1 from public.fcm_tokens t where t.user_id = p.id)
      )
  )
$$;

revoke all on function public.save_fcm_token(text), public.delete_fcm_token(text) from public, anon;
grant execute on function public.save_fcm_token(text), public.delete_fcm_token(text) to authenticated;
