import React, { useState } from "react";
import { api, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarClock, XCircle } from "lucide-react";
import { toast } from "sonner";

const pad = (n) => String(n).padStart(2, "0");
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function AgendaItemActions({ item, onChanged, onNotify }) {
  const [mode, setMode] = useState(null); // "move" | "cancel"
  const start = new Date(item.start);
  const [day, setDay] = useState(localDay(start));
  const [time, setTime] = useState(localTime(start));
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState(item.appt.quick ? "Encaixe cancelado pela equipe" : "Cancelado pela equipe");
  const [busy, setBusy] = useState(false);

  const move = async () => {
    if (!day || !time) { toast.error("Informe data e horário"); return; }
    setBusy(true);
    try {
      await api.post(`/appointments/${item.appt.id}/reschedule`, { item_id: item.id, start: new Date(`${day}T${time}:00`).toISOString(), force });
      toast.success("Horário movido");
      setMode(null); onChanged?.(day); onNotify?.(item.appt.id, "Horário alterado — avise a cliente");
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Não foi possível mover"); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!reason.trim()) { toast.error("Informe o motivo"); return; }
    setBusy(true);
    try {
      await api.post(`/appointments/${item.appt.id}/status`, { status: "cancelled", cancellation_reason: reason.trim() });
      toast.success("Encaixe cancelado");
      setMode(null); onChanged?.(); onNotify?.(item.appt.id, "Cancelado — avise a cliente");
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Não foi possível cancelar"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setMode("move")} data-testid={`agenda-move-${item.id}`}>
          <CalendarClock size={14} className="mr-1.5" />Mover
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full text-rose-400 hover:text-rose-300 hover:bg-rose-500/10" onClick={() => setMode("cancel")} data-testid={`agenda-cancel-${item.id}`}>
          <XCircle size={14} className="mr-1.5" />Cancelar
        </Button>
      </div>

      <Dialog open={mode === "move"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-sm" data-testid="move-dialog">
          <DialogHeader><DialogTitle>Mover horário</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">{item.service_name} · {item.appt.client_name}</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data</Label><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} data-testid="move-day" /></div>
            <div><Label>Horário</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="move-time" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch checked={force} onCheckedChange={setForce} data-testid="move-force" /> Forçar mesmo com conflito
          </label>
          {item.appt.quick && <p className="text-xs text-muted-foreground">Encaixes podem ficar fora do horário de funcionamento.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Voltar</Button>
            <Button onClick={move} disabled={busy} data-testid="move-submit" className="bg-primary text-primary-foreground hover:bg-primary/90">{busy ? "Movendo…" : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "cancel"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-sm" data-testid="cancel-dialog">
          <DialogHeader><DialogTitle>Cancelar {item.appt.quick ? "encaixe" : "horário"}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">{item.service_name} · {item.appt.client_name} · {start.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
          <div><Label>Motivo</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} data-testid="cancel-reason" rows={2} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Voltar</Button>
            <Button variant="destructive" onClick={cancel} disabled={busy} data-testid="cancel-submit">{busy ? "Cancelando…" : "Cancelar horário"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
