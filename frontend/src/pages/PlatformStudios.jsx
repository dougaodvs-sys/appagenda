import React, { useEffect, useState } from "react";
import { api, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function PlatformStudios() {
  const [studios, setStudios] = useState([]);
  const [name, setName] = useState("");
  const [license, setLicense] = useState("");
  const [manager, setManager] = useState({ name: "", phone: "", email: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [editingStudioId, setEditingStudioId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const load = () => api.get("/studios").then((r) => setStudios(r.data)).catch((e) => toast.error(fmtErr(e.response?.data?.detail))).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/studios", { name, license_expires_at: license ? new Date(`${license}T23:59:59`).toISOString() : null,
        manager_name: manager.name, manager_phone: manager.phone, manager_email: manager.email, manager_password: manager.password });
      setName(""); setLicense(""); setManager({ name: "", phone: "", email: "", password: "" }); toast.success("Studio criado"); load();
    } catch (e2) { toast.error(fmtErr(e2.response?.data?.detail)); }
  };

  const update = async (studio, changes) => {
    try {
      const { data } = await api.put(`/studios/${studio.id}`, changes);
      setStudios((all) => all.map((s) => s.id === data.id ? data : s));
      toast.success("Studio atualizado");
    } catch (e) { toast.error(fmtErr(e.response?.data?.detail)); }
  };

  const startEditing = (studio) => {
    setEditingStudioId(studio.id);
    setEditForm({
      name: studio.name || "",
      manager_name: studio.manager?.name || "",
      manager_phone: studio.manager?.phone || "",
      manager_email: studio.manager?.email || "",
      manager_password: "",
      license_expires_at: studio.license_expires_at ? studio.license_expires_at.slice(0, 10) : "",
    });
  };

  const saveStudio = async (studio) => {
    const changes = {
      name: editForm.name,
      manager_name: editForm.manager_name,
      manager_phone: editForm.manager_phone,
      manager_email: editForm.manager_email,
      license_expires_at: editForm.license_expires_at
        ? new Date(`${editForm.license_expires_at}T23:59:59`).toISOString()
        : null,
    };
    if (editForm.manager_password) changes.manager_password = editForm.manager_password;
    await update(studio, changes);
    setEditingStudioId(null);
    setEditForm({});
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6" data-testid="platform-studios">
      <div>
        <div className="text-xs tracking-[0.3em] uppercase text-primary">Plataforma</div>
        <h1 className="font-display text-3xl">Studios</h1>
        <p className="text-muted-foreground mt-1">Gerencie tenants, acesso e licenças.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Novo studio</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="text-sm space-y-2">Nome do Studio<Input value={name} onChange={(e) => setName(e.target.value)} required /></label>
              <label className="text-sm space-y-2">Licença até<Input type="date" value={license} onChange={(e) => setLicense(e.target.value)} /></label>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium">Dados do gerente</div>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="text-sm space-y-2">Nome do gerente<Input value={manager.name} onChange={(e) => setManager({ ...manager, name: e.target.value })} required /></label>
                <label className="text-sm space-y-2">Telefone do gerente<Input value={manager.phone} onChange={(e) => setManager({ ...manager, phone: e.target.value })} /></label>
                <label className="text-sm space-y-2">Login (e-mail)<Input type="email" value={manager.email} onChange={(e) => setManager({ ...manager, email: e.target.value })} required /></label>
                <label className="text-sm space-y-2">Senha inicial<Input type="password" minLength={8} value={manager.password} onChange={(e) => setManager({ ...manager, password: e.target.value })} required /></label>
              </div>
            </div>
            <Button type="submit">Criar studio</Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3">
        {loading && <div className="text-muted-foreground">Carregando…</div>}
        {!loading && studios.map((studio) => (
          <Card key={studio.id}>
            <CardContent className="p-5 space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="text-lg font-medium">{studio.name}</div>
                  <div className="text-sm text-muted-foreground">ID: {studio.id}</div>
                  <div className="text-sm text-muted-foreground">Licença: {studio.license_expires_at ? new Date(studio.license_expires_at).toLocaleDateString("pt-BR") : "Sem expiração"}</div>
                  <div className="text-sm text-muted-foreground break-all">Link público: {studio.public_url || "—"}</div>
                  {studio.manager && <div className="text-sm text-muted-foreground">Gerente: {studio.manager.name} · {studio.manager.email}</div>}
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">Ativo <Switch checked={studio.active !== false} onCheckedChange={(active) => update(studio, { active })} /></label>
                  <Button type="button" variant="outline" onClick={() => editingStudioId === studio.id ? setEditingStudioId(null) : startEditing(studio)}>
                    {editingStudioId === studio.id ? "Fechar" : "Editar"}
                  </Button>
                </div>
              </div>
              {editingStudioId === studio.id && (
                <div className="border-t pt-5 space-y-5">
                  <div className="text-sm font-medium">Editar dados do Studio</div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="text-sm space-y-2">Nome do Studio<Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required /></label>
                    <label className="text-sm space-y-2">Alterar licença<Input type="date" value={editForm.license_expires_at} onChange={(e) => setEditForm({ ...editForm, license_expires_at: e.target.value })} /></label>
                    <label className="text-sm space-y-2">Nome do gerente<Input value={editForm.manager_name} onChange={(e) => setEditForm({ ...editForm, manager_name: e.target.value })} required /></label>
                    <label className="text-sm space-y-2">Telefone do gerente<Input value={editForm.manager_phone} onChange={(e) => setEditForm({ ...editForm, manager_phone: e.target.value })} /></label>
                    <label className="text-sm space-y-2">Login (e-mail)<Input type="email" value={editForm.manager_email} onChange={(e) => setEditForm({ ...editForm, manager_email: e.target.value })} required /></label>
                    <label className="text-sm space-y-2">Nova senha<Input type="password" minLength={8} placeholder="Deixe em branco para manter" value={editForm.manager_password} onChange={(e) => setEditForm({ ...editForm, manager_password: e.target.value })} /></label>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={() => saveStudio(studio)}>Salvar alterações</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
