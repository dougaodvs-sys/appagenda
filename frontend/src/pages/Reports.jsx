import React, { useEffect, useMemo, useState } from "react";
import { api, brl, fmtErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const STATUS_LABELS = [
  ["completed", "Concluídos"],
  ["open", "Em aberto"],
  ["cancelled", "Cancelados"],
  ["quick", "Encaixes"],
];

function Kpi({ label, value, hint }) {
  return <Card className="p-5 border-border"><div className="text-xs tracking-widest uppercase text-muted-foreground">{label}</div><div className="font-display text-3xl mt-2">{value}</div>{hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}</Card>;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function Reports() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth().split("-")[1]);
  const [year, setYear] = useState(currentMonth().split("-")[0]);
  const [day, setDay] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [professionals, setProfessionals] = useState([]);
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (user.role === "manager") api.get("/professionals").then((response) => setProfessionals(response.data)).catch(() => {});
  }, [user.role]);
  useEffect(() => {
    api.get("/reports/monthly", { params: { year, month_number: month, ...(day ? { day } : {}), ...(professionalId ? { professional_id: professionalId } : {}) } })
      .then((response) => setReport(response.data))
      .catch((error) => toast.error(fmtErr(error.response?.data?.detail) || "Não foi possível carregar o relatório"));
  }, [year, month, day, professionalId]);

  const title = user.role === "manager" ? "Relatório do Studio" : "Meu relatório";
  const selectedName = useMemo(() => professionals.find((pro) => pro.id === professionalId)?.name, [professionals, professionalId]);
  const reportProfessionals = Array.isArray(report?.professionals) ? report.professionals : [];
  const cancellations = Array.isArray(report?.cancellations) ? report.cancellations : [];
  const statuses = report?.statuses || {};

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs tracking-[0.4em] text-primary uppercase">Financeiro e agenda</div>
        <h1 className="font-display text-4xl sm:text-5xl mt-2">{title}</h1>
        <p className="text-muted-foreground mt-2">Valores cancelados não entram no faturamento. Cupons aparecem separados para mostrar bruto, desconto e líquido.</p>
      </div>
      <div className="flex items-end gap-4 flex-wrap">
        <div><Label htmlFor="report-year">Ano</Label><Input id="report-year" type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} /></div>
        <div><Label htmlFor="report-month">Mês</Label><select id="report-month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-sm"><option value="1">Janeiro</option><option value="2">Fevereiro</option><option value="3">Março</option><option value="4">Abril</option><option value="5">Maio</option><option value="6">Junho</option><option value="7">Julho</option><option value="8">Agosto</option><option value="9">Setembro</option><option value="10">Outubro</option><option value="11">Novembro</option><option value="12">Dezembro</option></select></div>
        <div><Label htmlFor="report-day">Dia (opcional)</Label><Input id="report-day" type="number" min="1" max="31" placeholder="Todos" value={day} onChange={(event) => setDay(event.target.value)} /></div>
        {user.role === "manager" && <div><Label htmlFor="report-professional">Profissional ativa</Label><select id="report-professional" value={professionalId} onChange={(event) => setProfessionalId(event.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-sm min-w-52"><option value="">Todas as profissionais ativas</option>{professionals.filter((pro) => pro.active !== false).map((pro) => <option key={pro.id} value={pro.id}>{pro.name}</option>)}</select></div>}
      </div>
      {report && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUS_LABELS.map(([key, label]) => <Kpi key={key} label={label} value={statuses[key] || 0} />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Kpi label="Faturamento bruto" value={brl(report.gross)} hint="Antes dos descontos" />
          <Kpi label="Descontos em cupons" value={brl(report.discount)} hint="Cupons aplicados" />
          <Kpi label="Faturamento líquido" value={brl(report.net)} hint="Bruto menos descontos" />
        </div>
        {user.role === "manager" && !professionalId && <Card className="p-5 border-border overflow-x-auto">
          <h2 className="font-display text-2xl mb-4">Faturamento por profissional</h2>
          <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Profissional</th><th className="py-2">Agendamentos</th><th className="py-2">Bruto</th><th className="py-2">Descontos</th><th className="py-2">Líquido</th></tr></thead><tbody>{reportProfessionals.map((pro) => <tr key={pro.professional_id} className="border-b border-border/50"><td className="py-3">{pro.professional_name}</td><td className="py-3">{pro.appointments}</td><td className="py-3">{brl(pro.gross)}</td><td className="py-3">{brl(pro.discount)}</td><td className="py-3 font-medium">{brl(pro.net)}</td></tr>)}</tbody></table>
          {reportProfessionals.length === 0 && <p className="text-sm text-muted-foreground pt-3">Nenhum faturamento no período.</p>}
        </Card>}
        <Card className="p-5 border-border overflow-x-auto">
          <h2 className="font-display text-2xl mb-4">Relatório de cancelamentos</h2>
          <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Cliente</th><th className="py-2">Data</th><th className="py-2">Motivo</th><th className="py-2">Quem cancelou</th><th className="py-2">Bruto</th><th className="py-2">Desconto</th><th className="py-2">Líquido</th></tr></thead><tbody>{cancellations.map((item) => <tr key={item.appointment_id} className="border-b border-border/50"><td className="py-3">{item.client_name}</td><td className="py-3">{item.cancelled_at ? new Date(item.cancelled_at).toLocaleString("pt-BR") : "-"}</td><td className="py-3 min-w-48">{item.reason}</td><td className="py-3">{item.cancelled_by}</td><td className="py-3">{brl(item.gross)}</td><td className="py-3">{brl(item.discount)}</td><td className="py-3">{brl(item.net)}</td></tr>)}</tbody></table>
          {cancellations.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cancelamento no período.</p>}
        </Card>
        {selectedName && <p className="text-sm text-muted-foreground">Filtro aplicado: {selectedName}</p>}
      </>}
    </div>
  );
}
