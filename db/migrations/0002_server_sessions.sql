CREATE TABLE sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid NOT NULL REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_account ON sessions(account_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE FUNCTION revoke_role_sessions_and_grants() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role <> NEW.role OR (OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL) THEN
    UPDATE sessions SET revoked_at=clock_timestamp() WHERE account_id=NEW.id AND revoked_at IS NULL;
    UPDATE official_grants SET revoked_at=clock_timestamp(),revocation_reason='account_role_or_status_changed' WHERE account_id=NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revoke_changed_role AFTER UPDATE OF role,disabled_at ON accounts FOR EACH ROW EXECUTE FUNCTION revoke_role_sessions_and_grants();
REVOKE ALL ON sessions FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_role_sessions_and_grants() FROM PUBLIC;
ALTER TABLE posts ADD COLUMN representative_id uuid REFERENCES representatives(id);
