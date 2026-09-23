import React, { useEffect, useMemo, useState } from "react";
import { api, STATUS_META, brl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuickBooking, QuickBadge } from "@/components/QuickBooking";
import { WhatsAppNotifyDialog } from "@/components/WhatsAppNotify";

export default function Agenda() {
  const { user } = useAuth();
  const [notifyId, setNotifyId] = useState(null);
  const [appts, setAppts] = useState([]);
  const [pros, setPros] = useState([]);
  const [proFilter, setProFilter] = useState("all");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));

  const load = () => api.get("/appointments").then((r) => setAppts(r.data));
  useEffect(() => {
    load();
    api.get("/professionals").then((r) => setPros(r.data));
  }, []);

  const items = useMemo(() => {
    const rows = [];
    appts.forEach((a) => {
      a.items.forEach((it) => {
        const st = new Date(it.start);
        if (st.toISOString().slice(0, 10) !== day) return;
        if (user.role === "professional" && it.professional_id !== user.id) return;
        if (proFilter !== "all" && it.professional_id !== proFilter) return;
        rows.push({ ...it, appt: a });
      });
    });
    return rows.sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [appts, day, proFilter, user]);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[0.4em] text-primary uppercase">Agenda</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-2">Do dia</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <QuickBooking onCreated={(a) => { load(); const d = a?.items?.[0]?.start; if (d) setDay(new Date(d).toISOString().slice(0, 10)); setNotifyId(a?.id || null); }} />
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} data-testid="agenda-day"
                 className="bg-secondary border border-border rounded-md px-3 h-10 text-sm w-full sm:w-auto" />
          {user.role === "manager" && (
            <Select value={proFilter} onValueChange={setProFilter}>
              <SelectTrigger className="w-full sm:w-56" data-testid="agenda-pro-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos profissionais</SelectItem>
                {pros.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {items.length === 0 && (
          <Card className="p-10 border-dashed border-border text-muted-foreground text-center">Sem agendamentos neste dia.</Card>
        )}
        {items.map((it) => {
          const meta = STATUS_META[it.appt.status] || STATUS_META.waiting;
          const time = new Date(it.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          return (
            <Card key={it.id} className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 ${it.appt.quick ? "border-amber-500/40 border-l-4 border-l-amber-400" : "border-border"}`} data-testid={`agenda-item-${it.id}`}>
              <div className="font-display text-2xl sm:text-3xl sm:min-w-24">{time}</div>
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2 flex-wrap">{it.service_name} — {it.professional_name}{it.appt.quick && <QuickBadge />}</div>
                <div className="text-sm text-muted-foreground">Cliente: {it.appt.client_name} • {it.duration_min} min</div>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-sm">{brl(it.price)}</div>
                <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full" style={{ background: `${meta.color}22`, color: meta.color }}>
                  {meta.label}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
      <WhatsAppNotifyDialog appointmentId={notifyId} title="Encaixe confirmado ⚡" description="Avise a cliente e o profissional pelos números cadastrados." onClose={() => setNotifyId(null)} />
    </div>
  );
}
