/** Solutions API. Text is plain text, never HTML. All IDs are numbers except media UUIDs. */
export interface SolutionTaxonomy { id: number; kind: "brand" | "category" | "subcategory"; name: string; parentId: number | null }
/** taxonomies contains only real CRUD records. Public filter arrays merge manual
 * taxonomy names with distinct published free-text metadata; never draft metadata. */
export interface SolutionTaxonomyResponse { taxonomies: SolutionTaxonomy[]; brands: string[]; categories: string[] }
export interface SolutionResource { name: string; type: "tool" | "driver" | "firmware" | "file" | "external"; url: string; version?: string; note?: string }
export interface SolutionSection { title: string; text: string; imageIds: string[] }
export interface SolutionContent { introduction: string; device: string; problem: string; requirements: string[]; beforeStarting: string[]; steps: SolutionSection[]; result: string; warnings: string[]; resources: SolutionResource[] }
export interface SolutionMedia { id: string; url: string; name: string; width: number; height: number }
export interface SolutionCard { id: number; slug: string; title: string; excerpt: string; brand: string; model: string; category: string; coverUrl: string | null; publishedAt: string | null }
export interface SolutionFull extends SolutionCard { subcategory: string; tool: string; tags: string[]; content: SolutionContent; images: SolutionMedia[] }
export interface SolutionDraft extends SolutionFull {
  status: "draft" | "published";
  publicTitle: string;
  publicExcerpt: string;
  rawInput: string;
  keywords: string[];
  imageIds: string[];
  coverImageId: string | null;
  aiCoverImageId: string | null;
  customCoverImageId: string | null;
  coverSource: "custom" | "ai" | "screenshot" | null;
  reviewFlags: string[];
  generationError: string | null;
  coverGenerationError: string | null;
  updatedAt: string;
}
export interface SolutionList { solutions: SolutionCard[]; total: number; page: number; pageSize: number; pages: number; entitled: boolean }
export interface SolutionDetail { solution: SolutionCard | SolutionFull; entitled: boolean; related: SolutionCard[] }
export type SolutionDraftInput = Partial<Pick<SolutionDraft, "title" | "slug" | "excerpt" | "brand" | "model" | "category" | "subcategory" | "tool" | "tags" | "keywords" | "rawInput" | "content" | "imageIds" | "coverImageId" | "aiCoverImageId" | "customCoverImageId" | "coverSource" | "coverGenerationError" | "reviewFlags" | "publicTitle" | "publicExcerpt">>;
/** GET /api/solutions?search=&brand=&category=&page=1&pageSize=12
 * GET /api/solutions/taxonomies -> SolutionTaxonomyResponse (use brands/categories for public filters)
 * GET /api/solutions/:slug -> SolutionDetail
 * Admin uses existing admin Bearer token + manage_solutions.
 * GET /api/admin/solutions?status=draft&search=&page=1 -> paginated SolutionDraft[]
 * POST /api/admin/solutions (SolutionDraftInput) -> SolutionDraft
 * GET/PATCH/DELETE /api/admin/solutions/:id -> SolutionDraft / {success:true}
 * POST /:id/images multipart "images" (max 10, 8MB each) -> {images:SolutionMedia[]}; persisted immediately
 * POST /:id/generate (SolutionDraftInput, optional) -> SolutionDraft; raw input saved before AI, cover attempted independently
 * POST /:id/generate-cover -> SolutionDraft
 * POST /:id/cover multipart "cover" -> SolutionDraft
 * POST /:id/cover/screenshot {imageId:string|null} -> SolutionDraft
 * POST /:id/publish {overrideDuplicate?:boolean, reviewed?:boolean} -> SolutionDraft
 *   409 {code:"POSSIBLE_DUPLICATES",duplicates:SolutionCard[]} or {code:"REVIEW_REQUIRED"}
 * POST /:id/unpublish -> SolutionDraft
 * POST/PATCH/DELETE /api/admin/solutions/taxonomies[/:id] -> taxonomy / {success:true}
 * GET /api/admin/solutions/images/:id -> authenticated image (fetch blob using admin token)
 * GET /api/solutions/images/:id -> entitled member image (fetch blob using user token)
 * GET /api/solutions/:slug/cover -> public explicitly selected cover only
 */