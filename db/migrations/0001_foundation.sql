CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TYPE account_role AS ENUM ('citizen', 'representative', 'staff', 'operator');
CREATE TYPE content_kind AS ENUM ('story', 'request', 'opinion', 'explanation', 'progress');
CREATE TYPE content_visibility AS ENUM ('public', 'temporarily_hidden', 'private', 'deleted');
CREATE TYPE request_status AS ENUM ('registered', 'acknowledged', 'on_hold', 'answered');
CREATE TYPE survey_mode AS ENUM ('single', 'multiple');

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role account_role NOT NULL DEFAULT 'citizen',
  nickname text NOT NULL CHECK (nickname = btrim(nickname) AND nickname <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  last_region_change_at timestamptz
);
CREATE UNIQUE INDEX citizen_nickname_unique ON accounts (nickname) WHERE role = 'citizen';
CREATE TABLE account_role_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  previous_role account_role NOT NULL,
  next_role account_role NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_role <> next_role)
);
CREATE FUNCTION record_role_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role <> NEW.role THEN
    INSERT INTO account_role_history(account_id, previous_role, next_role) VALUES (NEW.id, OLD.role, NEW.role);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_role_changed AFTER UPDATE OF role ON accounts FOR EACH ROW EXECUTE FUNCTION record_role_change();
CREATE TABLE social_identities (
  provider text NOT NULL CHECK (provider IN ('kakao', 'naver', 'google')),
  subject text NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject),
  UNIQUE (account_id, provider)
);

CREATE TABLE regions (
  code text PRIMARY KEY,
  name text NOT NULL,
  parent_code text REFERENCES regions(code),
  boundary geography(MultiPolygon, 4326),
  source_url text,
  source_checked_at timestamptz,
  CHECK (code <> parent_code)
);
CREATE INDEX region_boundary_gist ON regions USING gist(boundary);
CREATE FUNCTION guard_region_tree() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(721815004);
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT code, parent_code FROM regions WHERE code = NEW.parent_code
      UNION SELECT r.code, r.parent_code FROM regions r JOIN ancestors a ON r.code = a.parent_code
    ) SELECT 1 FROM ancestors WHERE code = NEW.code
  ) THEN RAISE EXCEPTION 'region hierarchy cycle'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER region_tree_guard BEFORE INSERT OR UPDATE OF parent_code ON regions FOR EACH ROW EXECUTE FUNCTION guard_region_tree();
CREATE TABLE region_certifications (
  account_id uuid NOT NULL REFERENCES accounts(id),
  slot smallint NOT NULL CHECK (slot IN (1, 2)),
  region_code text NOT NULL REFERENCES regions(code),
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, slot),
  UNIQUE (account_id, region_code),
  CHECK (expires_at = verified_at + interval '1 year')
);
COMMENT ON TABLE region_certifications IS 'Certification results only. Never persist user GPS coordinates or log location request bodies.';
CREATE FUNCTION citizen_can_participate(actor uuid, target text) RETURNS boolean LANGUAGE sql VOLATILE AS $$
  WITH RECURSIVE certified_regions(code) AS (
    SELECT c.region_code FROM region_certifications c JOIN accounts a ON a.id = c.account_id
    WHERE a.id = actor AND a.role = 'citizen' AND a.disabled_at IS NULL AND c.expires_at > clock_timestamp()
    UNION SELECT r.parent_code FROM regions r JOIN certified_regions c ON r.code = c.code WHERE r.parent_code IS NOT NULL
  ) SELECT EXISTS (SELECT 1 FROM certified_regions WHERE code = target)
