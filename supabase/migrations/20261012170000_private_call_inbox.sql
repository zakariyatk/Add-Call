-- Incoming calls reach people over a private Realtime channel.
--
-- With Realtime's public access turned off, only private channels can be
-- joined, so each person listens for their calls on "calls:<their user id>"
-- (private). Row-level security on public.calls still decides which rows
-- they receive; this only lets them join their own channel.

create policy "signed-in users join their own call channel" on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'calls:' || (select auth.uid())::text);
