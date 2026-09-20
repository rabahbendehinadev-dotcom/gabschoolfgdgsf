import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type {
  SolutionTaxonomy,
  SolutionResource,
  SolutionSection,
  SolutionContent,
  SolutionMedia,
  SolutionCard,
  SolutionFull,
  SolutionDraft,
  SolutionList,
  SolutionDetail,
  SolutionDraftInput
} from "./contract";

export type {
  SolutionTaxonomy,
  SolutionResource,
  SolutionSection,
  SolutionContent,
  SolutionMedia,
  SolutionCard,
  SolutionFull,
  SolutionDraft,
  SolutionList,
  SolutionDetail,
  SolutionDraftInput
};

async function responseError(response: Response): Promise<never> {
  const data = await response.json().catch(() => null);
  throw Object.assign(new Error(data?.error || data?.message || `Erreur serveur (${response.status})`), { status: response.status, data });
}

export function useSolutionsPublic(params: { search?: string; brand?: string; category?: string; page?: number; pageSize?: number }) {
  const { getAuthHeaders, token } = useAuth();

  return useQuery({
    queryKey: ["solutions", params, token],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params.search) q.set("search", params.search);
      if (params.brand) q.set("brand", params.brand);
      if (params.category) q.set("category", params.category);
      if (params.page) q.set("page", params.page.toString());
      if (params.pageSize) q.set("pageSize", params.pageSize.toString());

      const res = await fetch(`/api/solutions?${q.toString()}`, getAuthHeaders());
      if (!res.ok) throw new Error("Failed to fetch solutions");
      return (await res.json()) as SolutionList;
    }
  });
}

export function useSolutionTaxonomiesPublic() {
  const { getAuthHeaders } = useAuth();
  return useQuery({
    queryKey: ["solutions-taxonomies"],
    queryFn: async () => {
      const res = await fetch("/api/solutions/taxonomies", getAuthHeaders());
      if (!res.ok) throw new Error("Failed to fetch taxonomies");
      return (await res.json()) as { taxonomies: SolutionTaxonomy[]; brands: string[]; categories: string[] };
    },
    staleTime: 60 * 60 * 1000
  });
}

export function useSolutionTaxonomiesAdmin() {
  const { getAdminAuthHeaders, adminToken } = useAuth();
  return useQuery({
    queryKey: ["admin-solutions-taxonomies", adminToken],
    queryFn: async () => {
      const res = await fetch("/api/admin/solutions/taxonomies", getAdminAuthHeaders());
      if (!res.ok) throw new Error("Failed to fetch admin taxonomies");
      return (await res.json()) as { taxonomies: SolutionTaxonomy[] };
    },
    enabled: !!adminToken,
    staleTime: 60 * 60 * 1000
  });
}

export function useSolutionDetail(slug: string) {
  const { getAuthHeaders, token, user } = useAuth();
  return useQuery({
    queryKey: ["solutions", slug, token, user],
    gcTime: 0,
    queryFn: async () => {
      const res = await fetch(`/api/solutions/${encodeURIComponent(slug)}`, { ...getAuthHeaders(), cache: "no-store" });
      if (!res.ok) await responseError(res);
      return (await res.json()) as SolutionDetail;
    },
    enabled: !!slug
  });
}

// ---------------- Admin Hooks ----------------

export function useAdminSolutionsList(params: { status?: string; search?: string; page?: number; pageSize?: number }) {
  const { getAdminAuthHeaders, adminToken } = useAuth();

  return useQuery({
    queryKey: ["admin-solutions", params, adminToken],
    gcTime: 0,
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params.status) q.set("status", params.status);
      if (params.search) q.set("search", params.search);
      if (params.page) q.set("page", params.page.toString());
      if (params.pageSize) q.set("pageSize", params.pageSize.toString());

      const res = await fetch(`/api/admin/solutions?${q.toString()}`, getAdminAuthHeaders());
      if (!res.ok) throw new Error("Failed to fetch admin solutions");
      return (await res.json()) as { solutions: SolutionDraft[]; total: number; page: number; pageSize: number; pages: number };
    }
  });
}

export function useAdminSolution(id?: number) {
  const { getAdminAuthHeaders, adminToken } = useAuth();
  return useQuery({
    queryKey: ["admin-solution", id, adminToken],
    gcTime: 0,
    queryFn: async () => {
      const res = await fetch(`/api/admin/solutions/${id}`, getAdminAuthHeaders());
      if (!res.ok) throw new Error("Failed to fetch solution draft");
      return (await res.json()) as SolutionDraft;
    },
    enabled: !!id
  });
}

