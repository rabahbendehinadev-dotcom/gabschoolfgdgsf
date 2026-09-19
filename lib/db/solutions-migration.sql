-- Isolated, additive, idempotent. Apply deliberately to the intended database.
BEGIN;
CREATE TABLE IF NOT EXISTS solution_taxonomies (id serial PRIMARY KEY, kind text NOT NULL, name text NOT NULL, parent_id integer);
CREATE TABLE IF NOT EXISTS solutions (
 id serial PRIMARY KEY, slug text NOT NULL UNIQUE, title text NOT NULL DEFAULT '', excerpt text NOT NULL DEFAULT '',
 brand text NOT NULL DEFAULT '', model text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '', subcategory text NOT NULL DEFAULT '', tool text NOT NULL DEFAULT '',
 tags jsonb NOT NULL DEFAULT '[]', keywords jsonb NOT NULL DEFAULT '[]', raw_input text NOT NULL DEFAULT '', content jsonb NOT NULL DEFAULT '{}',
 image_ids jsonb NOT NULL DEFAULT '[]', cover_image_id uuid, review_flags jsonb NOT NULL DEFAULT '[]', generation_error text,
 status text NOT NULL DEFAULT 'draft', created_by integer NOT NULL, published_at timestamp,
 created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS solution_images (id uuid PRIMARY KEY, solution_id integer NOT NULL REFERENCES solutions(id) ON DELETE CASCADE, object_path text NOT NULL, name text NOT NULL, width integer NOT NULL, height integer NOT NULL);
CREATE INDEX IF NOT EXISTS solutions_discovery_idx ON solutions(status,published_at);
CREATE INDEX IF NOT EXISTS solutions_filters_idx ON solutions(brand,category,tool);
CREATE INDEX IF NOT EXISTS solution_images_solution_idx ON solution_images(solution_id);
CREATE INDEX IF NOT EXISTS solutions_search_idx ON solutions USING gin (to_tsvector('simple',title || ' ' || brand || ' ' || model || ' ' || category || ' ' || tool || ' ' || tags::text || ' ' || keywords::text));
COMMIT;