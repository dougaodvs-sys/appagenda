import React, { useEffect, useState } from "react";
import { api, brl, fmtErr, mediaUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUpload, NoImage } from "@/components/ImageUpload";
import { toast } from "sonner";

const empty = { name: "", duration_min: 60, cleanup_min: 15, price: 100, description: "", image_url: "", active: true, professional_ids: [] };

export default function Services() {
  const [list, setList] = useState([]);
  const [pros, setPros] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/services").then((r) => setList(r.data));
  useEffect(() => { load(); api.get("/professionals").then((r) => setPros(r.data)); }, []);

  const togglePro = (pid) => {
    const ids = form.professional_ids || [];
    setForm({ ...form, professional_ids: ids.includes(pid) ? ids.filter((x) => x !== pid) : [...ids, pid] });
  };

  const save = async () => {
    try {
      if (editing) await api.put(`/services/${editing.id}`, form);
      else await api.post("/services", form);
      toast.success("Salvo"); setOpen(false); load();
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro"); }
  };
  const del = async (id) => { if (window.confirm("Remover serviço?")) { await api.delete(`/services/${id}`); load(); } };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div><div className="text-xs tracking-[0.4em] text-primary uppercase">Catálogo</div><h1 className="font-display text-4xl sm:text-5xl mt-2">Serviços</h1></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-service-btn" onClick={() => { setEditing(null); setForm(empty); setOpen(true); }} className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">+ Novo serviço</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} serviço</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome</Label><Input data-testid="svc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Duração (min)</Label><Input data-testid="svc-duration" type="number" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: parseInt(e.target.value || "0") })} /></div>
              <div><Label>Limpeza (min)</Label><Input type="number" value={form.cleanup_min} onChange={(e) => setForm({ ...form, cleanup_min: parseInt(e.target.value || "0") })} /></div>
              <div><Label>Preço (R$)</Label><Input data-testid="svc-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value || "0") })} /></div>
              <div className="col-span-2"><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="col-span-2">
                <Label>Imagem do serviço</Label>
                <div className="mt-2"><ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} folder="services" testid="svc-image" /></div>
              </div>
              <div className="col-span-2">
                <Label>Profissionais que realizam</Label>
                <div className="mt-2 grid grid-cols-2 gap-2" data-testid="svc-pros">
                  {pros.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma profissional cadastrada.</div>}
                  {pros.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox data-testid={`svc-pro-${p.id}`} checked={(form.professional_ids || []).includes(p.id)} onCheckedChange={() => togglePro(p.id)} />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter><Button data-testid="svc-save" onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((s) => (
          <Card key={s.id} className="p-0 overflow-hidden border-border" data-testid={`svc-${s.id}`}>
            {s.image_url
              ? <img src={mediaUrl(s.image_url)} alt={s.name} className="h-40 w-full object-cover" data-testid={`svc-img-${s.id}`} />
              : <NoImage className="h-40 w-full" />}
            <div className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.duration_min} min • limpeza {s.cleanup_min} min</div>
              </div>
              <div className="font-display text-2xl text-primary">{brl(s.price)}</div>
            </div>
            {s.description && <p className="text-sm text-muted-foreground mt-3">{s.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1" data-testid={`svc-pros-${s.id}`}>
              {(s.professional_names || []).length === 0
                ? <span className="text-xs text-destructive">Sem profissional vinculada</span>
                : s.professional_names.map((n) => <span key={n} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{n}</span>)}
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setEditing(s); setForm(s); setOpen(true); }}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => del(s.id)} className="text-destructive hover:text-destructive">Remover</Button>
            </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
