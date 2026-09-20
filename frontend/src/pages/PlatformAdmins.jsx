import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", email: "", password: "" };

export default function PlatformAdmins() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/platform/admins").then((r) => setAdmins(r.data)).catch((e) => toast.error(fmtErr(e.response?.data?.detail))).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/platform/admins", form);
      toast.success("Novo acesso master criado");
      setForm(EMPTY);
      load();
    } catch (err) { toast.error(fmtErr(err.response?.data?.detail) || "Não foi possível criar"); }
    finally { setBusy(false); }
  };

  const remove = async (a) => {
    try {
      await api.delete(`/platform/admins/${a.id}`);
      toast.success(`Acesso de ${a.email} removido`);
      setAdmins((all) => all.filter((x) => x.id !== a.id));
    } catch (err) { toast.error(fmtErr(err.response?.data?.detail) || "Não foi possível remover"); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6" data-testid="platform-admins">
      <div>
        <div className="text-xs tracking-[0.3em] uppercase text-primary">Plataforma</div>
        <h1 className="font-display text-3xl">Acessos master</h1>
        <p className="text-muted-foreground mt-1">Super administradores com controle total da plataforma.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Novo super admin</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 lg:grid-cols-3 items-end">
            <label className="text-sm space-y-2">Nome<Input data-testid="admin-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></label>
            <label className="text-sm space-y-2">E-mail de login<Input data-testid="admin-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label className="text-sm space-y-2">Senha inicial<Input data-testid="admin-password" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
            <div className="lg:col-span-3 flex justify-end">
              <Button data-testid="admin-create" type="submit" disabled={busy} className="rounded-full">{busy ? "Criando…" : "Criar acesso"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3" data-testid="admins-list">
        {loading && <div className="text-muted-foreground">Carregando…</div>}
        {!loading && admins.map((a) => {
          const me = a.id === user.id;
          return (
            <Card key={a.id} data-testid={`admin-card-${a.id}`}>
              <CardContent className="p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><ShieldCheck size={18} strokeWidth={1.5} /></div>
                  <div className="space-y-0.5">
                    <div className="font-medium flex items-center gap-2">{a.name}{me && <Badge className="bg-primary/20 text-primary hover:bg-primary/20">você</Badge>}</div>
                    <div className="text-sm text-muted-foreground">{a.email}</div>
                    <div className="text-xs text-muted-foreground">
                      Criado em {a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—"} · Último acesso: {a.last_login_at ? new Date(a.last_login_at).toLocaleString("pt-BR") : "nunca"}
                    </div>
                  </div>
                </div>
                {!me && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button data-testid={`admin-remove-${a.id}`} variant="outline" size="sm" className="text-rose-400 border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={14} className="mr-2" />Remover</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover acesso master?</AlertDialogTitle>
                        <AlertDialogDescription>{a.email} perderá imediatamente todo o acesso à plataforma. Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="admin-remove-cancel">Cancelar</AlertDialogCancel>
                        <AlertDialogAction data-testid="admin-remove-confirm" onClick={() => remove(a)} className="bg-rose-600 hover:bg-rose-500 text-white">Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
