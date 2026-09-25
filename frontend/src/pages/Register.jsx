import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, fmtErr } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", referral_code: params.get("ref") || "" });
  const [busy, setBusy] = useState(false);
  const [referralEnabled, setReferralEnabled] = useState(true);
  useEffect(() => {
    const slug = params.get("studio");
    if (!slug) return;
    api.get(`/public/studios/${encodeURIComponent(slug)}/config`).then((r) => setReferralEnabled(r.data.referral_enabled !== false)).catch(() => {});
  }, [params]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register({ ...form, email: form.email || null, referral_code: referralEnabled && form.referral_code ? form.referral_code : null, studio_slug: params.get("studio") || null });
      toast.success("Conta criada com sucesso");
      nav("/inicio");
    } catch (err) {
      toast.error(fmtErr(err.response?.data?.detail) || "Falha ao criar conta");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={submit} className="w-full max-w-md space-y-6" data-testid="register-form">
        <div>
          <div className="text-xs tracking-[0.4em] text-primary uppercase">Novo cadastro</div>
          <h2 className="font-display text-4xl mt-2">Crie sua conta</h2>
          <p className="text-sm text-muted-foreground mt-2">Cadastre-se como cliente e agende seus serviços.</p>
        </div>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input data-testid="reg-name" required value={form.name} onChange={set("name")} /></div>
          <div><Label>Telefone / WhatsApp <span className="text-primary">*</span></Label><Input data-testid="reg-phone" type="tel" inputMode="tel" required minLength={8} placeholder="(11) 99999-9999" value={form.phone} onChange={set("phone")} /><p className="text-xs text-muted-foreground mt-1">Você entrará com telefone e senha.</p></div>
          <div><Label>E-mail <span className="text-muted-foreground">(opcional)</span></Label><Input data-testid="reg-email" type="email" value={form.email} onChange={set("email")} /></div>
          <div><Label>Senha</Label><Input data-testid="reg-password" type="password" required value={form.password} onChange={set("password")} /></div>
          {referralEnabled && (
            <div>
              <Label>Código de indicação <span className="text-muted-foreground">(opcional)</span></Label>
              <Input data-testid="reg-referral" placeholder="Ex.: MARIA1234" value={form.referral_code} onChange={(e) => setForm({ ...form, referral_code: e.target.value.toUpperCase() })} />
            </div>
          )}
        </div>
        <Button data-testid="register-submit" disabled={busy} className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
          {busy ? "Criando…" : "Criar conta"}
        </Button>
        <div className="text-sm text-muted-foreground text-center">
          Já tem conta? <Link data-testid="go-login" to={params.get("studio") ? `/login?studio=${encodeURIComponent(params.get("studio"))}` : "/login"} className="text-primary hover:underline">Entrar</Link>
        </div>
      </form>
    </div>
  );
}
