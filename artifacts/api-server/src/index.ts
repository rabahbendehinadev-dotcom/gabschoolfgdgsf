import app from "./app";
import { db, adminsTable, categoriesTable, subscriptionPlansTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";

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
    console.log("[migrations] Schema up to date.");
  } catch (err) {
    console.error("[migrations] Migration error:", err);
  }
}

async function ensureSeed() {
  try {
    const admins = await db.select().from(adminsTable).limit(1);
    if (admins.length === 0) {
      console.log("[seed] No admin found, seeding initial data...");

      const adminPassword = await bcrypt.hash("admin123", 10);
      await db.insert(adminsTable).values({
        username: "admin",
        passwordHash: adminPassword,
      }).onConflictDoNothing();
      console.log("[seed] Admin created (username: admin, password: admin123)");

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
