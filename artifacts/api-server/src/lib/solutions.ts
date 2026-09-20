import { z } from "zod";
import { isActiveVip, type VipCheckable } from "./vipUtils";

const text = z.string().max(20000);
const short = z.string().max(300);
const strings = z.array(short).max(100);
export const solutionContentSchema = z.object({
  introduction: text, device: text, problem: text,
  requirements: z.array(text).max(100), beforeStarting: z.array(text).max(100),
  steps: z.array(z.object({ title: short, text, imageIds: z.array(z.string().uuid()).max(30) }).strict()).max(100),
  result: text, warnings: z.array(text).max(100),
  resources: z.array(z.object({
    name: short, type: z.enum(["tool", "driver", "firmware", "file", "external"]),
    url: z.string().url().max(2000).refine(v => /^https?:\/\//i.test(v), "HTTP(S) URLs only"),
    version: short.optional(), note: text.optional(),
  }).strict()).max(50),
}).strict();
export const emptySolutionContent = { introduction: "", device: "", problem: "", requirements: [], beforeStarting: [], steps: [], result: "", warnings: [], resources: [] };
export const solutionInputSchema = z.object({
  title: short, slug: z.string().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  excerpt: z.string().max(600), brand: short, model: short, category: short, subcategory: short, tool: short,
  tags: strings, keywords: strings, rawInput: z.string().max(60000),
  content: solutionContentSchema, imageIds: z.array(z.string().uuid()).max(30),
  coverImageId: z.string().uuid().nullable(), reviewFlags: strings,
}).partial().strict();
export const aiSolutionSchema = solutionInputSchema.required().omit({ rawInput: true });

export function normalizeAiSolutionResources(value: unknown, suppliedUrls: ReadonlySet<string>): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  if (!root.content || typeof root.content !== "object" || Array.isArray(root.content)) return value;
  const content = root.content as Record<string, unknown>;
  if (!Array.isArray(content.resources)) return value;
  const resources = content.resources.filter(resource => {
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) return false;
    const url = (resource as Record<string, unknown>).url;
    if (typeof url !== "string" || !suppliedUrls.has(url)) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
  return { ...root, content: { ...content, resources } };
}

export function isSolutionsEntitled(user?: VipCheckable | null): boolean {
  return isActiveVip(user);
}

export function solutionCoverImageId(row: {
  customCoverImageId: string | null;
  aiCoverImageId: string | null;
  coverImageId: string | null;
}): string | null {
  return row.customCoverImageId ?? row.aiCoverImageId ?? row.coverImageId ?? null;
}

/** Explicit allowlist: never spread DB rows into a visitor response. */
export function solutionCard(row: {
  id: number; slug: string; title: string; excerpt: string; brand: string; model: string; category: string;
  subcategory: string; tool: string; tags: string[]; coverImageId: string | null; aiCoverImageId: string | null;
  customCoverImageId: string | null; imageIds: string[]; publishedAt: Date | null;
}) {
  return {
    id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt, brand: row.brand,
    model: row.model, category: row.category, subcategory: row.subcategory, tool: row.tool,
    tags: row.tags, coverUrl: solutionCoverImageId(row) ? `/api/solutions/${encodeURIComponent(row.slug)}/cover` : null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

export function assertSolutionImageRefs(input: z.infer<typeof solutionInputSchema>, ownedIds: string[]) {
  const allowed = new Set(ownedIds);
  const selected = input.imageIds ?? ownedIds;
  const selectedSet = new Set(selected);
  const refs = [...selected, ...(input.coverImageId ? [input.coverImageId] : []), ...(input.content?.steps.flatMap(s => s.imageIds) ?? [])];
  if (new Set(selected).size !== selected.length || refs.some(id => !allowed.has(id) || !selectedSet.has(id))) {
    throw new Error("Unknown or removed image reference");
  }
}