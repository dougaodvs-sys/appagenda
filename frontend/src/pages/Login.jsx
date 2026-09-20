import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, fmtErr } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const studioSlug = params.get("studio") || "";
  const nextPath = params.get("next") || "";
  const [mode, setMode] = useState("client");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(mode === "client" ? phone : email, password, studioSlug);
      toast.success(`Bem-vinda, ${u.name}`);
      if (u.role === "manager") nav("/dashboard");
      else if (u.role === "professional") nav("/agenda");
      else nav(nextPath.startsWith("/") ? nextPath : "/inicio");
    } catch (err) {
      toast.error(fmtErr(err.response?.data?.detail) || "Falha no login");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:block relative overflow-hidden">
        <img
          alt="Studio"
          src="https://images.unsplash.com/photo-1707992568921-fa9c40e7ef32?crop=entropy&cs=srgb&fm=jpg&w=1400&q=70"
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-black via-black/70 to-transparent" />
        <div className="absolute bottom-14 left-14 max-w-md">
          <div className="text-xs tracking-[0.4em] text-primary uppercase mb-6">Studio Aurea</div>
          <h1 className="font-display text-5xl leading-tight text-white">Beleza que se agenda com elegância.</h1>
          <p className="mt-4 text-white/70">Gestão inteligente de agenda, sinais e clientes para o seu Studio.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6" data-testid="login-form">
          <div>
            <div className="text-xs tracking-[0.4em] text-primary uppercase">Entrar</div>
            <h2 className="font-display text-4xl mt-2">Acesse sua conta</h2>
          </div>
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="client" data-testid="login-tab-client">Sou cliente</TabsTrigger>
              <TabsTrigger value="staff" data-testid="login-tab-staff">Equipe</TabsTrigger>
            </TabsList>
            <TabsContent value="client" className="mt-4">
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input data-testid="login-phone" id="phone" type="tel" inputMode="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} required={mode === "client"} />
            </TabsContent>
            <TabsContent value="staff" className="mt-4">
              <Label htmlFor="email">E-mail</Label>
              <Input data-testid="login-email" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required={mode === "staff"} />
            </TabsContent>
          </Tabs>
          <div>
            <Label htmlFor="pw">Senha</Label>
            <Input data-testid="login-password" id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button data-testid="login-submit" disabled={busy} className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? "Entrando…" : "Entrar"}
          </Button>
          {mode === "client" && (
            <div className="text-sm text-muted-foreground text-center">
              Ainda não tem conta? <Link data-testid="go-register" to={studioSlug ? `/register?studio=${encodeURIComponent(studioSlug)}` : "/register"} className="text-primary hover:underline">Criar conta</Link>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
