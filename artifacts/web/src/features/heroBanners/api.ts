export type HeroBanner = {
  id: number;
  title?: string;
  isActive?: boolean;
  sortOrder?: number;
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
};

type RequestHeaders = Record<string, string>;

function headersFrom(getAdminAuthHeaders?: () => { headers: { Authorization: string } } | undefined): RequestHeaders {
  return getAdminAuthHeaders?.()?.headers ?? {};
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(body.error ?? body.message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function fetchActiveHeroBanners(): Promise<HeroBanner[]> {
  const response = await fetch("/api/hero-banners");
  return readResponse<HeroBanner[]>(response);
}

export async function fetchAdminHeroBanners(
  getAdminAuthHeaders: () => { headers: { Authorization: string } } | undefined,
): Promise<HeroBanner[]> {
  const response = await fetch("/api/admin/hero-banners", { headers: headersFrom(getAdminAuthHeaders) });
  return readResponse<HeroBanner[]>(response);
}

export async function createHeroBanner(
  getAdminAuthHeaders: () => { headers: { Authorization: string } } | undefined,
  data: { title: string; isActive?: boolean },
): Promise<HeroBanner> {
  const response = await fetch("/api/admin/hero-banners", {
    method: "POST",
    headers: { ...headersFrom(getAdminAuthHeaders), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return readResponse<HeroBanner>(response);
}

export async function updateHeroBanner(
  getAdminAuthHeaders: () => { headers: { Authorization: string } } | undefined,
  id: number,
  data: { title?: string; isActive?: boolean },
): Promise<HeroBanner> {
  const response = await fetch(`/api/admin/hero-banners/${id}`, {
    method: "PATCH",
    headers: { ...headersFrom(getAdminAuthHeaders), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return readResponse<HeroBanner>(response);
}

export async function deleteHeroBanner(
  getAdminAuthHeaders: () => { headers: { Authorization: string } } | undefined,
  id: number,
): Promise<void> {
  const response = await fetch(`/api/admin/hero-banners/${id}`, {
    method: "DELETE",
    headers: headersFrom(getAdminAuthHeaders),
  });
  await readResponse<unknown>(response);
}

export async function uploadHeroBannerImage(
  getAdminAuthHeaders: () => { headers: { Authorization: string } } | undefined,
  id: number,
  variant: "desktop" | "mobile",
  image: File,
): Promise<HeroBanner> {
  const form = new FormData();
  form.append("image", image);
  const response = await fetch(`/api/admin/hero-banners/${id}/images/${variant}`, {
    method: "POST",
    headers: headersFrom(getAdminAuthHeaders),
    body: form,
  });
  return readResponse<HeroBanner>(response);
}

export async function reorderHeroBanners(
  getAdminAuthHeaders: () => { headers: { Authorization: string } } | undefined,
  ids: number[],
): Promise<HeroBanner[]> {
  const response = await fetch("/api/admin/hero-banners/reorder", {
    method: "PUT",
    headers: { ...headersFrom(getAdminAuthHeaders), "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return readResponse<HeroBanner[]>(response);
}