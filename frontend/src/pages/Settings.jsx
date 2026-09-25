import React, { useEffect, useState } from "react";
import { api, DOW, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { ImageUpload } from "@/components/ImageUpload";
import { toast } from "sonner";
import { Copy } from "lucide-react";

const DEFAULT_SETTINGS = {
  name: "Studio",
  logo_url: "",
  address: "",
  phone: "",
  whatsapp: "",
  email: "",
  opening_hours: {},
  default_signal_percent: 30,
  referral_enabled: true,
  referral_discount_percent: 10,
};

export default function Settings() {
  const [s, setS] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });

  useEffect(() => {
    api.get("/settings")
      .then((r) => setS({ ...DEFAULT_SETTINGS, ...(r.data || {}) }))
      .catch((e) => {
        setLoadError(fmtErr(e.response?.data?.detail) || "Não foi possível carregar as configurações.");
        toast.error(fmtErr(e.response?.data?.detail) || "Não foi possível carregar as configurações.");
      });
  }, []);

  const save = async () => {
    try { const { data } = await api.put("/settings", s); setS(data); toast.success("Configurações salvas"); }
    catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro"); }
  };
  const changePassword = async () => {
    try {
      await api.post("/auth/change-password", passwords);
      setPasswords({ current_password: "", new_password: "" });
      toast.success("Senha alterada");
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail) || "Erro"); }
  };

  if (loadError) return <div className="text-sm text-destructive">{loadError}</div>;
  if (!s) return <div className="text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-3xl w-full">
      <div><div className="text-xs tracking-[0.3em] sm:tracking-[0.4em] text-primary uppercase">Ajustes</div><h1 className="font-display text-3xl sm:text-5xl mt-2">Configurações</h1></div>

      <Card className="p-4 sm:p-6 border-border space-y-4">
        <h3 className="font-display text-xl sm:text-2xl">Dados do Studio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Nome</Label><Input data-testid="s-name" value={s.name || ""} onChange={(e) => setS({ ...s, name: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Logo do Studio</Label><div className="mt-2 max-w-xs"><ImageUpload value={s.logo_url} onChange={(url) => setS({ ...s, logo_url: url })} folder="logo" testid="s-logo" aspect="aspect-square" /></div></div>
          <div className="sm:col-span-2"><Label>Endereço</Label><Input value={s.address || ""} onChange={(e) => setS({ ...s, address: e.target.value })} /></div>
          <div><Label>Telefone</Label><Input value={s.phone || ""} onChange={(e) => setS({ ...s, phone: e.target.value })} /></div>
          <div><Label>WhatsApp</Label><Input value={s.whatsapp || ""} onChange={(e) => setS({ ...s, whatsapp: e.target.value })} /></div>
          <div><Label>E-mail</Label><Input value={s.email || ""} onChange={(e) => setS({ ...s, email: e.target.value })} /></div>
          <div>
            <Label>% Sinal padrão (opcional, 0 a 100)</Label>
            <Input data-testid="s-signal" type="number" min={0} max={100} value={s.default_signal_percent ?? 0} onChange={(e) => setS({ ...s, default_signal_percent: Math.min(100, Math.max(0, parseInt(e.target.value || "0", 10))) })} />
            <p className="text-xs text-muted-foreground mt-1">{(s.default_signal_percent ?? 0) === 0 ? "Sem sinal: as reservas não exigem pagamento antecipado." : `Sinal de ${s.default_signal_percent}% do total no agendamento.`}</p>
          </div>
          <div className="sm:col-span-2 rounded-lg border border-border bg-secondary/20 p-4 space-y-3" data-testid="s-referral-box">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-medium">Cupom Indica (por amiga trazida)</div>
                <div className="text-xs text-muted-foreground">Quando ativo, a cliente ganha um cupom ao trazer uma amiga que conclui a primeira visita.</div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch data-testid="s-referral-enabled" checked={s.referral_enabled !== false} onCheckedChange={(v) => setS({ ...s, referral_enabled: v })} />
                {s.referral_enabled !== false ? "Ativo" : "Desativado"}
              </label>
            </div>
            {s.referral_enabled !== false && (
              <div className="max-w-xs">
                <Label>% de desconto do cupom</Label>
                <Input data-testid="s-referral" type="number" min={0} max={100} value={s.referral_discount_percent ?? 10} onChange={(e) => setS({ ...s, referral_discount_percent: Math.min(100, Math.max(0, parseInt(e.target.value || "0", 10))) })} />
              </div>
            )}
          </div>
          {s.public_url && <div className="sm:col-span-2"><Label>Link público para agendamentos</Label><div className="flex flex-col sm:flex-row gap-2 mt-1"><Input readOnly value={`${window.location.origin}${s.public_url}`} /><Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${s.public_url}`); toast.success("Link copiado"); }}><Copy size={14} className="mr-2" />Copiar</Button></div></div>}
        </div>
      </Card>

      <Card className="p-4 sm:p-6 border-border space-y-4">
        <h3 className="font-display text-xl sm:text-2xl">Segurança</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Senha atual</Label><Input type="password" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} /></div>
          <div><Label>Nova senha (mínimo 8 caracteres)</Label><Input type="password" minLength={8} value={passwords.new_password} onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })} /></div>
        </div>
        <Button type="button" variant="outline" onClick={changePassword}>Alterar senha</Button>
      </Card>

      <Card className="p-4 sm:p-6 border-border space-y-3">
        <h3 className="font-display text-xl sm:text-2xl">Horários de funcionamento</h3>
        {DOW.map((d) => {
          const wh = (s.opening_hours || {})[d.key] || { open: "09:00", close: "18:00", closed: false };
          const upd = (v) => setS({ ...s, opening_hours: { ...s.opening_hours, [d.key]: v } });
          return (
            <div key={d.key} className="grid grid-cols-[minmax(5rem,1fr)_auto_1fr_auto_1fr] items-center gap-2 text-sm">
              <span>{d.label}</span>
              <Switch checked={!wh.closed} onCheckedChange={(v) => upd({ ...wh, closed: !v })} />
              <Input type="time" className="w-full" value={wh.open} disabled={wh.closed} onChange={(e) => upd({ ...wh, open: e.target.value })} />
              <span>—</span>
              <Input type="time" className="w-full" value={wh.close} disabled={wh.closed} onChange={(e) => upd({ ...wh, close: e.target.value })} />
            </div>
          );
        })}
      </Card>

      <Button data-testid="settings-save" onClick={save} className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">Salvar</Button>
    </div>
  );
}
