import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ResetPassword() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== confirm) { toast.error("As senhas não coincidem"); return; }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pw });
      toast.success("Senha redefinida. Faça login com a nova senha.");
      nav("/login?staff=1");
    } catch (err) {
      toast.error(fmtErr(err.response?.data?.detail) || "Não foi possível redefinir a senha");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-6" data-testid="reset-form">
        <div>
          <div className="text-xs tracking-[0.4em] text-primary uppercase">Recuperar acesso</div>
          <h1 className="font-display text-4xl mt-2">Nova senha</h1>
        </div>
        {!token ? (
          <div data-testid="reset-no-token" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            Link inválido. Solicite um novo em <Link to="/esqueci-senha" className="text-primary hover:underline">Esqueci minha senha</Link>.
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="pw">Nova senha</Label>
              <Input data-testid="reset-password" id="pw" type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required />
              <p className="text-xs text-muted-foreground mt-1">Mínimo de 8 caracteres.</p>
            </div>
            <div>
              <Label htmlFor="confirm">Confirmar nova senha</Label>
              <Input data-testid="reset-confirm" id="confirm" type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <Button data-testid="reset-submit" disabled={busy} className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? "Salvando…" : "Redefinir senha"}
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
