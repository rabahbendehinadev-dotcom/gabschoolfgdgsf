import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Wrench, Plus, Search, Loader2, Image as ImageIcon, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { useAdminSolutionsList, useAdminSolutionMutations } from "@/features/solutions/use-solutions";
import { useToast } from "@/hooks/use-toast";
import { SolutionImage } from "@/features/solutions/Article";
import { TaxonomyManager } from "@/features/solutions/TaxonomyManager";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AdminSolutions() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const { data, isLoading, error } = useAdminSolutionsList({ search, status, page, pageSize: 20 });
  const { remove } = useAdminSolutionMutations();
  const { toast } = useToast();

  const handleDelete = async (id: number) => {
    if (!confirm("Voulez-vous vraiment supprimer cette solution ?")) return;
    try {
      await remove.mutateAsync(id);
      toast({ title: "Solution supprimée", description: "La solution a été supprimée avec succès." });
    } catch (err) {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de supprimer." });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Wrench className="h-6 w-6 text-primary" />
            Solutions Techniques
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gérez la base de connaissances et générez des articles avec l'IA.
          </p>
        </div>
        <Link href="/bendehinaonline97/solutions/new" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Plus className="h-4 w-4" />
          Nouvelle Solution (IA)
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <select aria-label="Statut" className="border rounded-md p-2" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Toutes</option><option value="draft">Brouillons</option><option value="published">Publiées</option></select>
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher par modèle, marque, outil ou titre..."
            className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-primary"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <TaxonomyManager />
      {error && <p role="alert" className="text-red-700">{error.message}</p>}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow>
                  <TableHead className="w-[80px]">Cover</TableHead>
                  <TableHead>Titre</TableHead>
                  <TableHead>Appareil</TableHead>
                  <TableHead>Catégorie / Outil</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.solutions.map((sol) => (
                  <TableRow key={sol.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell>
                      {sol.coverImageId ? (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden border border-slate-200">
                          <SolutionImage id={sol.coverImageId} admin className="w-full h-full" alt={sol.title} />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                          <ImageIcon className="h-5 w-5 text-slate-400" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{sol.title || "Brouillon sans titre"}</div>
                      <div className="text-xs text-slate-500 truncate max-w-xs">{sol.excerpt || "Aucun extrait"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-700">{sol.brand} {sol.model}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {sol.category && <Badge variant="secondary" className="text-[10px]">{sol.category}</Badge>}
                        {sol.tool && <Badge variant="outline" className="text-[10px] bg-slate-50">{sol.tool}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {sol.status === "published" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">Publié</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200">Brouillon</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/bendehinaonline97/solutions/${sol.id}/edit`} className="cursor-pointer flex items-center gap-2">
                              <Edit className="h-4 w-4" />
                              Modifier
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(sol.id)} className="text-destructive focus:text-destructive cursor-pointer flex items-center gap-2">
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {!data?.solutions.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                      Aucune solution trouvée. Créez votre premier guide.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            Précédent
          </Button>
          <div className="flex items-center text-sm font-medium text-slate-600 px-4">
            Page {page} sur {data.pages}
          </div>
          <Button variant="outline" size="sm" disabled={page === data.pages} onClick={() => setPage(p => p + 1)}>
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}
