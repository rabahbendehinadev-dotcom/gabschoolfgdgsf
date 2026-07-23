import app from "./app";
import { db, adminsTable, categoriesTable, subscriptionPlansTable, videosTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { sql, eq, isNull, and } from "drizzle-orm";
import { startIpResetScheduler } from "./lib/ipResetScheduler";
import { copyDriveFileToStorage, buildVideoObjectPath } from "./lib/videoStorage";
import { resolveVideoParts, extractDriveFileId } from "./lib/googleDrive";
import { startDriveTranscodeWorker } from "./lib/driveTranscode";
import { startImageOptimizeWorker } from "./lib/imageOptimize";
import type { ObjectPart } from "./lib/videoStorage";

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
    // Course-linking columns (added when courses/playlists feature was introduced)
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`);
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS linked_playlist_id INTEGER`);

    // One-time backfill of sort_order for legacy rows (only when no category has been ordered yet)
    await db.execute(sql`
      UPDATE categories c
      SET sort_order = sub.rn
      FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM categories) sub
      WHERE c.id = sub.id
        AND NOT EXISTS (SELECT 1 FROM categories WHERE sort_order <> 0)
    `);

    // Playlists image/thumbnail columns (added after initial playlists table creation)
    await db.execute(sql`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS image_url TEXT`);
    await db.execute(sql`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`);
    // Make category_id nullable on playlists (playlists may exist independently of a category)
    await db.execute(sql`ALTER TABLE playlists ALTER COLUMN category_id DROP NOT NULL`);

    // Video storage / HLS / ordering columns (added progressively after initial videos table)
    await db.execute(sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS object_parts TEXT`);
    await db.execute(sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS hls_parts TEXT`);

    // 720p transcode worker columns (safe, additive)
    await db.execute(sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS low_parts TEXT`);
    await db.execute(sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS low_error TEXT`);

    // Community reports table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS community_reports (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES community_posts(id) ON DELETE CASCADE,
        comment_id INTEGER REFERENCES community_comments(id) ON DELETE CASCADE,
        reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS community_reports_post_idx ON community_reports(post_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS community_reports_comment_idx ON community_reports(comment_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS community_reports_status_idx ON community_reports(status)`);

    // ── [SECURITY] Auto-grant migration REMOVED ──
    // The previous migration that automatically granted playlist 5 (Flash & Decoding)
    // to all VIP users has been deliberately removed. Course access is now 100% explicit:
    // it must be granted manually by an admin with manage_course_access permission,
    // or triggered by a confirmed subscription payment. No automatic grants on server start.
    console.log("[migrations] Course access: strict mode — no automatic grants on startup.");

    // ── user_courses: add tracking columns ──────────────────────────────────────
    await db.execute(sql`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS granted_by TEXT`);
    await db.execute(sql`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS grant_source TEXT DEFAULT 'manual'`);
    await db.execute(sql`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS reason TEXT`);
    await db.execute(sql`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);

    // ── admins: role + display name + login tracking ─────────────────────────────
    await db.execute(sql`ALTER TABLE admins ADD COLUMN IF NOT EXISTS display_name TEXT`);
    await db.execute(sql`ALTER TABLE admins ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'super_admin'`);
    await db.execute(sql`ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login_ip TEXT`);

    // ── course_access_logs: full audit trail ─────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS course_access_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        playlist_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        admin_id INTEGER,
        admin_name TEXT,
        admin_role TEXT,
        grant_source TEXT,
        reason TEXT,
        ip TEXT,
        user_agent TEXT,
        extra_data JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS course_access_logs_user_idx ON course_access_logs(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS course_access_logs_playlist_idx ON course_access_logs(playlist_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS course_access_logs_admin_idx ON course_access_logs(admin_id)`);

    // plan_courses junction table (plans ↔ playlists many-to-many)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS plan_courses (
        id SERIAL PRIMARY KEY,
        plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
        playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        CONSTRAINT plan_courses_unique UNIQUE (plan_id, playlist_id)
      )
    `);

    // ── admins: email field ───────────────────────────────────────────────────
    await db.execute(sql`ALTER TABLE admins ADD COLUMN IF NOT EXISTS email TEXT`);

    // ── activity_logs: admin attribution columns ──────────────────────────────
    await db.execute(sql`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS admin_id INTEGER`);
    await db.execute(sql`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS admin_name TEXT`);
    await db.execute(sql`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS admin_role TEXT`);

    // ── admins: is_active + permissions ──────────────────────────────────────
    await db.execute(sql`ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);
    await db.execute(sql`ALTER TABLE admins ADD COLUMN IF NOT EXISTS permissions TEXT`);

    // ── user_courses: adminId + adminRole for full attribution tracking ───────
    await db.execute(sql`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS admin_id INTEGER`);
    await db.execute(sql`ALTER TABLE user_courses ADD COLUMN IF NOT EXISTS admin_role TEXT`);

    // ── admin_course_permissions table ────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_course_permissions (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER NOT NULL,
        playlist_id INTEGER NOT NULL,
        can_grant_access BOOLEAN NOT NULL DEFAULT true,
        can_remove_access BOOLEAN NOT NULL DEFAULT true,
        can_view_users BOOLEAN NOT NULL DEFAULT true,
        can_manage_videos BOOLEAN NOT NULL DEFAULT false,
        can_manage_categories BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by INTEGER,
        UNIQUE(admin_id, playlist_id)
      )
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

    // Always ensure admin exists — and always sync the password hash so a
    // forced redeploy can recover a lost/changed password.
    const adminHash = await bcrypt.hash("Fz8hxNc2#Mtq8Bx!", 10);
    if (admins.length === 0) {
      await db.insert(adminsTable).values({
        username: "rabah",
        passwordHash: adminHash,
      }).onConflictDoNothing();
      console.log("[seed] Admin created (username: rabah)");
    } else {
      const existing = admins.find(a => a.username === "rabah");
      if (existing) {
        await db.update(adminsTable)
          .set({ passwordHash: adminHash, displayName: (existing as any).displayName ?? "Rabah – Super Admin", role: (existing as any).role ?? "super_admin" } as any)
          .where(eq(adminsTable.id, existing.id));
        console.log("[seed] Admin password synced (username: rabah)");
      }
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

/* ════════════════════════════════════════════════════════════════════════
   ترحيل تلقائي في الخلفية — ينقل كل الفيديوهات من Drive إلى App Storage
   عند كل إعادة تشغيل للسيرفر. لا يعطّل أي طلبات جارية.
   ════════════════════════════════════════════════════════════════════════ */
async function runAutoStorageMigration(): Promise<void> {
  try {
    // Sort: most-parts videos first — they buffer the most and need migration urgently
    const unmigrated = await db
      .select({
        id: videosTable.id,
        title: videosTable.title,
        driveEmbedUrl: videosTable.driveEmbedUrl,
        driveParts: videosTable.driveParts,
      })
      .from(videosTable)
      .where(isNull(videosTable.objectParts))
      .orderBy(
        sql`CASE WHEN drive_parts IS NOT NULL THEN jsonb_array_length(drive_parts::jsonb) ELSE 1 END DESC`,
        videosTable.id,
      );

    if (unmigrated.length === 0) {
      console.log("[auto-migrate] All videos already on App Storage — nothing to do.");
      return;
    }

    console.log(`[auto-migrate] Starting background migration of ${unmigrated.length} video(s) to App Storage...`);

    for (const video of unmigrated) {
      try {
        const partsList = resolveVideoParts({
          driveEmbedUrl: video.driveEmbedUrl,
          driveParts: video.driveParts,
        });
        if (partsList.length === 0) {
          console.warn(`[auto-migrate] Video ${video.id} has no drive parts — skipping.`);
          continue;
        }

        // Copy all parts SEQUENTIALLY with a 1-second delay between them.
        // Parallel downloads of 11 × 800 MB files overwhelm Google Drive's
        // per-minute quota instantly → immediate 403 rateLimitExceeded on
        // parts 2-11, and concurrent downloads fight over bandwidth, making
        // each individual part take longer. Sequential + 1 s throttle keeps
        // well within the per-minute quota while still saturating bandwidth.
        // NEVER delete objects on failure: destination paths are deterministic
        // and the bucket is SHARED between dev and production.
        const partResults: Array<{ label: string; objectPath: string; bytes: number }> = [];
        for (let i = 0; i < partsList.length; i++) {
          const p = partsList[i];
          const fileId = extractDriveFileId(p.url);
          if (!fileId) throw new Error(`Part ${i + 1}: cannot extract Drive file id from "${p.url.slice(0, 80)}"`);
          const destPath = buildVideoObjectPath(video.id, i);
          console.log(`[auto-migrate] downloading part ${i + 1}/${partsList.length} of video ${video.id} (${p.label})`);
          const result = await copyDriveFileToStorage(fileId, destPath);
          if (result.bytes === 0) throw new Error(`Part ${i + 1}: copied 0 bytes`);
          const mb = (result.bytes / 1024 / 1024).toFixed(1);
          console.log(`[auto-migrate] part ${i + 1}/${partsList.length} done — ${mb} MB`);
          partResults.push({ label: p.label, objectPath: result.objectPath, bytes: result.bytes });
          // 1-second throttle between parts to stay within Drive rate limits
          if (i < partsList.length - 1) await new Promise(r => setTimeout(r, 1_000));
        }
        const copiedParts: ObjectPart[] = partResults.map(r => ({ label: r.label, objectPath: r.objectPath }));
        const totalBytes = partResults.reduce((acc, r) => acc + r.bytes, 0);

        // Conditional update — safe if admin UI raced us
        const updated = await db
          .update(videosTable)
          .set({ objectParts: JSON.stringify(copiedParts), migratedAt: new Date() })
          .where(and(eq(videosTable.id, video.id), isNull(videosTable.objectParts)))
          .returning({ id: videosTable.id });

        if (updated.length > 0) {
          const mb = Math.round(totalBytes / 1024 / 1024);
          console.log(`[auto-migrate] ✓ Video ${video.id} "${video.title.slice(0, 40)}" — ${mb} MB`);
        } else {
          console.log(`[auto-migrate] Video ${video.id} already claimed by concurrent migration — skipping.`);
        }
      } catch (err) {
        console.error(`[auto-migrate] ✗ Video ${video.id} failed — will retry on next restart:`, err instanceof Error ? err.message : err);
      }
    }

    console.log("[auto-migrate] Background migration complete.");
  } catch (err) {
    console.error("[auto-migrate] Fatal error in background migration:", err);
  }
}

runMigrations().then(() => ensureSeed()).then(() => {
  startIpResetScheduler();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    // نبدأ الترحيل في الخلفية مباشرة بعد تشغيل السيرفر — لا ينتظر ولا يعطّل
    // PRODUCTION ONLY: dev shares the same App Storage bucket, and dev's seed
    // videos (SAMPLE_ID urls) overlap production video ids 10-12. Running the
    // migration in dev writes/fails against the SAME object paths production
    // playback depends on. Dev must never touch videos/* in the shared bucket.
    if (process.env.DISABLE_VIDEO_AUTO_MIGRATE === "true") {
      console.log("[auto-migrate] Disabled via DISABLE_VIDEO_AUTO_MIGRATE — videos stream live from Drive.");
    } else if (process.env.NODE_ENV === "production") {
      void runAutoStorageMigration();
    } else {
      console.log("[auto-migrate] Skipped (dev environment — shared bucket protection).");
    }
    // عامل تحويل 720p في الخلفية — يعمل فقط على VPS عبر ENABLE_DRIVE_TRANSCODE=true
    if (process.env.ENABLE_DRIVE_TRANSCODE === "true" && process.env.NODE_ENV === "production") {
      startDriveTranscodeWorker();
    } else {
      console.log("[transcode-720p] Disabled (set ENABLE_DRIVE_TRANSCODE=true in production to enable).");
    }
    // عامل ضغط الصور المخزّنة (الصور القديمة الضخمة) — إنتاج فقط، ويمكن تعطيله
    if (
      process.env.ENABLE_IMAGE_OPTIMIZE !== "false" &&
      (process.env.NODE_ENV === "production" || process.env.ENABLE_IMAGE_OPTIMIZE === "true")
    ) {
      startImageOptimizeWorker();
    } else {
      console.log("[img-optimize] Disabled in dev (set ENABLE_IMAGE_OPTIMIZE=true to test locally).");
    }
  });
}).catch((err) => {
  console.error("=== STARTUP FATAL ERROR ===");
  console.error("The server failed to start. Details below:");
  console.error(err instanceof Error ? err.stack : err);
  console.error("DATABASE_URL set:", !!process.env.DATABASE_URL);
  console.error("DATABASE_URL prefix:", (process.env.DATABASE_URL || "").slice(0, 40));
  process.exit(1);
});
