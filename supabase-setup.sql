-- Run this once in your Supabase project's SQL Editor
-- (left sidebar -> SQL Editor -> New query -> paste this -> Run)

create table shop_data (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into shop_data (id, data) values ('main', '{"jobs": [], "inventory": []}');

-- Since this app has no login system, we allow open read/write access
-- using the public "anon" key. This is fine for a small internal tool
-- shared between trusted phones, but anyone who has your anon key could
-- read or edit the data. Don't publish the anon key publicly beyond your
-- own app's source, and consider adding real user accounts later if this
-- grows beyond a couple of trusted devices.
alter table shop_data enable row level security;

create policy "Allow all access to shop_data"
  on shop_data
  for all
  using (true)
  with check (true);

-- Enables the live-sync feature (changes on one phone show up on the
-- other without a manual refresh)
alter publication supabase_realtime add table shop_data;
