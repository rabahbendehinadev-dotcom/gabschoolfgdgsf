import { db, adminsTable, categoriesTable, subscriptionPlansTable, videosTable } from "@workspace/db";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  const adminPassword = await bcrypt.hash("admin123", 10);
  await db.insert(adminsTable).values({
    username: "admin",
    passwordHash: adminPassword,
  }).onConflictDoNothing();
  console.log("Admin created (username: admin, password: admin123)");

  const categories = [
    { name: "Samsung", slug: "samsung", icon: "smartphone" },
    { name: "iPhone", slug: "iphone", icon: "smartphone" },
    { name: "Huawei", slug: "huawei", icon: "smartphone" },
    { name: "Xiaomi", slug: "xiaomi", icon: "smartphone" },
    { name: "Oppo", slug: "oppo", icon: "smartphone" },
    { name: "Realme", slug: "realme", icon: "smartphone" },
    { name: "Vivo", slug: "vivo", icon: "smartphone" },
    { name: "Nokia", slug: "nokia", icon: "smartphone" },
  ];

  for (const cat of categories) {
    await db.insert(categoriesTable).values(cat).onConflictDoNothing();
  }
  console.log("Categories seeded");

  await db.insert(subscriptionPlansTable).values([
    { type: "demo", price: "0 DA", description: "Free trial with limited access to selected videos", durationDays: 7 },
    { type: "annual", price: "5000 DA", description: "Full access for one year to all courses and materials", durationDays: 365 },
    { type: "lifetime", price: "15000 DA", description: "Unlimited lifetime access to all current and future courses", durationDays: null },
  ]).onConflictDoNothing();
  console.log("Subscription plans seeded");

  const allCats = await db.select().from(categoriesTable);
  const samsungCat = allCats.find(c => c.slug === "samsung");
  const iphoneCat = allCats.find(c => c.slug === "iphone");
  const huaweiCat = allCats.find(c => c.slug === "huawei");

  if (samsungCat && iphoneCat && huaweiCat) {
    const sampleVideos = [
      {
        title: "Samsung Galaxy A54 - Flash Tutorial",
        description: "Learn how to flash Samsung Galaxy A54 using Odin tool. Step by step guide covering firmware download, driver installation, and the complete flashing process.",
        thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        driveEmbedUrl: "https://drive.google.com/file/d/SAMPLE_ID_1/preview",
        categoryId: samsungCat.id,
        isVipOnly: false,
        isVisible: true,
      },
      {
        title: "Samsung Galaxy S23 - FRP Bypass",
        description: "Complete FRP bypass tutorial for Samsung Galaxy S23. Remove Google account verification after factory reset.",
        thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        driveEmbedUrl: "https://drive.google.com/file/d/SAMPLE_ID_2/preview",
        categoryId: samsungCat.id,
        isVipOnly: true,
        isVisible: true,
      },
      {
        title: "iPhone 14 - Decoding Tutorial",
        description: "Professional decoding tutorial for iPhone 14. Learn the complete process of carrier unlocking and IMEI-based solutions.",
        thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        driveEmbedUrl: "https://drive.google.com/file/d/SAMPLE_ID_3/preview",
        categoryId: iphoneCat.id,
        isVipOnly: false,
        isVisible: true,
      },
      {
        title: "Huawei P50 - Flash & Recovery",
        description: "Complete flashing and recovery guide for Huawei P50 series. Covers HiSuite method and manual flash procedures.",
        thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        driveEmbedUrl: "https://drive.google.com/file/d/SAMPLE_ID_4/preview",
        categoryId: huaweiCat.id,
        isVipOnly: true,
        isVisible: true,
      },
      {
        title: "Samsung Galaxy A13 - Software Repair",
        description: "Fix boot loops, stuck on logo, and other software issues on Samsung Galaxy A13 with this comprehensive repair guide.",
        thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        driveEmbedUrl: "https://drive.google.com/file/d/SAMPLE_ID_5/preview",
        categoryId: samsungCat.id,
        isVipOnly: false,
        isVisible: true,
      },
      {
        title: "iPhone 13 - iCloud Bypass (VIP)",
        description: "Advanced iCloud bypass technique for iPhone 13. VIP exclusive content with detailed step-by-step instructions.",
        thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        driveEmbedUrl: "https://drive.google.com/file/d/SAMPLE_ID_6/preview",
        categoryId: iphoneCat.id,
        isVipOnly: true,
        isVisible: true,
      },
    ];

    for (const video of sampleVideos) {
      await db.insert(videosTable).values(video).onConflictDoNothing();
    }
    console.log("Sample videos seeded");
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch(console.error);
