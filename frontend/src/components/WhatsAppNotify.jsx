import React, { useEffect, useState } from "react";
import { api, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle, Copy, Check, UserRound, Scissors } from "lucide-react";
import { toast } from "sonner";

export async function fetchWhatsApp(appointmentId) {
  const { data } = await api.get(`/appointments/${appointmentId}/whatsapp`, { params: { origin: window.location.origin } });
  return data;
}

function Target({ t }) {
  const [sent, setSent] = useState(false);
  const isClient = t.role === "client";
  const label = isClient ? "Avisar cliente no WhatsApp" : "Avisar profissional no WhatsApp";
  const copy = () => { navigator.clipboard.writeText(t.text); toast.success("Mensagem copiada"); };
  return (
    <div data-testid={`wa-target-${t.role}`} className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {isClient ? <UserRound size={15} className="text-primary" /> : <Scissors size={15} className="text-primary" />}
        <span className="font-medium">{t.name}</span>
        <span className="text-muted-foreground">· {isClient ? "cliente" : "profissional"}</span>
        {t.phone ? <span className="ml-auto font-mono text-xs text-muted-foreground" data-testid={`wa-phone-${t.role}`}>+{t.phone}</span>
          : <span className="ml-auto text-xs text-destructive" data-testid={`wa-nophone-${t.role}`}>sem WhatsApp cadastrado</span>}
      </div>
      <pre data-testid={`wa-text-${t.role}`} className="whitespace-pre-wrap text-xs bg-black/30 border border-border rounded-md p-3 max-h-44 overflow-auto font-sans">{t.text}</pre>
      <div className="flex gap-2 justify-end flex-wrap">
        <Button variant="outline" size="sm" onClick={copy} data-testid={`wa-copy-${t.role}`}><Copy size={14} className="mr-2" />Copiar</Button>
        {t.phone ? (
          <a data-testid={`wa-send-${t.role}`} href={t.wa_url} target="_blank" rel="noreferrer" onClick={() => setSent(true)}
             className={`inline-flex items-center justify-center text-sm px-4 py-2 rounded-full transition-colors ${sent ? "bg-emerald-500/20 text-emerald-300" : "bg-[#25D366] text-black hover:bg-[#1ebe5b]"}`}>
            {sent ? <Check size={14} className="mr-2" /> : <MessageCircle size={14} className="mr-2" />}{sent ? "Aberto no WhatsApp" : label}
          </a>
        ) : (
          <Button size="sm" disabled className="rounded-full" data-testid={`wa-send-disabled-${t.role}`}><MessageCircle size={14} className="mr-2" />{label}</Button>
        )}
      </div>
    </div>
  );
}

export function WhatsAppNotifyDialog({ appointmentId, title, description, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!appointmentId) return;
    setData(null); setError("");
    fetchWhatsApp(appointmentId).then(setData).catch((e) => setError(fmtErr(e.response?.data?.detail) || "Não foi possível montar as mensagens"));
  }, [appointmentId]);

  if (!appointmentId) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="wa-dialog" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title || "Avisar pelo WhatsApp"}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">{description || "Mensagens prontas com os números cadastrados. Clique para abrir o WhatsApp e enviar."}</p>
        {error && <p className="text-sm text-destructive" data-testid="wa-error">{error}</p>}
        {!data && !error && <div className="text-sm text-muted-foreground">Preparando mensagens…</div>}
        {data && data.targets.length === 0 && <div className="text-sm text-muted-foreground" data-testid="wa-empty">Nenhum destinatário para avisar.</div>}
        {data && data.targets.map((t, i) => <Target key={`${t.role}-${i}`} t={t} />)}
        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={onClose} data-testid="wa-close">Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
