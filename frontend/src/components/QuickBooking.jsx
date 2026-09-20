import React, { useEffect, useMemo, useState } from "react";
import { api, brl, fmtErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap } from "lucide-react";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);

export function QuickBooking({ onCreated }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [pros, setPros] = useState([]);
  const [form, setForm] = useState({ client_name: "", client_phone: "", service_id: "", professional_id: "", day: today() });
  const [slots, setSlots] = useState([]);
  const [manual, setManual] = useState(false);
  const [time, setTime] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/services").then((r) => setServices(r.data.filter((s) => s.active !== false)));
    api.get("/professionals").then((r) => setPros(r.data.filter((p) => p.active !== false)));
  }, [open]);

  const eligiblePros = useMemo(() => {
    const list = pros.filter((p) => !form.service_id || (p.service_ids || []).includes(form.service_id));
    return user.role === "professional" ? list.filter((p) => p.id === user.id) : list;
  }, [pros, form.service_id, user]);

  useEffect(() => {
    if (!form.service_id || !form.professional_id || !form.day) { setSlots([]); return; }
    api.get("/availability", { params: { professional_id: form.professional_id, service_id: form.service_id, day: form.day } })
      .then((r) => setSlots(r.data.slots)).catch(() => setSlots([]));
  }, [form.service_id, form.professional_id, form.day]);

  const reset = () => { setForm({ client_name: "", client_phone: "", service_id: "", professional_id: "", day: today() }); setManual(false); setTime(""); setForce(false); };

  const submit = async (startIso) => {
    if (!form.client_name.trim()) { toast.error("Informe o nome da cliente"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/appointments", {
        client_name: form.client_name.trim(), client_phone: form.client_phone,
        items: [{ professional_id: form.professional_id, service_id: form.service_id, start: startIso }],
        quick: true, force: manual && force,
      });
      toast.success("Encaixe confirmado"); setOpen(false); reset(); onCreated?.(data);
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro ao encaixar"); }
    finally { setBusy(false); }
  };

  const submitManual = () => {
    if (!time) { toast.error("Informe o horário"); return; }
    submit(new Date(`${form.day}T${time}:00`).toISOString());
  };

  const ready = form.service_id && form.professional_id && form.day;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button data-testid="quick-booking-btn" variant="outline" className="rounded-full border-primary/50 text-primary hover:bg-primary/10"><Zap size={14} className="mr-2" />Encaixe rápido</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Encaixe rápido</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Sem cadastro da cliente. Só o nome é obrigatório. O horário já entra como confirmado.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Nome *</Label><Input data-testid="qb-name" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
          <div><Label>WhatsApp</Label><Input data-testid="qb-phone" placeholder="opcional" value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} /></div>
          <div>
            <Label>Serviço</Label>
            <Select value={form.service_id} onValueChange={(v) => setForm({ ...form, service_id: v, professional_id: "" })}>
              <SelectTrigger data-testid="qb-service"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — {brl(s.price)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Profissional</Label>
            <Select value={form.professional_id} onValueChange={(v) => setForm({ ...form, professional_id: v })} disabled={!form.service_id}>
              <SelectTrigger data-testid="qb-pro"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{eligiblePros.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Data</Label><Input data-testid="qb-day" type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} /></div>
          <div className="flex items-end gap-2 pb-2">
            <Switch data-testid="qb-manual" checked={manual} onCheckedChange={setManual} />
            <span className="text-sm">Digitar horário</span>
          </div>
        </div>

        {ready && !manual && (
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Horários livres — clique para encaixar</div>
            {slots.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum horário livre. Use "Digitar horário" para forçar.</div> : (
              <div className="grid grid-cols-5 gap-2 max-h-40 overflow-auto">
                {slots.map((iso) => (
                  <button key={iso} data-testid={`qb-slot-${iso}`} disabled={busy} onClick={() => submit(iso)}
                    className="px-2 py-1.5 rounded-md border border-border text-sm hover:border-primary hover:text-primary transition-colors">
                    {new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {ready && manual && (
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <div><Label>Horário</Label><Input data-testid="qb-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-36" /></div>
              <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
                <Switch data-testid="qb-force" checked={force} onCheckedChange={setForce} />
                Forçar mesmo com conflito
              </label>
            </div>
            {force && <p className="text-xs text-amber-400">Atenção: o horário será criado por cima de bloqueios/agenda existente.</p>}
            <DialogFooter>
              <Button data-testid="qb-submit" disabled={busy} onClick={submitManual} className="bg-primary text-primary-foreground hover:bg-primary/90">Confirmar encaixe</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
