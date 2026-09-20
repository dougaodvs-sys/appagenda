import React, { useCallback, useEffect, useState } from "react";
import { api, fmtErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

function ManualReferral({ clients, onDone }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ referrer_id: "", referred_id: "" });
  const save = async () => {
    try {
      const { data } = await api.post("/referrals/manual", form);
      toast.success(`Cupom ${data.code} gerado para quem indicou`); setOpen(false); setForm({ referrer_id: "", referred_id: "" }); onDone();
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro"); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="manual-referral-btn" variant="outline" className="rounded-full">Registrar indicação</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar indicação manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Cliente que indicou</Label>
            <Select value={form.referrer_id} onValueChange={(v) => setForm({ ...form, referrer_id: v })}>
              <SelectTrigger data-testid="ref-referrer"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amiga nova (indicada)</Label>
            <Select value={form.referred_id} onValueChange={(v) => setForm({ ...form, referred_id: v })}>
              <SelectTrigger data-testid="ref-referred"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{clients.filter((c) => c.id !== form.referrer_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">O cupom pessoal é gerado imediatamente para quem indicou.</p>
        </div>
        <DialogFooter><Button data-testid="ref-save" disabled={!form.referrer_id || !form.referred_id} onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">Gerar cupom</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Clients() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const load = useCallback(() => {
    api.get("/clients").then((r) => setList(r.data));
    if (user.role === "manager") api.get("/referrals").then((r) => setReferrals(r.data)).catch(() => {});
  }, [user.role]);

  useEffect(() => { load(); }, [load]);
  const refOf = (cid) => referrals.find((r) => r.id === cid);
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div><div className="text-xs tracking-[0.4em] text-primary uppercase">Base</div><h1 className="font-display text-4xl sm:text-5xl mt-2">Clientes</h1></div>
        {user.role === "manager" && <ManualReferral clients={list} onDone={load} />}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((c) => {
          const r = refOf(c.id);
          return (
            <Card key={c.id} className="p-5 border-border" data-testid={`client-${c.id}`}>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground">{c.email}</div>
              {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
              {c.referral_code && <div className="text-xs mt-2 text-primary">Código: {c.referral_code}</div>}
              {r && <div className="text-xs text-muted-foreground mt-1">Indicada por {r.referrer_name} {r.referral_rewarded ? "• cupom liberado" : "• aguardando 1ª visita"}</div>}
            </Card>
          );
        })}
        {list.length === 0 && <div className="text-muted-foreground">Nenhum cliente cadastrado.</div>}
      </div>
    </div>
  );
}