export function useAdminSolutionMutations() {
  const queryClient = useQueryClient();
  const { getAdminAuthHeaders, adminToken } = useAuth();
  const { toast } = useToast();

  const create = useMutation({
    mutationFn: async (data: SolutionDraftInput) => {
      const res = await fetch("/api/admin/solutions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify(data)
      });
      if (!res.ok) await responseError(res);
      return (await res.json()) as SolutionDraft;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-solutions"] })
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: SolutionDraftInput }) => {
      const res = await fetch(`/api/admin/solutions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify(data)
      });
      if (!res.ok) await responseError(res);
      return (await res.json()) as SolutionDraft;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["admin-solution", variables.id, adminToken], data);
      queryClient.invalidateQueries({ queryKey: ["admin-solutions"] });
    }
  });

  const generate = useMutation({
    mutationFn: async ({ id, data }: { id: number; data?: SolutionDraftInput }) => {
      const res = await fetch(`/api/admin/solutions/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: data ? JSON.stringify(data) : undefined
      });
      if (!res.ok) await responseError(res);
      return (await res.json()) as SolutionDraft;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["admin-solution", variables.id, adminToken], data);
    }
  });

  const generateCover = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/solutions/${id}/generate-cover`, {
        method: "POST",
        headers: { ...getAdminAuthHeaders()?.headers }
      });
      if (!res.ok) await responseError(res);
      return (await res.json()) as SolutionDraft;
    },
    onSuccess: (data, id) => {
      queryClient.setQueryData(["admin-solution", id, adminToken], data);
      queryClient.invalidateQueries({ queryKey: ["admin-solutions"] });
    }
  });

  const uploadCover = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const formData = new FormData();
      formData.append("cover", file);
      const res = await fetch(`/api/admin/solutions/${id}/cover`, {
        method: "POST",
        headers: { ...getAdminAuthHeaders()?.headers },
        body: formData
      });
      if (!res.ok) await responseError(res);
      return (await res.json()) as SolutionDraft;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["admin-solution", variables.id, adminToken], data);
      queryClient.invalidateQueries({ queryKey: ["admin-solutions"] });
    }
  });

  const useScreenshotCover = useMutation({
    mutationFn: async ({ id, imageId }: { id: number; imageId: string | null }) => {
      const res = await fetch(`/api/admin/solutions/${id}/cover/screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify({ imageId })
      });
      if (!res.ok) await responseError(res);
      return (await res.json()) as SolutionDraft;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["admin-solution", variables.id, adminToken], data);
      queryClient.invalidateQueries({ queryKey: ["admin-solutions"] });
    }
  });

  const uploadImages = useMutation({
    mutationFn: async ({ id, files }: { id: number; files: File[] }) => {
      const formData = new FormData();
      files.forEach(f => formData.append("images", f));

      const res = await fetch(`/api/admin/solutions/${id}/images`, {
        method: "POST",
        headers: { ...getAdminAuthHeaders()?.headers },
        body: formData
      });
      if (!res.ok) await responseError(res);
      return (await res.json()) as { images: SolutionMedia[] };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-solution", variables.id] });
    }
  });

  const publish = useMutation({
    mutationFn: async ({ id, overrideDuplicate, reviewed }: { id: number; overrideDuplicate?: boolean; reviewed?: boolean }) => {
      const res = await fetch(`/api/admin/solutions/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify({ overrideDuplicate, reviewed })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw { status: res.status, data: errorData };
      }
      return (await res.json()) as SolutionDraft;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["admin-solution", variables.id, adminToken], data);
      queryClient.invalidateQueries({ queryKey: ["admin-solutions"] });
    }
  });

  const unpublish = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/solutions/${id}/unpublish`, {
        method: "POST",
        headers: { ...getAdminAuthHeaders()?.headers }
      });
      if (!res.ok) await responseError(res);
      return (await res.json()) as SolutionDraft;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["admin-solution", variables, adminToken], data);
      queryClient.invalidateQueries({ queryKey: ["admin-solutions"] });
    }
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/solutions/${id}`, {
        method: "DELETE",
        headers: { ...getAdminAuthHeaders()?.headers }
      });
      if (!res.ok) await responseError(res);
      return (await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-solutions"] })
  });

  return { create, update, generate, generateCover, uploadCover, useScreenshotCover, uploadImages, publish, unpublish, remove };
}

export function useAdminTaxonomies() {
  const { getAdminAuthHeaders } = useAuth();
  return useQuery({
    queryKey: ["admin-taxonomies"],
    queryFn: async () => {
      const res = await fetch("/api/solutions/taxonomies", getAdminAuthHeaders());
      if (!res.ok) throw new Error("Failed to fetch admin taxonomies");
      return ((await res.json()) as { taxonomies: SolutionTaxonomy[] }).taxonomies;
    }
  });
}
