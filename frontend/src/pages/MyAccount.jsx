import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

function browserLabel(ua = "") {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  if (/curl|python|axios|node/i.test(ua)) return "API / script";
  return ua ? ua.slice(0, 40) : "—";
}

function deviceLabel(ua = "") {
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "";
}

function ChangePasswordCard() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) { toast.error("As senhas não coincidem"); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: form.current, new_password: form.next });
      toast.success("Senha alterada com sucesso");
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(fmtErr(err.response?.data?.detail) || "Não foi possível alterar a senha");
    } finally { setBusy(false); }
  };

  return (
    <Card data-testid="change-password-card">
      <CardHeader><CardTitle>Alterar minha senha</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4 max-w-md">
          <div>
            <Label htmlFor="cur">Senha atual</Label>
            <Input data-testid="cp-current" id="cur" type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="next">Nova senha</Label>
            <Input data-testid="cp-new" id="next" type="password" minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required />
            <p className="text-xs text-muted-foreground mt-1">Mínimo de 8 caracteres.</p>
          </div>
          <div>
            <Label htmlFor="conf">Confirmar nova senha</Label>
            <Input data-testid="cp-confirm" id="conf" type="password" minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
          </div>
          <Button data-testid="cp-submit" disabled={busy} className="rounded-full">{busy ? "Salvando…" : "Salvar nova senha"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LoginHistoryCard() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/auth/login-history?limit=30").then((r) => setEvents(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <Card data-testid="login-history-card">
      <CardHeader><CardTitle>Registro de acessos</CardTitle></CardHeader>
      <CardContent>
        {loading && <div className="text-muted-foreground text-sm">Carregando…</div>}
        {!loading && events.length === 0 && <div data-testid="login-history-empty" className="text-muted-foreground text-sm">Nenhum acesso registrado ainda.</div>}
        {!loading && events.length > 0 && (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm" data-testid="login-history-table">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th className="px-2 py-2 font-medium">Data / hora</th>
                  <th className="px-2 py-2 font-medium">IP</th>
                  <th className="px-2 py-2 font-medium">Navegador</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} data-testid={`login-event-${ev.id}`} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-2.5 whitespace-nowrap">{new Date(ev.at).toLocaleString("pt-BR")}</td>
                    <td className="px-2 py-2.5 font-mono text-xs">{ev.ip || "—"}</td>
                    <td className="px-2 py-2.5">
                      {browserLabel(ev.user_agent)}
                      {deviceLabel(ev.user_agent) && <span className="text-muted-foreground"> · {deviceLabel(ev.user_agent)}</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      {ev.success
                        ? <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15 border-emerald-500/30">Sucesso</Badge>
                        : <Badge className="bg-rose-500/15 text-rose-400 hover:bg-rose-500/15 border-rose-500/30">Senha incorreta</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyAccount() {
  const { user } = useAuth();
  return (
    <div className="max-w-5xl mx-auto space-y-6" data-testid="my-account">
      <div>
        <div className="text-xs tracking-[0.3em] uppercase text-primary">Conta</div>
        <h1 className="font-display text-3xl">Minha conta</h1>
        <p className="text-muted-foreground mt-1" data-testid="my-account-email">{user.email}</p>
      </div>
      <ChangePasswordCard />
      <LoginHistoryCard />
    </div>
  );
}
