BEGIN;

CREATE TABLE IF NOT EXISTS hero_banners (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  desktop_image_path TEXT,
  mobile_image_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hero_banners_active_order_idx
  ON hero_banners (is_active, sort_order);

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY sort_order, id) - 1 AS next_order
  FROM hero_banners
)
UPDATE hero_banners AS banners
SET sort_order = ranked.next_order
FROM ranked
WHERE banners.id = ranked.id
  AND banners.sort_order <> ranked.next_order;

CREATE UNIQUE INDEX IF NOT EXISTS hero_banners_sort_order_unique
  ON hero_banners (sort_order);

CREATE TABLE IF NOT EXISTS hero_banner_cleanup_queue (
  id SERIAL PRIMARY KEY,
  object_path TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hero_banner_cleanup_queue_pending_idx
  ON hero_banner_cleanup_queue (updated_at, id);

COMMIT;