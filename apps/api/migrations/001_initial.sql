CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text UNIQUE NOT NULL,
  display_name text NOT NULL, avatar integer NOT NULL DEFAULT 0, bio text NOT NULL DEFAULT '',
  token_hash text UNIQUE, charter_accepted_at timestamptz, charter_version text,
  visible boolean NOT NULL DEFAULT true, is_demo boolean NOT NULL DEFAULT false,
  demo_owner uuid REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_locations (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  location geography(Point,4326) NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  visible boolean NOT NULL DEFAULT true
);
CREATE INDEX user_locations_geo_idx ON user_locations USING gist(location);
CREATE INDEX user_locations_updated_idx ON user_locations(updated_at);
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pair_key text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE conversation_members (
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(conversation_id,user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members(user_id);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id), client_id uuid NOT NULL, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(sender_id,client_id)
);
CREATE INDEX messages_history_idx ON messages(conversation_id,created_at DESC,id DESC);
CREATE TABLE push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL, platform text NOT NULL CHECK(platform IN ('ios','android')), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE blocks (
  blocker_id uuid REFERENCES users(id) ON DELETE CASCADE, blocked_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id <> blocked_id)
);
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL REFERENCES users(id),
  reported_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