$$;
CREATE TABLE representatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  office text NOT NULL,
  region_code text NOT NULL REFERENCES regions(code)
);
CREATE TABLE representative_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id uuid NOT NULL REFERENCES representatives(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  CHECK (ends_at > starts_at),
  UNIQUE (id, representative_id)
);
CREATE TABLE official_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id),
  representative_id uuid NOT NULL,
  term_id uuid NOT NULL,
  reviewed_by uuid NOT NULL REFERENCES accounts(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revocation_reason text,
  employment_confirmed_at timestamptz,
  FOREIGN KEY (term_id, representative_id) REFERENCES representative_terms(id, representative_id)
);
CREATE INDEX official_grants_account ON official_grants(account_id);
COMMENT ON TABLE official_grants IS 'Grant approval, staff recheck, revocation and term-end lifecycle are enforced by future authenticated services.';

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES accounts(id),
  author_role_at_creation account_role NOT NULL,
  author_name_at_creation text NOT NULL,
  affiliation_at_creation text,
  region_code text NOT NULL REFERENCES regions(code),
  kind content_kind NOT NULL,
  body text NOT NULL CHECK (char_length(body) <= 2000 AND (body <> '' OR visibility = 'deleted')),
  photos jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(photos) = 'array' AND jsonb_array_length(photos) <= 4),
  external_url text CHECK (external_url ~ '^https?://'),
  visibility content_visibility NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  pinned_reply_id uuid
);
CREATE INDEX posts_region_recent ON posts(region_code, created_at DESC) WHERE visibility = 'public';
CREATE TABLE replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id uuid,
  author_id uuid NOT NULL REFERENCES accounts(id),
  author_role_at_creation account_role NOT NULL,
  author_name_at_creation text NOT NULL,
  affiliation_at_creation text,
  representative_id uuid REFERENCES representatives(id),
  body text NOT NULL CHECK (char_length(body) <= 2000 AND (body <> '' OR visibility = 'deleted')),
  photos jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(photos) = 'array' AND jsonb_array_length(photos) <= 4),
  external_url text CHECK (external_url ~ '^https?://'),
  visibility content_visibility NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  UNIQUE (post_id, id),
  FOREIGN KEY (post_id, parent_id) REFERENCES replies(post_id, id),
  CHECK (id <> parent_id)
);
CREATE INDEX reply_conversation ON replies(post_id, parent_id, created_at);
ALTER TABLE posts ADD CONSTRAINT pinned_reply_same_post FOREIGN KEY (id, pinned_reply_id) REFERENCES replies(post_id, id) DEFERRABLE INITIALLY IMMEDIATE;
CREATE FUNCTION guard_reply_structure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.post_id IS DISTINCT FROM OLD.post_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
    RAISE EXCEPTION 'reply post and parent are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reply_structure_guard BEFORE UPDATE ON replies FOR EACH ROW EXECUTE FUNCTION guard_reply_structure();
CREATE FUNCTION stamp_content_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visibility = 'deleted' THEN NEW.body := ''; NEW.photos := '[]'::jsonb; NEW.external_url := NULL; END IF;
  IF (NEW.body, NEW.photos, NEW.external_url) IS DISTINCT FROM (OLD.body, OLD.photos, OLD.external_url) THEN NEW.edited_at := clock_timestamp(); END IF;
  IF (NEW.author_id, NEW.author_role_at_creation, NEW.author_name_at_creation, NEW.affiliation_at_creation, NEW.created_at)
    IS DISTINCT FROM (OLD.author_id, OLD.author_role_at_creation, OLD.author_name_at_creation, OLD.affiliation_at_creation, OLD.created_at)
    THEN RAISE EXCEPTION 'original authorship is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER post_edit_stamp BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION stamp_content_edit();
CREATE TRIGGER reply_edit_stamp BEFORE UPDATE ON replies FOR EACH ROW EXECUTE FUNCTION stamp_content_edit();
CREATE FUNCTION preserve_request_answers() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind = 'request' AND EXISTS (SELECT 1 FROM replies WHERE post_id = OLD.id AND author_role_at_creation IN ('representative','staff')) THEN
    RAISE EXCEPTION 'requests with official answers must use a deleted tombstone';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER request_answer_preservation BEFORE DELETE ON posts FOR EACH ROW EXECUTE FUNCTION preserve_request_answers();
CREATE FUNCTION clear_hidden_pin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visibility <> 'public' THEN UPDATE posts SET pinned_reply_id = NULL WHERE id = NEW.post_id AND pinned_reply_id = NEW.id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hidden_pin_cleanup AFTER UPDATE OF visibility ON replies FOR EACH ROW EXECUTE FUNCTION clear_hidden_pin();
CREATE TABLE request_recipients (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  representative_id uuid NOT NULL REFERENCES representatives(id),
  status request_status NOT NULL DEFAULT 'registered',
  acknowledged_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, representative_id)
);
COMMENT ON COLUMN request_recipients.status IS 'registered does not mean delivered or acknowledged; an unjoined representative remains undelivered.';
CREATE TABLE post_empathy (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, account_id)
);
CREATE TABLE follows (
  account_id uuid NOT NULL REFERENCES accounts(id),
  representative_id uuid NOT NULL REFERENCES representatives(id),
  notify_new_posts boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, representative_id)
);
CREATE TABLE notification_preferences (
  account_id uuid PRIMARY KEY REFERENCES accounts(id),
  request_acknowledged boolean NOT NULL DEFAULT true,
  official_answer boolean NOT NULL DEFAULT true,
  additional_reply boolean NOT NULL DEFAULT true
);

