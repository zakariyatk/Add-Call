-- Web Push: ring people whose browser is closed.
--
-- Each browser that turns on call notifications saves its push subscription
-- here. When a call starts, the caller's app asks the call-push Edge Function
-- to send an "Incoming call" push to every subscription of the person being
-- called; the browser shows it through the app's service worker (public/sw.js)
-- even when no tab is open.

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint endpoint_is_https check (endpoint like 'https://%' and length(endpoint) <= 1000),
  constraint keys_fit check (length(p256dh) <= 200 and length(auth) <= 100)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Nobody reads or writes this table directly: browsers save and remove their
-- own subscription through the functions below, and only the Edge Function
-- (service role) reads them to send pushes.
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Saves this browser's subscription for the signed-in user. A browser that
-- signs in with another account moves its subscription to that account.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to turn on call notifications.' using errcode = '28000';
  end if;
  -- At most 10 browsers per person; the oldest make way.
  delete from public.push_subscriptions
   where endpoint in (
     select endpoint from public.push_subscriptions
      where user_id = (select auth.uid()) and endpoint <> p_endpoint
      order by created_at desc
     offset 9
   );
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, (select auth.uid()), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

-- Removes this browser's subscription (turning notifications off, signing out).
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid())
$$;

-- Whether someone who isn't online can still be rung (has a browser with call
-- notifications on). Answers only for confirmed accounts found by exact email.
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
    join public.push_subscriptions s on s.user_id = p.id
    where p.email = lower(trim(p_email)) and p.id <> (select auth.uid())
  )
$$;

revoke all on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text), public.can_ring_offline(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text), public.can_ring_offline(text) to authenticated;

-- Each call is pushed at most once as "incoming" and once as "missed", however
-- often the function is asked (set by the Edge Function with the service role).
alter table public.calls add column ring_pushed_at timestamptz, add column missed_pushed_at timestamptz;
