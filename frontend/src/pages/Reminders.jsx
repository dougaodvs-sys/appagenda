import React, { useEffect, useMemo, useState } from "react";
import { api, fmtErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuickBadge } from "@/components/QuickBooking";
import { MessageCircle, Copy, Check, BellRing } from "lucide-react";
import { toast } from "sonner";

const isoDay = (d) => d.toISOString().slice(0, 10);
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDay(d); };

function ReminderCard({ r }) {
  const [sent, setSent] = useState(false);
  const time = new Date(r.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const copy = () => { navigator.clipboard.writeText(r.text); toast.success("Lembrete copiado"); };
  return (
    <Card data-testid={`reminder-${r.item_id}`} className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 ${sent ? "border-emerald-500/40" : "border-border"}`}>
      <div className="font-display text-2xl sm:text-3xl sm:min-w-20">{time}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium flex items-center gap-2 flex-wrap">
          <span className="truncate">{r.client_name}</span>
          {r.quick && <QuickBadge />}
        </div>
        <div className="text-sm text-muted-foreground truncate">{r.service_name} · {r.professional_name} · {r.duration_min} min</div>
        {r.client_phone ? <div className="text-xs font-mono text-muted-foreground mt-0.5">+{r.client_phone}</div>
          : <div className="text-xs text-destructive mt-0.5" data-testid={`reminder-nophone-${r.item_id}`}>sem WhatsApp cadastrado</div>}
      </div>
      <div className="flex gap-2 flex-wrap sm:justify-end">
        <Button variant="outline" size="sm" onClick={copy} data-testid={`reminder-copy-${r.item_id}`}><Copy size={14} className="mr-1.5" />Copiar</Button>
        {r.client_phone ? (
          <a data-testid={`reminder-wa-${r.item_id}`} href={r.wa_url} target="_blank" rel="noreferrer" onClick={() => setSent(true)}
             className={`inline-flex items-center justify-center text-sm px-4 py-2 rounded-full transition-colors ${sent ? "bg-emerald-500/20 text-emerald-300" : "bg-[#25D366] text-black hover:bg-[#1ebe5b]"}`}>
            {sent ? <Check size={14} className="mr-1.5" /> : <MessageCircle size={14} className="mr-1.5" />}{sent ? "Lembrete enviado" : "Lembrar no WhatsApp"}
          </a>
        ) : <Button size="sm" disabled className="rounded-full"><MessageCircle size={14} className="mr-1.5" />Lembrar no WhatsApp</Button>}
      </div>
    </Card>
  );
}

export default function Reminders() {
  const { user } = useAuth();
  const [day, setDay] = useState(tomorrow());
  const [pros, setPros] = useState([]);
  const [proFilter, setProFilter] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user.role === "manager") api.get("/professionals").then((r) => setPros(r.data)); }, [user.role]);

  useEffect(() => {
    setLoading(true);
    const params = { day };
    if (user.role === "manager" && proFilter !== "all") params.professional_id = proFilter;
    api.get("/appointments/reminders", { params }).then((r) => setData(r.data))
      .catch((e) => toast.error(fmtErr(e.response?.data?.detail) || "Erro ao carregar lembretes"))
      .finally(() => setLoading(false));
  }, [day, proFilter, user.role]);

  const withPhone = useMemo(() => (data?.items || []).filter((r) => r.client_phone).length, [data]);

  return (
    <div className="space-y-8" data-testid="reminders-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[0.4em] text-primary uppercase">Lembretes</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-2">Horários de {data?.label || "amanhã"}</h1>
          <p className="text-muted-foreground mt-2 text-sm">Mensagem pronta para cada cliente. Clique, confira e envie pelo WhatsApp.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="flex gap-2">
            <Button variant={day === isoDay(new Date()) ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => setDay(isoDay(new Date()))} data-testid="reminders-today">Hoje</Button>
            <Button variant={day === tomorrow() ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => setDay(tomorrow())} data-testid="reminders-tomorrow">Amanhã</Button>
          </div>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} data-testid="reminders-day"
                 className="bg-secondary border border-border rounded-md px-3 h-10 text-sm w-full sm:w-auto" />
          {user.role === "manager" && (
            <Select value={proFilter} onValueChange={setProFilter}>
              <SelectTrigger className="w-full sm:w-56" data-testid="reminders-pro-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos profissionais</SelectItem>
                {pros.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {!loading && data && data.items.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="reminders-count">
          <BellRing size={15} className="text-primary" /> {data.items.length} horário(s) · {withPhone} com WhatsApp
        </div>
      )}

      <div className="space-y-3">
        {loading && <div className="text-muted-foreground">Carregando…</div>}
        {!loading && data && data.items.length === 0 && (
          <Card className="p-10 border-dashed border-border text-muted-foreground text-center" data-testid="reminders-empty">Nenhum horário neste dia.</Card>
        )}
        {!loading && data && data.items.map((r) => <ReminderCard key={r.item_id} r={r} />)}
      </div>
    </div>
  );
}
