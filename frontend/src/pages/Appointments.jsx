import React, { useEffect, useState } from "react";
import { api, STATUS_META, brl, fmtErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle } from "lucide-react";
import { WhatsAppNotifyDialog } from "@/components/WhatsAppNotify";
import { QuickBooking, QuickBadge } from "@/components/QuickBooking";
import { toast } from "sonner";

export default function Appointments() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [notify, setNotify] = useState(null); // { id, title }
  const [cancellation, setCancellation] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");

  const load = () => api.get("/appointments").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const openNotify = (id, title) => setNotify({ id, title });

  const setStatus = async (id, status, reason = null) => {
    try {
      await api.post(`/appointments/${id}/status`, { status, ...(reason ? { cancellation_reason: reason } : {}) }); toast.success("Atualizado"); load();
      if (["confirmed", "refused", "cancelled"].includes(status)) openNotify(id, status === "confirmed" ? "Agendamento confirmado ✨" : "Avisar a cliente");
    }
    catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro"); }
  };
  const requestCancellation = (appointment) => {
    setCancellation(appointment);
    setCancellationReason("");
  };
  const confirmCancellation = async () => {
    const reason = cancellationReason.trim();
    if (!reason) { toast.error("Informe o motivo do cancelamento"); return; }
    const id = cancellation.id;
    setCancellation(null);
    await setStatus(id, "cancelled", reason);
  };
  const markSignal = async (id) => {
    try { await api.post(`/appointments/${id}/mark-signal-paid`); toast.success("Sinal marcado como pago"); load(); }
    catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro"); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div><div className="text-xs tracking-[0.4em] text-primary uppercase">Reservas</div><h1 className="font-display text-4xl sm:text-5xl mt-2">Agendamentos</h1></div>
        {user.role !== "client" && <QuickBooking onCreated={(a) => { load(); openNotify(a.id, "Encaixe confirmado ⚡"); }} />}
      </div>
      <div className="space-y-4">
        {list.length === 0 && <Card className="p-10 border-dashed text-center text-muted-foreground">Nenhum agendamento.</Card>}
        {list.map((a) => {
          const meta = STATUS_META[a.status] || STATUS_META.waiting;
          return (
            <Card key={a.id} className="p-6 border-border" data-testid={`appt-${a.id}`}>
              <div className="flex justify-between flex-wrap gap-4">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Cliente</div>
                  <div className="font-display text-2xl flex items-center gap-2 flex-wrap">{a.client_name}{a.quick && <QuickBadge />}</div>
                </div>
                <span className="self-start text-xs px-3 py-1 rounded-full" style={{ background: `${meta.color}22`, color: meta.color }}>{meta.label}</span>
              </div>
              <div className="mt-4 space-y-2">
                {a.items.map((it) => (
                  <div key={it.id} className="flex justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{it.service_name}</div>
                      <div className="text-muted-foreground text-xs">com {it.professional_name} • {new Date(it.start).toLocaleString("pt-BR")}</div>
                    </div>
                    <div>{brl(it.price)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between items-center flex-wrap gap-3">
                <div className="text-sm">
                  <div>Total: <span className="font-medium text-foreground">{brl(a.total)}</span> {a.discount > 0 && <span className="text-primary">(cupom -{brl(a.discount)})</span>}</div>
                  {a.signal_percent > 0 && <div className="text-muted-foreground">Sinal ({a.signal_percent}%): {brl(a.signal_value)} {a.signal_paid && <span className="text-primary">• pago</span>}</div>}
                  {a.status === "cancelled" && a.cancellation_reason && <div className="text-destructive mt-1">Motivo: {a.cancellation_reason}</div>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {user.role !== "client" && a.signal_percent > 0 && !a.signal_paid && a.status === "waiting" && (
                    <Button size="sm" variant="outline" onClick={() => markSignal(a.id)} data-testid={`signal-${a.id}`}>Marcar sinal pago</Button>
                  )}
                  {user.role !== "client" && ["waiting","signal_paid","signal_pending"].includes(a.status) && (
                    <Button size="sm" onClick={() => setStatus(a.id, "confirmed")} data-testid={`confirm-${a.id}`} className="bg-primary text-primary-foreground hover:bg-primary/90">Confirmar</Button>
                  )}
                  {user.role !== "client" && a.status !== "completed" && a.status !== "cancelled" && a.status !== "refused" && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "refused")} className="text-destructive">Recusar</Button>
                  )}
                  {user.role !== "client" && a.status === "confirmed" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(a.id, "completed")}>Concluir</Button>
                  )}
                  {user.role === "client" && ["waiting","confirmed","signal_paid"].includes(a.status) && (
                    <Button size="sm" variant="ghost" onClick={() => requestCancellation(a)} className="text-destructive">Cancelar</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openNotify(a.id, "Avisar pelo WhatsApp")} data-testid={`wa-${a.id}`} className="border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#25D366]"><MessageCircle size={14} className="mr-1" />WhatsApp</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <Dialog open={Boolean(cancellation)} onOpenChange={(open) => !open && setCancellation(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Motivo do cancelamento</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Informe o motivo para registrar no relatório do Studio.</p>
          <Textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} placeholder="Ex.: cliente solicitou cancelamento..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancellation(null)}>Voltar</Button>
            <Button variant="destructive" onClick={confirmCancellation}>Confirmar cancelamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <WhatsAppNotifyDialog appointmentId={notify?.id} title={notify?.title} onClose={() => setNotify(null)} />
    </div>
  );
}
