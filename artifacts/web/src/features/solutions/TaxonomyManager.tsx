import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSolutionTaxonomiesPublic } from "./use-solutions";
import type { SolutionTaxonomy } from "./contract";

export function TaxonomyManager() {
  const { data, error: loadError } = useSolutionTaxonomiesPublic();
  const { getAdminAuthHeaders } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SolutionTaxonomy["kind"]>("brand");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reset = () => { setEditing(null); setName(""); setParentId(""); };
  async function request(method: string, id?: number) {
    setBusy(true); setError("");
    try {
      if (method !== "DELETE" && (!name.trim() || (kind === "subcategory" && !parentId))) throw new Error("Nom et catégorie parente requis.");
      const response = await fetch(`/api/admin/solutions/taxonomies${id ? `/${id}` : ""}`, {
        method, headers: { ...getAdminAuthHeaders()?.headers, "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify({ kind, name: name.trim(), parentId: kind === "subcategory" ? Number(parentId) : null }),
      });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || body?.message || `Erreur ${response.status}`); }
      await queryClient.invalidateQueries({ queryKey: ["solutions-taxonomies"] });
      reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Opération impossible"); }
    finally { setBusy(false); }
  }
  return <details className="bg-white border rounded-xl p-4"><summary className="font-semibold cursor-pointer">Catégories / Marques / Sous-catégories</summary>
    {(error || loadError) && <p role="alert" className="text-red-700 my-3">{error || loadError?.message}</p>}
    <fieldset disabled={busy} className="space-y-4 mt-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <label>Type<select disabled={editing !== null} className="w-full border rounded-md p-2" value={kind} onChange={e => { setKind(e.target.value as SolutionTaxonomy["kind"]); setParentId(""); }}>
          <option value="brand">Marque</option><option value="category">Catégorie</option><option value="subcategory">Sous-catégorie</option>
        </select></label>
        <label>Nom<Input value={name} onChange={e => setName(e.target.value)} /></label>
        {kind === "subcategory" && <label>Catégorie parente<select className="w-full border rounded-md p-2" value={parentId} onChange={e => setParentId(e.target.value)}><option value="">Sélectionnez…</option>{data?.taxonomies.filter(t => t.kind === "category").map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      </div>
      <div className="flex gap-2"><Button onClick={() => void request(editing ? "PATCH" : "POST", editing || undefined)}>{editing ? "Enregistrer" : "Ajouter"}</Button>{editing && <Button variant="outline" onClick={reset}>Annuler</Button>}</div>
      <div className="max-h-80 overflow-auto space-y-2">{data?.taxonomies.map(t => <div key={t.id} className="flex flex-wrap items-center gap-2 border-b py-2">
        <span className="flex-1">{t.name} <small className="text-slate-500">({t.kind}{t.parentId ? ` · ${data.taxonomies.find(parent => parent.id === t.parentId)?.name || t.parentId}` : ""})</small></span>
        <Button size="sm" variant="outline" onClick={() => { setEditing(t.id); setName(t.name); setKind(t.kind); setParentId(t.parentId?.toString() || ""); }}>Modifier</Button>
        <Button size="sm" variant="outline" onClick={() => { if (confirm(`Supprimer « ${t.name} » ?`)) void request("DELETE", t.id); }}>Supprimer</Button>
      </div>)}</div>
    </fieldset>
  </details>;
}