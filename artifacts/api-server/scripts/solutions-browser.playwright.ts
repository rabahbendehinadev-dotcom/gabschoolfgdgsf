import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "playwright/test";
import {
  activityLogsTable,
  adminsTable,
  adminSessionsTable,
  db,
  solutionImagesTable,
  solutionsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth";
import { solutionFile } from "../src/lib/solutionStorage";

test.describe.configure({ mode: "serial" });
test.use({
  viewport: { width: 1440, height: 1000 },
  launchOptions: {
    executablePath: "/repl/tools/bin/chromium",
    args: ["--no-sandbox"],
  },
});

const baseUrl = process.env.SOLUTIONS_BROWSER_BASE_URL || "http://localhost:80";
const runId = `solutions-browser-${Date.now()}-${randomUUID().slice(0, 8)}`;
const adminEmail = `${runId}@example.invalid`;
const password = `Browser!${randomUUID()}9a`;
let adminId: number | undefined;
const solutionIds: number[] = [];
const screenshotsDir = fileURLToPath(new URL("../../../screenshots/", import.meta.url));

async function screenshot(page: Page, name: string) {
  await mkdir(screenshotsDir, { recursive: true });
  await page.screenshot({
    path: `${screenshotsDir}/${runId}-${name}.png`,
    fullPage: true,
  });
}

async function waitForBusyToFinish(page: Page, timeout = 45_000) {
  const busy = page.locator('p[role="status"]');
  await expect(busy).toBeVisible({ timeout: 2_000 }).catch(() => {});
  await expect(busy).toBeHidden({ timeout });
}

async function cleanup() {
  if (!adminId) return;
  const rows = await db
    .select({ id: solutionsTable.id })
    .from(solutionsTable)
    .where(eq(solutionsTable.createdBy, adminId));
  const ids = rows.map((row) => row.id);
  solutionIds.splice(0, solutionIds.length, ...ids);
  if (ids.length) {
    const images = await db
      .select({ objectPath: solutionImagesTable.objectPath })
      .from(solutionImagesTable)
      .where(inArray(solutionImagesTable.solutionId, ids));
    for (const image of images) {
      await solutionFile(image.objectPath).delete().catch(() => {});
    }
    await db.delete(solutionsTable).where(inArray(solutionsTable.id, ids));
  }
  await db.delete(activityLogsTable).where(eq(activityLogsTable.adminId, adminId));
  await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminId, adminId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
}

test.beforeAll(async () => {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Refusing to run Solutions browser fixtures outside NODE_ENV=development");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Development DATABASE_URL is required");
  }
  const [admin] = await db
    .insert(adminsTable)
    .values({
      username: runId,
      email: adminEmail,
      displayName: runId,
      passwordHash: await hashPassword(password),
      role: "support",
      permissions: JSON.stringify(["manage_solutions"]),
    })
    .returning({ id: adminsTable.id });
  adminId = admin.id;
});

test.afterAll(cleanup);

