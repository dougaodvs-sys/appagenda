import React, { useEffect, useState } from "react";
import { api, DOW, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const emptyForm = {
  name: "", email: "", password: "", phone: "", specialty: "", photo_url: "",
  service_ids: [], can_create_coupons: false, signal_percent: 30, active: true,
  working_hours: DOW.reduce((acc, d) => ({ ...acc, [d.key]: { open: "09:00", close: "18:00", closed: d.key === "sun" } }), {}),
};

export default function Professionals() {
  const [list, setList] = useState([]);
  const [services, setServices] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);

  const load = () => Promise.all([
    api.get("/professionals").then((r) => setList(r.data)),
    api.get("/services").then((r) => setServices(r.data)),
  ]);
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    const wh = DOW.reduce((acc, d) => ({ ...acc, [d.key]: p.working_hours?.[d.key] || { open: "09:00", close: "18:00", closed: true } }), {});
    setForm({ ...emptyForm, ...p, password: "", working_hours: wh });
    setOpen(true);
  };

  const save = async () => {
    if ((form.phone || "").replace(/\D/g, "").length < 8) { toast.error("Informe o telefone/WhatsApp do profissional"); return; }
    try {
      if (editing) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        delete payload.email;
        await api.put(`/professionals/${editing.id}`, payload);
        toast.success("Profissional atualizada");
      } else {
        await api.post("/professionals", form);
        toast.success("Profissional cadastrada");
      }
      setOpen(false); await load();
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro ao salvar"); }
  };

  const del = async (id) => {
    if (!window.confirm("Remover profissional?")) return;
    await api.delete(`/professionals/${id}`); toast.success("Removida"); load();
  };

  const toggleService = (sid) => {
    const has = form.service_ids.includes(sid);
    setForm({ ...form, service_ids: has ? form.service_ids.filter((x) => x !== sid) : [...form.service_ids, sid] });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[0.4em] text-primary uppercase">Equipe</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-2">Profissionais</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} data-testid="new-pro-btn" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
              + Nova profissional
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Cadastrar"} profissional</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Nome</Label><Input data-testid="pro-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Especialidade</Label><Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></div>
              <div><Label>E-mail (login)</Label><Input data-testid="pro-email" type="email" value={form.email} disabled={!!editing} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Telefone / WhatsApp *</Label><Input data-testid="pro-phone" required placeholder="(11) 99999-9999" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>{editing ? "Nova senha (opcional)" : "Senha inicial"}</Label><Input data-testid="pro-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div><Label>Foto (URL)</Label><Input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} /></div>
              <div><Label>% Sinal</Label><Input type="number" value={form.signal_percent} onChange={(e) => setForm({ ...form, signal_percent: parseInt(e.target.value || "0") })} /></div>
              <div className="flex items-center gap-3"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Ativa</Label></div>
              <div className="flex items-center gap-3 col-span-2">
                <Switch data-testid="pro-can-coupons" checked={form.can_create_coupons} onCheckedChange={(v) => setForm({ ...form, can_create_coupons: v })} />
                <Label>Permitir criar cupons próprios</Label>
              </div>
              <div className="col-span-2">
                <Label className="mb-2 block">Serviços realizados</Label>
                <div className="grid grid-cols-2 gap-2">
                  {services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={form.service_ids.includes(s.id)} onCheckedChange={() => toggleService(s.id)} />
                      {s.name}
                    </label>
                  ))}
                  {services.length === 0 && <div className="text-xs text-muted-foreground">Cadastre serviços primeiro.</div>}
                </div>
              </div>
              <div className="col-span-2">
                <Label className="mb-2 block">Horários de trabalho</Label>
                <div className="space-y-1">
                  {DOW.map((d) => {
                    const wh = form.working_hours[d.key];
                    return (
                      <div key={d.key} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="w-20">{d.label}</span>
                        <Switch checked={!wh.closed} onCheckedChange={(v) => setForm({ ...form, working_hours: { ...form.working_hours, [d.key]: { ...wh, closed: !v } } })} />
                        <div className="flex items-center gap-2 basis-full sm:basis-auto sm:ml-1">
                          <Input type="time" className="w-28 min-w-0" value={wh.open} disabled={wh.closed} onChange={(e) => setForm({ ...form, working_hours: { ...form.working_hours, [d.key]: { ...wh, open: e.target.value } } })} />
                          <span>—</span>
                          <Input type="time" className="w-28 min-w-0" value={wh.close} disabled={wh.closed} onChange={(e) => setForm({ ...form, working_hours: { ...form.working_hours, [d.key]: { ...wh, close: e.target.value } } })} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button data-testid="pro-save" onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((p) => (
          <Card key={p.id} className="p-5 border-border" data-testid={`pro-card-${p.id}`}>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-secondary overflow-hidden flex items-center justify-center text-primary font-display text-xl">
                {p.photo_url ? <img alt="" src={p.photo_url} className="w-full h-full object-cover" /> : p.name?.[0]}
              </div>
              <div className="flex-1">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.specialty || "—"}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${p.active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>{p.active ? "Ativa" : "Inativa"}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openEdit(p)} data-testid={`edit-pro-${p.id}`}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => del(p.id)} className="text-destructive hover:text-destructive">Remover</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
