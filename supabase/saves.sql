-- MonsterFusion: where an anonymous account's save lives.
--
-- Run this once in the Supabase SQL editor. It is written to be re-runnable:
-- every statement is guarded, so running it twice changes nothing.
--
-- The shape of the problem
-- ------------------------
-- The game is served from GitHub Pages, so there is no server of ours in the
-- picture. The browser holds the anon key, which means the browser can call
-- anything the anon role is allowed to call. So the anon role is allowed to
-- call exactly two functions and to touch no table at all.
--
-- The account is an id and a secret the browser generated (see
-- src/core/account.ts). The secret is the only proof of ownership, so:
--
--   * it is stored as a bcrypt hash, never in the clear;
--   * both reading and writing require it, because a save is the player's
--     whole game and an id alone is guessable enough to be worth guessing;
--   * the staleness check happens inside the write, in one statement, so two
--     devices pushing at the same moment cannot both win.

create extension if not exists pgcrypto;

create table if not exists public.saves (
  -- The account's public id (see ID_LENGTH in src/core/account.ts).
  account_id   text primary key,
  -- bcrypt of the account's secret. Set by whoever writes the account first.
  secret_hash  text        not null,
  -- The counter the game compares with; never a clock.
  revision     integer     not null,
  based_on     integer     not null,
  device_id    text        not null,
  saved_at     bigint      not null,
  -- The MonsterSaveFile, as it travels.
  payload      jsonb       not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Nothing reaches the table directly. Not the anon role, not a logged-in one:
-- row level security with no policy at all denies everybody, and the two
-- functions below run as the owner instead.
alter table public.saves enable row level security;

revoke all on public.saves from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- Returns the stored save, or nothing. Wrong secret and unknown account are
-- the same answer on purpose: a caller learns nothing by guessing ids.
create or replace function public.save_pull(
  p_account_id text,
  p_secret     text
)
returns table (
  revision  integer,
  based_on  integer,
  device_id text,
  saved_at  bigint,
  payload   jsonb
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select s.revision, s.based_on, s.device_id, s.saved_at, s.payload
  from public.saves s
  where s.account_id = p_account_id
    and s.secret_hash = crypt(p_secret, s.secret_hash);
end;
$$;

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------

-- The outcomes, named the same way the game's `PushResult` names them:
--
--   ok       the save was stored
--   stale    somebody wrote first; the caller gets what is stored and retries
--   rejected the secret does not open this account
create or replace function public.save_push(
  p_account_id text,
  p_secret     text,
  p_revision   integer,
  p_based_on   integer,
  p_device_id  text,
  p_saved_at   bigint,
  p_payload    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing public.saves;
begin
  if p_account_id is null or length(p_account_id) < 8 then
    return jsonb_build_object('status', 'rejected', 'message', 'account id');
  end if;
  if p_secret is null or length(p_secret) < 16 then
    return jsonb_build_object('status', 'rejected', 'message', 'secret');
  end if;
  -- A save is small; a save the size of a video is somebody else's project.
  if pg_column_size(p_payload) > 2 * 1024 * 1024 then
    return jsonb_build_object('status', 'rejected', 'message', 'too large');
  end if;

  select * into v_existing from public.saves
  where account_id = p_account_id
  for update;

  -- First write for this account: it sets the secret.
  if not found then
    if p_based_on <> 0 then
      return jsonb_build_object('status', 'stale', 'revision', 0);
    end if;
    insert into public.saves (
      account_id, secret_hash, revision, based_on, device_id, saved_at, payload
    ) values (
      p_account_id, crypt(p_secret, gen_salt('bf')),
      p_revision, p_based_on, p_device_id, p_saved_at, p_payload
    );
    return jsonb_build_object('status', 'ok', 'revision', p_revision);
  end if;

  if v_existing.secret_hash <> crypt(p_secret, v_existing.secret_hash) then
    return jsonb_build_object('status', 'rejected', 'message', 'secret');
  end if;

  -- The whole point: a write must be based on what is stored right now.
  if p_based_on <> v_existing.revision then
    return jsonb_build_object(
      'status', 'stale',
      'revision', v_existing.revision,
      'based_on', v_existing.based_on,
      'device_id', v_existing.device_id,
      'saved_at', v_existing.saved_at,
      'payload', v_existing.payload
    );
  end if;

  update public.saves set
    revision = p_revision,
    based_on = p_based_on,
    device_id = p_device_id,
    saved_at = p_saved_at,
    payload = p_payload,
    updated_at = now()
  where account_id = p_account_id;

  return jsonb_build_object('status', 'ok', 'revision', p_revision);
end;
$$;

-- The two things the browser may call, and nothing else.
revoke all on function public.save_pull(text, text) from public;
revoke all on function public.save_push(text, text, integer, integer, text, bigint, jsonb) from public;
grant execute on function public.save_pull(text, text) to anon, authenticated;
grant execute on function public.save_push(text, text, integer, integer, text, bigint, jsonb)
  to anon, authenticated;
