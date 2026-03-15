import app from "./app";
import { db, adminsTable, categoriesTable, subscriptionPlansTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { sql, eq } from "drizzle-orm";

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

    if (admins.length === 0) {
      console.log("[seed] No admin found, seeding initial data...");

      const adminPassword = await bcrypt.hash("Fz8hxNc2#Mtq8Bx!", 10);
      await db.insert(adminsTable).values({
        username: "rabah",
        passwordHash: adminPassword,
      }).onConflictDoNothing();
      console.log("[seed] Admin created (username: rabah)");

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
      for (const cat of cats) {
        await db.insert(categoriesTable).values(cat).onConflictDoNothing();
      }

      await db.insert(subscriptionPlansTable).values([
        { type: "demo", price: "0 DA", description: "تجربة مجانية مع وصول محدود لبعض الفيديوهات", durationDays: 7 },
        { type: "annual", price: "5000 DA", description: "وصول كامل لمدة سنة لجميع الكورسات والمواد", durationDays: 365 },
        { type: "lifetime", price: "15000 DA", description: "وصول مدى الحياة لجميع الكورسات الحالية والمستقبلية", durationDays: null },
      ] as any[]).onConflictDoNothing();

      console.log("[seed] Seed complete.");
    } else {
      console.log("[seed] Admin already exists, skipping seed.");
    }
  } catch (err) {
    console.error("[seed] Seed error:", err);
  }
}

runMigrations().then(() => ensureSeed()).then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});
