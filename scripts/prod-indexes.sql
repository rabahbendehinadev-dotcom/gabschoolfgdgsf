-- Production performance indexes — run once on the production DB.
-- Safe to re-run (IF NOT EXISTS). No data is modified.

-- visit_logs: enables GROUP BY user_id and ORDER BY visited_at without a full table scan.
CREATE INDEX IF NOT EXISTS visit_logs_user_id_idx
  ON visit_logs (user_id, visited_at DESC);

-- push_subscriptions: needed for filtering active/broken subs per user.
CREATE INDEX IF NOT EXISTS push_subs_user_failed_idx
  ON push_subscriptions (user_id, failed_at);

-- user_courses: speeds up per-user course lookups.
CREATE INDEX IF NOT EXISTS user_courses_user_id_idx
  ON user_courses (user_id);
