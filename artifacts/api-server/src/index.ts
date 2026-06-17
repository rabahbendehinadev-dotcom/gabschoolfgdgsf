import app from "./app";
import { db, adminsTable, categoriesTable, subscriptionPlansTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { sql, eq } from "drizzle-orm";
import { startIpResetScheduler } from "./lib/ipResetScheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runMigrations() {
  try {
    await db.execute(sql`
      ALTER TABLE videos
        ADD COLUMN IF NOT EXISTS access_type VARCHAR(20) NOT NULL DEFAULT 'normal'
    `);
    await db.execute(sql`
      UPDATE videos
        SET access_type = CASE WHEN is_vip_only = true THEN 'vip' ELSE 'normal' END
        WHERE access_type = 'normal' AND is_vip_only = true
    `);
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS ip_address_2 VARCHAR(45)
    `);
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS ip_first_seen_at TIMESTAMP
    `);
    // VIP-only IP restriction: non-VIP accounts must have no IP recorded.
    await db.execute(sql`
      UPDATE users
        SET ip_address = NULL, ip_address_2 = NULL, ip_first_seen_at = NULL
        WHERE account_type <> 'vip'
          AND (ip_address IS NOT NULL OR ip_address_2 IS NOT NULL OR ip_first_seen_at IS NOT NULL)
    `);
    // Legacy VIP rows that already had IP slots filled before the windowed
    // system existed have a NULL window start, which would leave them stuck at
    // 2/2 forever (never auto-resetting). Start their 24h window now so the
    // background scheduler / lazy expiry can reset them. Idempotent: only rows
    // with a NULL window start are touched, so reruns are no-ops.
    await db.execute(sql`
      UPDATE users
        SET ip_first_seen_at = NOW()
        WHERE account_type = 'vip'
          AND ip_first_seen_at IS NULL
          AND (ip_address IS NOT NULL OR ip_address_2 IS NOT NULL)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS playlists (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category_id INTEGER NOT NULL REFERENCES categories(id),
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_visible BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      ALTER TABLE videos
        ADD COLUMN IF NOT EXISTS playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL
    `);
    await db.execute(sql`
      ALTER TABLE videos
        ADD COLUMN IF NOT EXISTS part_number INTEGER
    `);
    await db.execute(sql`
      ALTER TABLE videos
        ADD COLUMN IF NOT EXISTS software_link TEXT
    `);
    await db.execute(sql`
      ALTER TABLE videos
        ADD COLUMN IF NOT EXISTS drive_parts TEXT
    `);
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS phone VARCHAR(20)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        username VARCHAR(100),
        action VARCHAR(100) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_submissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        customer_name VARCHAR(150) NOT NULL,
        plan_type VARCHAR(50) NOT NULL,
        plan_price VARCHAR(100) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        proof_object_path TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Category management columns (safe, additive, preserves existing data)
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_en VARCHAR(100)`);
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT`);
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT`);
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS accent_color VARCHAR(30)`);
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true`);
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_on_homepage BOOLEAN NOT NULL DEFAULT true`);
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);

    // One-time backfill of sort_order for legacy rows (only when no category has been ordered yet)
    await db.execute(sql`
      UPDATE categories c
      SET sort_order = sub.rn
      FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM categories) sub
      WHERE c.id = sub.id
        AND NOT EXISTS (SELECT 1 FROM categories WHERE sort_order <> 0)
    `);

    console.log("[migrations] Schema up to date.");
  } catch (err) {
    console.error("[migrations] Migration error:", err);
  }
}

async function ensureSeed() {
  try {
    const admins = await db.select().from(adminsTable).limit(1);

    // Migrate old default admin credentials to the new ones
    const oldAdmin = admins.find(a => a.username === "admin");
    if (oldAdmin) {
      console.log("[seed] Found legacy admin account, migrating credentials...");
      const newHash = await bcrypt.hash("Fz8hxNc2#Mtq8Bx!", 10);
      await db.update(adminsTable)
        .set({ username: "rabah", passwordHash: newHash })
        .where(eq(adminsTable.id, oldAdmin.id));
      console.log("[seed] Admin credentials migrated to new account (username: rabah)");
    }

    // Always ensure admin exists
    if (admins.length === 0) {
      const adminPassword = await bcrypt.hash("Fz8hxNc2#Mtq8Bx!", 10);
      await db.insert(adminsTable).values({
        username: "rabah",
        passwordHash: adminPassword,
      }).onConflictDoNothing();
      console.log("[seed] Admin created (username: rabah)");
    }

    // Always ensure categories exist (idempotent via onConflictDoNothing)
    const cats = [
      { name: "Samsung", slug: "samsung", icon: "smartphone" },
      { name: "iPhone", slug: "iphone", icon: "smartphone" },
      { name: "Huawei", slug: "huawei", icon: "smartphone" },
      { name: "Xiaomi", slug: "xiaomi", icon: "smartphone" },
      { name: "Oppo", slug: "oppo", icon: "smartphone" },
      { name: "Realme", slug: "realme", icon: "smartphone" },
      { name: "Vivo", slug: "vivo", icon: "smartphone" },
      { name: "Nokia", slug: "nokia", icon: "smartphone" },
    ];
    for (let i = 0; i < cats.length; i++) {
      await db.insert(categoriesTable).values({ ...cats[i], sortOrder: i + 1 }).onConflictDoNothing();
    }

    // Only seed plans if the table is completely empty (admin controls plans after first run)
    const existingPlans = await db.select().from(subscriptionPlansTable).limit(1);
    if (existingPlans.length === 0) {
      await db.insert(subscriptionPlansTable).values([
        { type: "demo", price: "0 DA", description: "تجربة مجانية مع وصول محدود لبعض الفيديوهات", durationDays: 7 },
        { type: "annual", price: "5000 DA", description: "وصول كامل لمدة سنة لجميع الكورسات والمواد", durationDays: 365 },
        { type: "lifetime", price: "15000 DA", description: "وصول مدى الحياة لجميع الكورسات الحالية والمستقبلية", durationDays: null },
      ] as any[]);
      console.log("[seed] Default subscription plans created.");
    }

    console.log("[seed] Seed complete.");
  } catch (err) {
    console.error("[seed] Seed error:", err);
  }
}

runMigrations().then(() => ensureSeed()).then(() => {
  startIpResetScheduler();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});