CREATE FUNCTION valid_choices(choices text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT cardinality(choices) >= 2
    AND array_position(choices, NULL) IS NULL
    AND NOT EXISTS (SELECT 1 FROM unnest(choices) c WHERE btrim(c) = '' OR c <> btrim(c))
    AND cardinality(choices) = (SELECT count(DISTINCT c) FROM unnest(choices) c)
$$;
CREATE TABLE surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (btrim(question) <> ''),
  choices text[] NOT NULL CHECK (valid_choices(choices)),
  mode survey_mode NOT NULL,
  closes_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > created_at)
);
CREATE FUNCTION guard_survey_definition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent posts;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'published survey definition is immutable'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM posts WHERE id = OLD.post_id) THEN RAISE EXCEPTION 'cannot remove survey from published post'; END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO STRICT parent FROM posts WHERE id = NEW.post_id;
  IF parent.kind <> 'opinion' OR parent.author_role_at_creation NOT IN ('representative', 'staff') THEN
    RAISE EXCEPTION 'only official opinion posts may contain surveys';
  END IF;
  IF NEW.closes_at <= clock_timestamp() THEN RAISE EXCEPTION 'survey deadline must be in the future'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER survey_definition_guard BEFORE INSERT OR UPDATE OR DELETE ON surveys FOR EACH ROW EXECUTE FUNCTION guard_survey_definition();
CREATE TABLE survey_responses (
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  selected_indexes integer[] NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (survey_id, account_id)
);
CREATE FUNCTION guard_survey_response() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE survey surveys; target_region text; post_visibility content_visibility;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM surveys WHERE id = OLD.survey_id) THEN RAISE EXCEPTION 'responses may only be replaced before deadline'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.survey_id, NEW.account_id) IS DISTINCT FROM (OLD.survey_id, OLD.account_id) THEN
    RAISE EXCEPTION 'response ownership is immutable'; END IF;
  SELECT * INTO STRICT survey FROM surveys WHERE id = NEW.survey_id FOR SHARE;
  SELECT region_code, visibility INTO target_region, post_visibility FROM posts WHERE id = survey.post_id;
  IF post_visibility <> 'public' OR survey.closes_at <= clock_timestamp() THEN RAISE EXCEPTION 'survey is closed or unavailable'; END IF;
  IF NOT citizen_can_participate(NEW.account_id, target_region) THEN RAISE EXCEPTION 'survey requires valid regional citizen certification'; END IF;
  IF cardinality(NEW.selected_indexes) = 0 OR array_position(NEW.selected_indexes, NULL) IS NOT NULL
    OR cardinality(NEW.selected_indexes) <> (SELECT count(DISTINCT i) FROM unnest(NEW.selected_indexes) i)
    OR EXISTS (SELECT 1 FROM unnest(NEW.selected_indexes) i WHERE i < 0 OR i >= cardinality(survey.choices))
    OR (survey.mode = 'single' AND cardinality(NEW.selected_indexes) <> 1)
    THEN RAISE EXCEPTION 'invalid selected choices'; END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER survey_response_guard BEFORE INSERT OR UPDATE OR DELETE ON survey_responses FOR EACH ROW EXECUTE FUNCTION guard_survey_response();
CREATE VIEW public_survey_results AS
  SELECT s.id AS survey_id, choice.ordinality - 1 AS choice_index, choice.label,
    count(r.account_id) FILTER (WHERE (choice.ordinality - 1)::integer = ANY(r.selected_indexes)) AS response_count,
    count(r.account_id) AS participant_count
  FROM surveys s JOIN posts p ON p.id = s.post_id
  CROSS JOIN LATERAL unnest(s.choices) WITH ORDINALITY AS choice(label, ordinality)
  LEFT JOIN survey_responses r ON r.survey_id = s.id
  WHERE s.closes_at <= clock_timestamp() AND p.visibility = 'public'
  GROUP BY s.id, choice.ordinality, choice.label;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
COMMENT ON VIEW public_survey_results IS 'Public aggregate projection after deadline only. Grant this view, never survey_responses, to a future read-only application role.';
