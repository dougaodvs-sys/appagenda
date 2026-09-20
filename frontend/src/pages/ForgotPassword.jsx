import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      toast.error(fmtErr(err.response?.data?.detail) || "Não foi possível enviar o link");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-6" data-testid="forgot-form">
        <div>
          <div className="text-xs tracking-[0.4em] text-primary uppercase">Recuperar acesso</div>
          <h1 className="font-display text-4xl mt-2">Esqueci minha senha</h1>
          <p className="text-sm text-muted-foreground mt-2">Informe o e-mail da sua conta da equipe. Enviaremos um link para redefinir a senha.</p>
        </div>
        {sent ? (
          <div data-testid="forgot-success" className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm">
            Se o e-mail estiver cadastrado, você receberá um link de recuperação em instantes. O link vale por 1 hora.
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input data-testid="forgot-email" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button data-testid="forgot-submit" disabled={busy} className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? "Enviando…" : "Enviar link"}
            </Button>
          </>
        )}
        <div className="text-sm text-muted-foreground text-center">
          <Link data-testid="back-to-login" to="/login?staff=1" className="text-primary hover:underline">Voltar ao login</Link>
        </div>
      </form>
    </div>
  );
}
