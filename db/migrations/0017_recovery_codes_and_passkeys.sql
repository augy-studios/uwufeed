-- Two ways back into an account that do not depend on reaching somebody
-- through a channel.
--
-- Everything in reset.js so far answers "where can we send a code". These
-- two answer "what can the person already prove", which is the only kind of
-- recovery that keeps working when a linked Discord or Telegram account is
-- itself lost.

-- ---- recovery codes ----
--
-- Ten per account, issued at registration. Single use.
--
-- Stored encrypted rather than hashed, which is a deliberate departure from
-- how these are usually kept. Hashing is stronger, but it makes a code
-- unreadable after the moment it is generated, and these have to be
-- viewable again from the Account page. Viewing costs a signed in session
-- plus the account password, so the reversible storage is bounded by that
-- rather than standing alone.
--
-- The consequence, stated plainly: a database leak on its own does not
-- expose codes, because the key is not in the database. A leak of both the
-- database and the deployment environment does.

create table if not exists uwufeed_recovery_codes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references uwufeed_users(id) on delete cascade,
  -- Display order, so a regenerated set reads 1 to 10 rather than by id.
  position   smallint not null check (position between 1 and 50),
  -- AES-256-GCM. base64 of iv, tag and ciphertext joined by dots.
  ciphertext text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now(),

  unique (user_id, position)
);

create index if not exists uwufeed_recovery_codes_unused_idx
  on uwufeed_recovery_codes (user_id)
  where used_at is null;

alter table uwufeed_recovery_codes enable row level security;
revoke all on uwufeed_recovery_codes from anon, authenticated;

comment on table uwufeed_recovery_codes is
  'Ten single use codes per account. Encrypted, not hashed, because the Account page can show them again behind a password check.';

-- ---- passkeys ----
--
-- WebAuthn credentials, so a returning device can sign in with its own
-- biometrics or screen lock instead of a password.
--
-- public_key is SPKI DER, taken from getPublicKey() in the browser at
-- registration. That is what keeps this dependency free: the alternative is
-- parsing the CBOR attestation object to dig the key out, and a CBOR parser
-- is a lot of code to own for one field.

create table if not exists uwufeed_passkeys (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references uwufeed_users(id) on delete cascade,
  -- base64url, as the browser reports it.
  credential_id text not null unique,
  -- base64 of the SPKI DER public key.
  public_key    text not null,
  -- Authenticators that implement it increment this every assertion. A
  -- value that goes backwards means a cloned credential. Many passkeys
  -- report zero forever, which is not a fault and must not be treated as
  -- one.
  sign_count    bigint not null default 0,
  label         text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists uwufeed_passkeys_user_idx
  on uwufeed_passkeys (user_id);

alter table uwufeed_passkeys enable row level security;
revoke all on uwufeed_passkeys from anon, authenticated;

comment on table uwufeed_passkeys is
  'WebAuthn credentials. public_key is SPKI DER from getPublicKey(), so no CBOR parser is needed.';
