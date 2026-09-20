import React, { useEffect, useState } from "react";
import { api, brl } from "@/lib/api";
import { Card } from "@/components/ui/card";

function Kpi({ label, value, hint, testid }) {
  return (
    <Card className="p-6 bg-card border-border" data-testid={testid}>
      <div className="text-xs tracking-widest uppercase text-muted-foreground">{label}</div>
      <div className="font-display text-4xl mt-2">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-2">{hint}</div>}
    </Card>
  );
}

export default function ManagerDashboard() {
  const [k, setK] = useState(null);
  useEffect(() => { api.get("/dashboard").then((r) => setK(r.data)); }, []);
  if (!k) return <div className="text-muted-foreground">Carregando…</div>;
  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs tracking-[0.4em] text-primary uppercase">Painel</div>
        <h1 className="font-display text-4xl sm:text-5xl mt-2">Visão geral</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <Kpi testid="kpi-today" label="Hoje" value={k.today} hint="agendamentos ativos" />
        <Kpi testid="kpi-week" label="Semana" value={k.week} />
        <Kpi testid="kpi-month" label="Mês" value={k.month} />
        <Kpi testid="kpi-clients" label="Clientes" value={k.total_clients} />
        <Kpi testid="kpi-confirmed" label="Confirmados" value={k.confirmed} />
        <Kpi testid="kpi-waiting" label="Aguardando" value={k.waiting} />
        <Kpi testid="kpi-cancelled" label="Cancelados/recusados" value={k.cancelled} />
        <Kpi testid="kpi-coupons" label="Cupons usados" value={k.coupons_used} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi testid="kpi-scheduled" label="Total agendado" value={brl(k.total_scheduled)} />
        <Kpi testid="kpi-signals" label="Sinais recebidos" value={brl(k.signals_received)} />
        <Kpi testid="kpi-remaining" label="Restante a receber" value={brl(k.remaining)} />
      </div>
    </div>
  );
}
