import React, { useEffect, useMemo, useState } from "react";
import { api, brl, fmtErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap } from "lucide-react";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { client_id: "", client_name: "", client_phone: "", service_id: "", professional_id: "", day: today() };

export function QuickBooking({ onCreated }) {
  const { user } = useAuth();
  const isPro = user.role === "professional";
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [pros, setPros] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientMode, setClientMode] = useState("registered");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ ...EMPTY, professional_id: isPro ? user.id : "" });
  const [slots, setSlots] = useState([]);
  const [manual, setManual] = useState(false);
  const [time, setTime] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/services").then((r) => setServices(r.data.filter((s) => s.active !== false)));
    api.get("/professionals").then((r) => setPros(r.data.filter((p) => p.active !== false)));
    api.get("/clients", { params: isPro ? { scope: "all" } : {} }).then((r) => setClients(r.data)).catch(() => setClients([]));
  }, [open, isPro]);

  const eligiblePros = useMemo(() => {
    const list = pros.filter((p) => !form.service_id || (p.service_ids || []).includes(form.service_id));
    return isPro ? list.filter((p) => p.id === user.id) : list;
  }, [pros, form.service_id, isPro, user.id]);

  const myServices = useMemo(() => {
    if (!isPro) return services;
    const me = pros.find((p) => p.id === user.id);
    return me ? services.filter((s) => (me.service_ids || []).includes(s.id)) : services;
  }, [services, pros, isPro, user.id]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q));
  }, [clients, search]);

  useEffect(() => {
    if (!form.service_id || !form.professional_id || !form.day) { setSlots([]); return; }
    api.get("/availability", { params: { professional_id: form.professional_id, service_id: form.service_id, day: form.day } })
      .then((r) => setSlots(r.data.slots)).catch(() => setSlots([]));
  }, [form.service_id, form.professional_id, form.day]);

  const reset = () => { setForm({ ...EMPTY, professional_id: isPro ? user.id : "" }); setManual(false); setTime(""); setForce(false); setSearch(""); setClientMode("registered"); };

  const submit = async (startIso) => {
    if (clientMode === "registered" && !form.client_id) { toast.error("Selecione a cliente"); return; }
    if (clientMode === "new" && !form.client_name.trim()) { toast.error("Informe o nome da cliente"); return; }
    setBusy(true);
    try {
      const payload = {
        items: [{ professional_id: form.professional_id, service_id: form.service_id, start: startIso }],
        quick: true, force: manual && force,
      };
      if (clientMode === "registered") payload.client_id = form.client_id;
      else { payload.client_name = form.client_name.trim(); payload.client_phone = form.client_phone; }
      const { data } = await api.post("/appointments", payload);
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Encaixe rápido</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Escolha a cliente, o serviço e o horário. O encaixe já entra como confirmado e pode ficar fora do horário normal de funcionamento.</p>

        <Tabs value={clientMode} onValueChange={(v) => { setClientMode(v); setForm({ ...form, client_id: "", client_name: "", client_phone: "" }); }}>
          <TabsList className="flex w-full">
            <TabsTrigger value="registered" className="flex-1" data-testid="qb-tab-registered">Cliente cadastrada</TabsTrigger>
            <TabsTrigger value="new" className="flex-1" data-testid="qb-tab-new">Sem cadastro</TabsTrigger>
          </TabsList>
        </Tabs>

        {clientMode === "registered" ? (
          <div className="space-y-2">
            <Input data-testid="qb-client-search" placeholder="Buscar por nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
              <SelectTrigger data-testid="qb-client"><SelectValue placeholder={clients.length ? "Selecione a cliente" : "Nenhuma cliente cadastrada"} /></SelectTrigger>
              <SelectContent className="max-h-60">
                {filteredClients.map((c) => <SelectItem key={c.id} value={c.id} data-testid={`qb-client-opt-${c.id}`}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Nome *</Label><Input data-testid="qb-name" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
            <div><Label>WhatsApp</Label><Input data-testid="qb-phone" placeholder="opcional" value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} /></div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Serviço</Label>
            <Select value={form.service_id} onValueChange={(v) => setForm({ ...form, service_id: v, professional_id: isPro ? user.id : "" })}>
              <SelectTrigger data-testid="qb-service"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{myServices.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — {brl(s.price)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!isPro && (
            <div>
              <Label>Profissional</Label>
              <Select value={form.professional_id} onValueChange={(v) => setForm({ ...form, professional_id: v })} disabled={!form.service_id}>
                <SelectTrigger data-testid="qb-pro"><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>{eligiblePros.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Data</Label><Input data-testid="qb-day" type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} /></div>
          <div className="flex items-end gap-2 pb-2">
            <Switch data-testid="qb-manual" checked={manual} onCheckedChange={setManual} />
            <span className="text-sm">Digitar horário livremente</span>
          </div>
        </div>

        {ready && !manual && (
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Horários livres — clique para encaixar</div>
            {slots.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum horário livre. Use "Digitar horário livremente" para escolher qualquer hora.</div> : (
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
            <div className="flex items-end gap-3 flex-wrap">
              <div><Label>Horário</Label><Input data-testid="qb-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-36" /></div>
              <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
                <Switch data-testid="qb-force" checked={force} onCheckedChange={setForce} />
                Forçar mesmo com conflito
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Horários fora do funcionamento do studio são permitidos no encaixe.</p>
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

export const QuickBadge = ({ className = "" }) => (
  <span data-testid="quick-badge" className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 ${className}`}>
    <Zap size={11} /> Encaixe
  </span>
);
