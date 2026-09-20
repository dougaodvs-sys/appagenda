import React, { useEffect, useState } from "react";
import { api, fmtErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const emptyForm = { professional_id: "", date: "", start_time: "09:00", end_time: "10:00", reason: "", kind: "single" };

export default function Blocks() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [pros, setPros] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = () => Promise.all([
    api.get("/blocks").then((r) => setList(r.data)),
    api.get("/professionals").then((r) => setPros(r.data)),
  ]);
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const pid = user.role === "professional" ? user.id : form.professional_id;
      if (!pid) return toast.error("Selecione o profissional");
      if (!form.date) return toast.error("Selecione a data");
      const start = new Date(`${form.date}T${form.start_time}:00`).toISOString();
      const end = new Date(`${form.date}T${form.end_time}:00`).toISOString();
      await api.post("/blocks", { professional_id: pid, start, end, reason: form.reason, kind: form.kind });
      toast.success("Bloqueio criado"); setOpen(false); setForm(emptyForm); load();
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro"); }
  };
  const del = async (id) => { if (window.confirm("Remover bloqueio?")) { await api.delete(`/blocks/${id}`); load(); } };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div><div className="text-xs tracking-[0.4em] text-primary uppercase">Agenda</div><h1 className="font-display text-4xl sm:text-5xl mt-2">Bloqueios</h1></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-block-btn" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">+ Novo bloqueio</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo bloqueio</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {user.role === "manager" && (
                <div className="col-span-2">
                  <Label>Profissional</Label>
                  <Select value={form.professional_id} onValueChange={(v) => setForm({ ...form, professional_id: v })}>
                    <SelectTrigger data-testid="block-pro"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{pros.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="col-span-2"><Label>Data</Label><Input data-testid="block-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>De</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
              <div><Label>Até</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
              <div className="col-span-2">
                <Label>Motivo</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Compromisso</SelectItem>
                    <SelectItem value="lunch">Almoço</SelectItem>
                    <SelectItem value="vacation">Férias</SelectItem>
                    <SelectItem value="recurring">Recorrente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Observação</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button data-testid="block-save" onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">Bloquear</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((b) => {
          const start = new Date(b.start), end = new Date(b.end);
          const pro = pros.find((p) => p.id === b.professional_id);
          return (
            <Card key={b.id} className="p-5 border-border" data-testid={`block-${b.id}`}>
              <div className="font-medium">{pro?.name || "—"}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {start.toLocaleDateString("pt-BR")} • {start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — {end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{b.kind}{b.reason ? ` • ${b.reason}` : ""}</div>
              <Button size="sm" variant="ghost" onClick={() => del(b.id)} className="mt-3 text-destructive hover:text-destructive">Remover</Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
