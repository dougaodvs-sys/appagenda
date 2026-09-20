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

const empty = { code: "", discount_percent: 10, scope: "studio", professional_id: "", service_ids: [], min_value: 0, active: true };

export default function Coupons() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [pros, setPros] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = () => Promise.all([
    api.get("/coupons").then((r) => setList(r.data)),
    api.get("/professionals").then((r) => setPros(r.data)).catch(() => setPros([])),
  ]);
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { ...form };
      if (payload.scope === "studio") payload.professional_id = null;
      if (!payload.professional_id) delete payload.professional_id;
      await api.post("/coupons", payload);
      toast.success("Cupom criado"); setOpen(false); setForm(empty); load();
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro"); }
  };
  const del = async (id) => { if (window.confirm("Remover?")) { await api.delete(`/coupons/${id}`); load(); } };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div><div className="text-xs tracking-[0.4em] text-primary uppercase">Descontos</div><h1 className="font-display text-4xl sm:text-5xl mt-2">Cupons</h1></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-coupon-btn" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">+ Novo cupom</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo cupom</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Código</Label><Input data-testid="coupon-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
              <div><Label>% Desconto</Label><Input data-testid="coupon-pct" type="number" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: parseInt(e.target.value || "0") })} /></div>
              {user.role === "manager" && (
                <div className="col-span-2">
                  <Label>Escopo</Label>
                  <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                    <SelectTrigger data-testid="coupon-scope"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="studio">Studio (todos profissionais)</SelectItem>
                      <SelectItem value="professional">Profissional específico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.scope === "professional" && user.role === "manager" && (
                <div className="col-span-2">
                  <Label>Profissional</Label>
                  <Select value={form.professional_id} onValueChange={(v) => setForm({ ...form, professional_id: v })}>
                    <SelectTrigger data-testid="coupon-pro"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{pros.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Valor mínimo</Label><Input type="number" value={form.min_value} onChange={(e) => setForm({ ...form, min_value: parseFloat(e.target.value || "0") })} /></div>
            </div>
            <DialogFooter><Button data-testid="coupon-save" onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((c) => (
          <Card key={c.id} className="p-5 border-border" data-testid={`coupon-${c.id}`}>
            <div className="flex justify-between items-center">
              <div className="font-display text-2xl text-primary">{c.code}</div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground uppercase tracking-wider">{c.scope}</span>
            </div>
            <div className="text-sm mt-2">{c.discount_percent}% de desconto</div>
            {c.professional_id && <div className="text-xs text-muted-foreground">Profissional: {pros.find((p) => p.id === c.professional_id)?.name || "—"}</div>}
            {c.min_value > 0 && <div className="text-xs text-muted-foreground">Mín: R$ {c.min_value}</div>}
            <div className="text-xs text-muted-foreground">Usos: {c.uses || 0}</div>
            <Button size="sm" variant="ghost" onClick={() => del(c.id)} className="mt-3 text-destructive hover:text-destructive">Remover</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
