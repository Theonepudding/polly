CREATE TABLE IF NOT EXISTS votes (
  poll_id   TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  option_id TEXT NOT NULL,
  username  TEXT NOT NULL,
  time_slot TEXT,
  voted_at  TEXT NOT NULL,
  PRIMARY KEY (poll_id, user_id, option_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_poll ON votes(poll_id);
