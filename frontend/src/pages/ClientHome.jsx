import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Gift, MessageCircle } from "lucide-react";
import { toast } from "sonner";

function ReferralCard({ settings }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/referrals/me").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return null;
  const link = `${window.location.origin}/register?ref=${data.referral_code}`;
  const pct = settings?.referral_discount_percent ?? 10;
  const text = `Oi! 💛 Estou te indicando o ${settings?.name || "Studio"}. Cadastre-se com meu código *${data.referral_code}* pelo link ${link} e venha se cuidar comigo! 🌸`;
  const copy = () => { navigator.clipboard.writeText(data.referral_code); toast.success("Código copiado"); };
  return (
    <Card className="p-8 border-border" data-testid="referral-card">
      <div className="flex items-center gap-2 text-primary"><Gift size={18} strokeWidth={1.5} /><span className="text-xs tracking-[0.3em] uppercase">Programa Indica</span></div>
      <h3 className="font-display text-3xl mt-2">Traga uma amiga, ganhe {pct}% off</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-lg">Compartilhe seu código. Quando sua amiga fizer a primeira visita confirmada, você recebe um cupom pessoal.</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div data-testid="referral-code" className="font-display text-3xl tracking-widest px-5 py-2 rounded-md border border-primary/40 bg-primary/5 text-primary">{data.referral_code}</div>
        <Button data-testid="referral-copy" variant="outline" size="sm" onClick={copy}><Copy size={14} className="mr-2" />Copiar</Button>
        <a data-testid="referral-wa" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
           className="inline-flex items-center text-sm px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <MessageCircle size={14} className="mr-2" />Convidar pelo WhatsApp
        </a>
      </div>
      <div className="mt-6 grid md:grid-cols-2 gap-6 text-sm">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Amigas indicadas ({data.friends.length})</div>
          {data.friends.length === 0 && <div className="text-muted-foreground">Ninguém ainda — compartilhe seu código!</div>}
          {data.friends.map((f) => (
            <div key={f.id} className="flex justify-between py-1 border-b border-border/50 last:border-0">
              <span>{f.name}</span>
              <span className={f.referral_rewarded ? "text-primary" : "text-muted-foreground"}>{f.referral_rewarded ? "cupom liberado" : "aguardando 1ª visita"}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Meus cupons</div>
          {data.coupons.length === 0 && <div className="text-muted-foreground">Nenhum cupom pessoal ainda.</div>}
          {data.coupons.map((c) => (
            <div key={c.id} data-testid={`my-coupon-${c.code}`} className="flex justify-between py-1 border-b border-border/50 last:border-0">
              <span className="text-primary font-medium">{c.code}</span>
              <span className={c.uses >= (c.max_uses || 1) ? "text-muted-foreground line-through" : ""}>{c.discount_percent}% off</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function ClientHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [settings, setSettings] = useState(null);
  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)); }, []);
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <div className="relative rounded-xl overflow-hidden border border-border">
        <img alt="Studio" src="https://images.unsplash.com/photo-1677052523944-b0fac5730646?crop=entropy&cs=srgb&fm=jpg&w=1400&q=70" className="w-full h-64 object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <div className="absolute bottom-8 left-8">
          <div className="text-xs tracking-[0.4em] text-primary uppercase">Bem-vinda</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-2 text-white">{user.name.split(" ")[0]}, hora de se cuidar.</h1>
        </div>
      </div>
      <Card className="p-8 border-border">
        <h3 className="font-display text-3xl">Reserve seu horário</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">Monte seu combo de procedimentos com uma ou mais profissionais no mesmo dia.</p>
        <Button data-testid="go-book" onClick={() => nav("/reservar")} className="mt-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">Iniciar reserva</Button>
      </Card>
      <ReferralCard settings={settings} />
    </div>
  );
}
