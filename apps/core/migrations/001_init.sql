-- Phase 1 schema. Migrations must be backward compatible with the previous deploy
-- (expand, then contract): only add; never drop or rename in the same release.

CREATE TABLE decisions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Arrival order, so queued decisions are promoted first-come first-served.
  seq                bigserial   NOT NULL,
  source_system      text        NOT NULL,
  source_ref         text        NOT NULL,
  idempotency_key    text,
  request            jsonb       NOT NULL,
  risk               text        NOT NULL CHECK (risk IN ('low', 'write')),
  provenance_kind    text        NOT NULL CHECK (provenance_kind IN ('internal', 'external')),
  urgency            text        NOT NULL DEFAULT 'normal',
  -- open: shown to David. queued: waiting on another decision holding a resource.
  -- answered: an answer exists (in the undo window or being delivered).
  -- delivered / withdrawn / expired / resolved_outside: closed.
  -- stale / failed: in the "Stale & conflicts" queue.
  status             text        NOT NULL CHECK (status IN
                       ('queued', 'open', 'answered', 'delivered', 'withdrawn', 'expired',
                        'resolved_outside', 'stale', 'failed')),
  status_reason      text,
  needs_david        boolean     NOT NULL DEFAULT false,
  waiting_on         uuid REFERENCES decisions (id),
  fingerprint        text        NOT NULL,
  last_checked_at    timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at  timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  deadline_at        timestamptz,
  answer_version     integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX decisions_idempotency
  ON decisions (source_system, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX decisions_status ON decisions (status);

CREATE TABLE answers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id          uuid        NOT NULL REFERENCES decisions (id),
  version              integer     NOT NULL,
  option_id            text,
  other_text           text,
  surface              text        NOT NULL,
  -- pending: inside the undo window or waiting to be delivered
  -- undone / delivered / stale / failed: terminal
  -- dry_run: held by the kill switch; delivered if the mode returns to live
  status               text        NOT NULL CHECK (status IN
                         ('pending', 'delivering', 'undone', 'delivered', 'stale', 'failed', 'dry_run')),
  idempotency_key      text        NOT NULL,
  answered_at          timestamptz NOT NULL DEFAULT now(),
  deliver_after        timestamptz NOT NULL,
  next_attempt_at      timestamptz NOT NULL,
  attempts             integer     NOT NULL DEFAULT 0,
  last_error           text,
  fingerprint_at_answer text       NOT NULL,
  claimed_at           timestamptz,
  delivered_at         timestamptz,
  delivered_fingerprint text,
  UNIQUE (decision_id, version),
  UNIQUE (idempotency_key)
);
CREATE INDEX answers_due ON answers (status, next_attempt_at);

CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  decision_id  uuid REFERENCES decisions (id),
  event        text        NOT NULL,
  surface      text        NOT NULL,
  detail       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_decision ON audit_log (decision_id, id);

-- Append-only: history cannot be edited or removed.
CREATE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

CREATE TABLE resource_locks (
  resource     text NOT NULL,
  decision_id  uuid NOT NULL REFERENCES decisions (id),
  PRIMARY KEY (resource, decision_id)
);
CREATE INDEX resource_locks_decision ON resource_locks (decision_id);

-- Updates tab feed: notify and report_progress.
CREATE TABLE updates (
  id             bigserial PRIMARY KEY,
  source_system  text        NOT NULL,
  kind           text        NOT NULL CHECK (kind IN ('notify', 'progress')),
  level          text        NOT NULL DEFAULT 'info',
  title          text        NOT NULL,
  body           text,
  project        text,
  ref            text,
  url            text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
