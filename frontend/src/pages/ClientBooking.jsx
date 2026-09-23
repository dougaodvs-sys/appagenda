import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, brl, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WhatsAppNotifyDialog } from "@/components/WhatsAppNotify";

// Booking cart: array of { service_id, professional_id, start (ISO), service, pro }

export default function ClientBooking() {
  const nav = useNavigate();
  const [services, setServices] = useState([]);
  const [pros, setPros] = useState([]);
  const [cart, setCart] = useState([]);
  const [step, setStep] = useState("build"); // build | review
  const [createdId, setCreatedId] = useState(null);
  const [pick, setPick] = useState({ service_id: "", professional_id: "", day: new Date().toISOString().slice(0, 10) });
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponInfo, setCouponInfo] = useState(null);

  useEffect(() => {
    api.get("/services").then((r) => setServices(r.data.filter((s) => s.active !== false)));
    api.get("/professionals").then((r) => setPros(r.data.filter((p) => p.active !== false)));
  }, []);

  const eligiblePros = useMemo(
    () => pros.filter((p) => !pick.service_id || (p.service_ids || []).includes(pick.service_id)),
    [pros, pick.service_id]
  );

  const loadSlots = useCallback(async () => {
    if (!pick.service_id || !pick.professional_id || !pick.day) return;
    setLoadingSlots(true); setSlots([]);
    try {
      const { data } = await api.get("/availability", {
        params: { professional_id: pick.professional_id, service_id: pick.service_id, day: pick.day },
      });
      setSlots(data.slots);
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro"); }
    finally { setLoadingSlots(false); }
  }, [pick.day, pick.professional_id, pick.service_id]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  // Filter slots that don't clash with current cart items for the same client
  const cartIntervals = useMemo(() => cart.map((c) => {
    const svc = services.find((s) => s.id === c.service_id);
    const s = new Date(c.start);
    const e = new Date(s.getTime() + (svc?.duration_min || 0) * 60000);
    return [s.getTime(), e.getTime()];
  }), [cart, services]);
  const currentSvc = services.find((s) => s.id === pick.service_id);
  const visibleSlots = useMemo(() => slots.filter((iso) => {
    if (!currentSvc) return true;
    const s = new Date(iso).getTime();
    const e = s + currentSvc.duration_min * 60000;
    return !cartIntervals.some(([bs, be]) => s < be && bs < e);
  }), [slots, cartIntervals, currentSvc]);

  const addToCart = (iso) => {
    const svc = services.find((s) => s.id === pick.service_id);
    const pro = pros.find((p) => p.id === pick.professional_id);
    setCart([...cart, { service_id: svc.id, professional_id: pro.id, start: iso, service: svc, pro }]);
    setPick({ ...pick, service_id: "", professional_id: "" });
    setSlots([]);
    toast.success("Procedimento adicionado");
  };
  const removeCart = (idx) => setCart(cart.filter((_, i) => i !== idx));

  const applyCoupon = async () => {
    if (!couponCode) { setCouponInfo(null); return; }
    try {
      const { data } = await api.post("/coupons/validate", {
        code: couponCode,
        items: cart.map((c) => ({ professional_id: c.professional_id, service_id: c.service_id })),
      });
      setCouponInfo(data); toast.success("Cupom aplicado");
    } catch (e) { setCouponInfo(null); toast.error(fmtErr(e.response?.data?.detail) || "Cupom inválido"); }
  };

  const subtotal = cart.reduce((s, c) => s + (c.service?.price || 0), 0);
  const discount = couponInfo?.discount || 0;
  const total = subtotal - discount;

  const submit = async () => {
    try {
      const { data } = await api.post("/appointments", {
        items: cart.map((c) => ({ professional_id: c.professional_id, service_id: c.service_id, start: c.start })),
        coupon_code: couponCode || null,
      });
      toast.success("Solicitação enviada!"); setCreatedId(data.id);
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro ao reservar"); }
  };

  if (createdId) {
    return (
      <div className="max-w-xl mx-auto space-y-6" data-testid="booking-success">
        <div>
          <div className="text-xs tracking-[0.4em] text-primary uppercase">Reserva</div>
          <h1 className="font-display text-4xl mt-2">Solicitação enviada ✨</h1>
          <p className="text-muted-foreground mt-2">Seu pedido está aguardando confirmação do Studio. Para agilizar, avise o profissional pelo WhatsApp com a mensagem pronta abaixo.</p>
        </div>
        <WhatsAppNotifyDialog appointmentId={createdId} title="Avisar o profissional ⚡" description="Mensagem pronta para o WhatsApp cadastrado do profissional." onClose={() => nav("/agendamentos")} />
        <Button data-testid="booking-go-appointments" onClick={() => nav("/agendamentos")} className="rounded-full">Ver meus agendamentos</Button>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div><div className="text-xs tracking-[0.4em] text-primary uppercase">Resumo</div><h1 className="font-display text-4xl sm:text-5xl mt-2">Confirmar reserva</h1></div>
        <Card className="p-6 border-border space-y-4">
          {cart.map((c, i) => (
            <div key={i} className="flex justify-between border-b border-border pb-3 last:border-0">
              <div>
                <div className="font-medium">{c.service.name}</div>
                <div className="text-xs text-muted-foreground">com {c.pro.name} • {new Date(c.start).toLocaleString("pt-BR")}</div>
              </div>
              <div>{brl(c.service.price)}</div>
            </div>
          ))}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Input placeholder="Código do cupom" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} data-testid="coupon-input" />
            <Button onClick={applyCoupon} variant="outline" className="w-full sm:w-auto" data-testid="coupon-apply">Aplicar</Button>
          </div>
          <div className="space-y-1 pt-2 border-t border-border">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{brl(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-sm text-primary"><span>Cupom ({couponCode})</span><span>-{brl(discount)}</span></div>}
            <div className="flex justify-between font-display text-2xl pt-2"><span>Total</span><span>{brl(total)}</span></div>
          </div>
        </Card>
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <Button variant="outline" onClick={() => setStep("build")}>Voltar</Button>
          <Button data-testid="confirm-booking" onClick={submit} className="flex-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            Solicitar reserva
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <div className="text-xs tracking-[0.4em] text-primary uppercase">Reservar</div>
        <h1 className="font-display text-4xl sm:text-5xl mt-2">Monte seu combo</h1>
        <p className="text-sm text-muted-foreground mt-2">Adicione um ou mais procedimentos no mesmo dia. O sistema calcula automaticamente as melhores janelas para você.</p>
      </div>

      {cart.length > 0 && (
        <Card className="p-5 border-border">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Seus procedimentos</div>
          <div className="space-y-2">
            {cart.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{c.service.name} • {c.pro.name} • {new Date(c.start).toLocaleString("pt-BR")}</span>
                <button data-testid={`remove-cart-${i}`} onClick={() => removeCart(i)} className="text-destructive hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6 border-border space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label>Serviço</Label>
            <Select value={pick.service_id} onValueChange={(v) => setPick({ ...pick, service_id: v, professional_id: "" })}>
              <SelectTrigger data-testid="pick-service"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — {brl(s.price)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Profissional</Label>
            <Select value={pick.professional_id} onValueChange={(v) => setPick({ ...pick, professional_id: v })} disabled={!pick.service_id}>
              <SelectTrigger data-testid="pick-pro"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{eligiblePros.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data</Label>
            <Input data-testid="pick-day" type="date" value={pick.day} onChange={(e) => setPick({ ...pick, day: e.target.value })} />
          </div>
        </div>


        {pick.service_id && pick.professional_id && (
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Horários disponíveis</div>
            {loadingSlots ? (
              <div className="text-sm text-muted-foreground">Buscando…</div>
            ) : visibleSlots.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhum horário disponível.</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {visibleSlots.map((iso) => (
                  <button
                    key={iso}
                    data-testid={`slot-${iso}`}
                    onClick={() => addToCart(iso)}
                    className="px-3 py-2 rounded-md border border-border text-sm hover:border-primary hover:text-primary transition-colors"
                  >
                    {new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {cart.length > 0 && (
        <div className="flex justify-end">
          <Button data-testid="go-review" onClick={() => setStep("review")} className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            Continuar para resumo ({cart.length})
          </Button>
        </div>
      )}
    </div>
  );
}