test("publishes a Solution through the real admin and visitor UIs", async ({ browser }) => {
  test.setTimeout(Number(process.env.SOLUTIONS_BROWSER_TIMEOUT_MS || 300_000));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    console.log(`[browser] ${runId}: genuine admin login`);
    await page.goto(`${baseUrl}/bendehinaonline97/login`);
    await expect(page.getByRole("heading", { name: "Portail d'administration" })).toBeVisible();
    await page.locator('input[autocomplete="username"]').fill(adminEmail);
    await page.locator('input[autocomplete="current-password"]').fill(password);
    await page.getByRole("button", { name: "Accéder au panneau" }).click();
    await expect(page).toHaveURL(/\/bendehinaonline97\/solutions$/);
    await expect(page.getByRole("heading", { name: "Solutions Techniques" })).toBeVisible({ timeout: 20_000 });

    await page.goto(`${baseUrl}/bendehinaonline97/solutions/new`);
    console.log(`[browser] ${runId}: new composer loaded`);
    await expect(page.getByRole("heading", { name: "Nouvelle solution" })).toBeVisible();
    const notes = page.getByLabel(/Notes brutes/);
    await notes.fill(
      [
        `${runId} harmless technical verification notes.`,
         "Brand: SyntheticLab. Model: BR-100. Category: Network repair. Subcategory: Router recovery. Tool: Synthetic Console.",
        "Problem: an amber status tile appears after a configuration change.",
         "Prerequisite: authorized access to the synthetic lab router.",
         "Before starting: record the current setting.",
         "Warning: do not disconnect power while saving.",
        "Verified procedure: record the current setting, restore the prior setting, save, and confirm the tile turns green.",
         "Result: the synthetic status tile is green.",
         `Download: https://example.com/${runId}`,
        "The screenshots are generated synthetic raster panels and contain no credentials.",
        `Keep the fixture identifier ${runId} in the generated draft. Do not invent credentials or unsafe steps.`,
      ].join("\n"),
    );

    const pastedNames = await notes.evaluate((element, id) => {
      const makeFile = (name: string, background: string, label: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = 720;
        canvas.height = 420;
        const context = canvas.getContext("2d")!;
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#172033";
        context.font = "bold 34px sans-serif";
        context.fillText(label, 55, 110);
        context.font = "22px sans-serif";
        context.fillText(id, 55, 180);
        const binary = atob(canvas.toDataURL("image/png").split(",")[1]);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        return new File([bytes], name, { type: "image/png" });
      };
      const files = [
        makeFile(`${id}-paste-amber.png`, "#fff3cd", "Synthetic status: amber"),
        makeFile(`${id}-paste-green.png`, "#d1fae5", "Synthetic status: green"),
      ];
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }),
      );
      return files.map((file) => file.name);
    }, runId);
    const pendingCards = page.locator("p.text-xs").filter({ hasText: "En attente" });
    await expect(pendingCards).toHaveCount(2);

    const pickerFile = await page.evaluate((id) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 200;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#e0e7ff";
      context.fillRect(0, 0, 320, 200);
      context.fillStyle = "#312e81";
      context.font = "24px sans-serif";
      context.fillText("Picker fixture", 30, 90);
      return { name: `${id}-picker.png`, data: canvas.toDataURL("image/png").split(",")[1] };
    }, runId);
    await page.locator('input[type="file"][aria-label="Captures"]').setInputFiles({
      name: pickerFile.name,
      mimeType: "image/png",
      buffer: Buffer.from(pickerFile.data, "base64"),
    });
    await expect(pendingCards).toHaveCount(3);
    await pendingCards.nth(2).locator("..").getByRole("button", { name: "Retirer" }).click();
    await expect(pendingCards).toHaveCount(2);

    const dropName = `${runId}-drop.png`;
    await page.locator("fieldset > div").first().evaluate((target, name) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 200;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#fee2e2";
      context.fillRect(0, 0, 320, 200);
      const binary = atob(canvas.toDataURL("image/png").split(",")[1]);
      const file = new File(
        [Uint8Array.from(binary, (character) => character.charCodeAt(0))],
        name,
        { type: "image/png" },
      );
      const transfer = new DataTransfer();
      transfer.items.add(file);
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, dropName);
    await expect(pendingCards).toHaveCount(3);
    await pendingCards.nth(2).locator("..").getByRole("button", { name: "Retirer" }).click();
    await expect(pendingCards).toHaveCount(2);
    console.log(`[browser] ${runId}: paste, picker, drop, remove verified`);

    await pendingCards.nth(0).locator("..").getByRole("button", { name: "↓" }).click();
    await pendingCards.nth(0).locator("..").getByLabel("Couverture publique").check();

    await page.getByRole("button", { name: "Sauvegarder le brouillon et les images" }).click();
    await waitForBusyToFinish(page);
    await expect(page).toHaveURL(/\/bendehinaonline97\/solutions\/\d+\/edit$/);
    const id = Number(page.url().match(/solutions\/(\d+)\/edit/)?.[1]);
    expect(id).toBeGreaterThan(0);
    solutionIds.push(id);
    await page.reload();
    await expect(notes).toContainText(runId);
    await expect(page.getByText(pastedNames[0])).toBeVisible();
    await expect(page.getByText(pastedNames[1])).toBeVisible();
    const orderedUploadedNames = await page.locator("p.text-xs").filter({ hasText: runId }).allTextContents();
    expect(orderedUploadedNames[0]).toContain(pastedNames[1]);
    await expect(page.getByLabel("Couverture publique").first()).toBeChecked();
    console.log(`[browser] ${runId}: save/reload, reorder, cover verified`);

    console.log(`[browser] ${runId}: starting one real AI generation`);
    await page.getByRole("button", { name: "Générer avec AI / Réessayer" }).click();
    await waitForBusyToFinish(page, 180_000);
    await expect(page.getByText("Génération terminée — vérifiez le contenu", { exact: true })).toBeVisible();
    console.log(`[browser] ${runId}: real AI generation completed`);

     const preview = page.getByRole("heading", { name: "Aperçu de l’article" }).locator("..").locator("..");
     await expect(preview).toBeVisible();
     await expect(page.locator("#advanced-solution-editing")).not.toHaveAttribute("open", "");
     await expect(page.getByRole("heading", { level: 1 }).nth(1)).not.toHaveText("Titre à vérifier");
     await expect(page.getByRole("heading", { name: /Procédure/ })).toBeVisible();
     await expect(page.getByRole("heading", { name: /Ressources/ })).toBeVisible();
     await screenshot(page, "ai-generated-preview");

     await page.getByRole("button", { name: "Corriger dans l’édition avancée" }).click();
     await expect(page.locator("#advanced-solution-editing")).toHaveAttribute("open", "");
     const metadata = page.getByRole("heading", { name: "Métadonnées générées" }).locator("..");
    const metadataInputs = metadata.locator("input");
     const generatedTitle = await metadataInputs.nth(0).inputValue();
     const generatedSlug = await metadataInputs.nth(1).inputValue();
     expect(generatedTitle.trim()).not.toBe("");
     expect(generatedSlug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
     for (const index of [2, 3, 4, 5, 6, 7, 8]) {
       expect((await metadataInputs.nth(index).inputValue()).trim()).not.toBe("");
     }
     expect((await metadata.locator("textarea").inputValue()).trim()).not.toBe("");
     await expect(page.getByLabel(/Titre étape/).first()).not.toHaveValue("");
     await expect(page.getByLabel(/Texte étape/).first()).not.toHaveValue("");
     expect(await page.locator('#advanced-solution-editing input[type="checkbox"]:checked').count()).toBeGreaterThan(0);
     await expect(page.locator('#advanced-solution-editing input[type="url"]').first()).toHaveValue(`https://example.com/${runId}`);
     console.log(`[browser] ${runId}: AI populated metadata, article, resource and screenshot placement`);
    await page
      .locator("label")
      .filter({ hasText: "J'ai vérifié les instructions techniques" })
      .locator('input[type="checkbox"]')
      .check();
    await page.getByRole("button", { name: "Confirmer et publier" }).click();
    await waitForBusyToFinish(page);
    await expect(page.getByText("Solution publiée", { exact: true })).toBeVisible();
    await expect(page.getByText(/Publié — dépubliez/)).toBeVisible();
    console.log(`[browser] ${runId}: preview/review/publish verified`);

    const visitor = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`${baseUrl}/solutions`);
    await visitorPage.getByPlaceholder(/ابحث عن موديل/).fill(runId);
     await expect(visitorPage.getByRole("heading", { name: generatedTitle })).toBeVisible({ timeout: 15_000 });
     await visitorPage.getByRole("heading", { name: generatedTitle }).click();
     await expect(visitorPage).toHaveURL(new RegExp(`/solutions/${generatedSlug}$`));
     await expect(visitorPage.getByRole("heading", { name: generatedTitle })).toBeVisible();
    await expect(visitorPage.getByRole("heading", { name: "اشترك للوصول إلى الحل الكامل" })).toBeVisible();
    const lockedCta = visitorPage.locator("section").filter({
      has: visitorPage.getByRole("heading", { name: "اشترك للوصول إلى الحل الكامل" }),
    });
    await expect(lockedCta.getByRole("link", { name: "اشترك الآن" })).toBeVisible();
    await expect(lockedCta.getByRole("link", { name: "تسجيل الدخول" })).toBeVisible();
     await expect(visitorPage.getByText("restore the prior setting", { exact: false })).toHaveCount(0);
    await screenshot(visitorPage, "visitor-locked-detail");

    await visitorPage.setViewportSize({ width: 390, height: 844 });
    await visitorPage.goto(`${baseUrl}/solutions`);
    await visitorPage.getByPlaceholder(/ابحث عن موديل/).fill(runId);
     await expect(visitorPage.getByRole("heading", { name: generatedTitle })).toBeVisible({ timeout: 15_000 });
    expect(await visitorPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await screenshot(visitorPage, "mobile-search");
     await visitorPage.getByRole("heading", { name: generatedTitle }).click();
    await expect(visitorPage.getByRole("heading", { name: "اشترك للوصول إلى الحل الكامل" })).toBeVisible();
    expect(await visitorPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await screenshot(visitorPage, "mobile-locked-detail");
    console.log(`[browser] ${runId}: visitor lock/search and 390px overflow verified`);
    await visitor.close();
  } catch (error) {
    await screenshot(page, "failure").catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
});