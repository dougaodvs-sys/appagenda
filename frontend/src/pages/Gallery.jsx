import React, { useEffect, useState } from "react";
import { api, fmtErr, mediaUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ImageUpload";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

const empty = { title: "", caption: "", before_url: "", after_url: "", service_id: null };

export default function Gallery() {
  const [list, setList] = useState([]);
  const [services, setServices] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = () => api.get("/gallery").then((r) => setList(r.data));
  useEffect(() => { load(); api.get("/services").then((r) => setServices(r.data)).catch(() => {}); }, []);

  const save = async () => {
    if (!form.title.trim()) return toast.error("Informe um título");
    if (!form.before_url || !form.after_url) return toast.error("Envie as fotos de antes e depois");
    try {
      await api.post("/gallery", form);
      toast.success("Trabalho publicado"); setOpen(false); setForm(empty); load();
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro"); }
  };
  const del = async (id) => { if (window.confirm("Remover da galeria?")) { await api.delete(`/gallery/${id}`); load(); } };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div><div className="text-xs tracking-[0.4em] text-primary uppercase">Portfólio</div><h1 className="font-display text-4xl sm:text-5xl mt-2">Galeria antes & depois</h1></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-gallery-btn" onClick={() => setForm(empty)} className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">+ Novo trabalho</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo trabalho</DialogTitle>
              <DialogDescription>Envie a foto de antes e depois para publicar no portfólio.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>Título</Label><Input data-testid="gal-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Alongamento em gel" /></div>
              <div><Label>Legenda (opcional)</Label><Input data-testid="gal-caption" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></div>
              <div>
                <Label>Serviço (opcional)</Label>
                <select data-testid="gal-service" value={form.service_id || ""} onChange={(e) => setForm({ ...form, service_id: e.target.value || null })}
                  className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                  <option value="">—</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ImageUpload label="Antes" value={form.before_url} onChange={(url) => setForm({ ...form, before_url: url })} folder="gallery" testid="gal-before" aspect="aspect-square" />
                <ImageUpload label="Depois" value={form.after_url} onChange={(url) => setForm({ ...form, after_url: url })} folder="gallery" testid="gal-after" aspect="aspect-square" />
              </div>
            </div>
            <DialogFooter><Button data-testid="gal-save" onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">Publicar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {list.length === 0 && <div className="text-muted-foreground text-sm">Nenhum trabalho publicado ainda.</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {list.map((g) => (
          <Card key={g.id} className="p-0 overflow-hidden border-border" data-testid={`gallery-${g.id}`}>
            <div className="grid grid-cols-2">
              <div className="relative">
                <img src={mediaUrl(g.before_url)} alt="antes" className="h-44 w-full object-cover" />
                <span className="absolute top-2 left-2 text-[10px] tracking-widest uppercase bg-black/70 text-white px-2 py-0.5 rounded-full">Antes</span>
              </div>
              <div className="relative">
                <img src={mediaUrl(g.after_url)} alt="depois" className="h-44 w-full object-cover" />
                <span className="absolute top-2 right-2 text-[10px] tracking-widest uppercase bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Depois</span>
              </div>
            </div>
            <div className="p-4 flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{g.title}</div>
                {g.caption && <div className="text-xs text-muted-foreground mt-0.5">{g.caption}</div>}
              </div>
              <button onClick={() => del(g.id)} data-testid={`gallery-del-${g.id}`} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={16} /></button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
