import React, { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Bell, LogOut, LayoutDashboard, Calendar, Users, Scissors, Ticket, Ban, Settings as SettingsIcon, User, Menu, Images, Building2, Copy, BarChart3, UserCog, ShieldCheck, BellRing } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import InstallAppButton from "@/components/InstallAppButton";

const NAV = {
  super_admin: [
    { to: "/plataforma/studios", label: "Studios", icon: Building2 },
    { to: "/plataforma/admins", label: "Acessos master", icon: ShieldCheck },
    { to: "/minha-conta", label: "Minha conta", icon: UserCog },
  ],
  manager: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/agenda", label: "Agenda", icon: Calendar },
    { to: "/agendamentos", label: "Agendamentos", icon: Calendar },
    { to: "/lembretes", label: "Lembretes", icon: BellRing },
    { to: "/profissionais", label: "Profissionais", icon: Users },
    { to: "/servicos", label: "Serviços", icon: Scissors },
    { to: "/clientes", label: "Clientes", icon: User },
    { to: "/cupons", label: "Cupons", icon: Ticket },
    { to: "/bloqueios", label: "Bloqueios", icon: Ban },
    { to: "/configuracoes", label: "Configurações", icon: SettingsIcon },
    { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  ],
  professional: [
    { to: "/agenda", label: "Minha Agenda", icon: Calendar },
    { to: "/agendamentos", label: "Agendamentos", icon: Calendar },
    { to: "/lembretes", label: "Lembretes", icon: BellRing },
    { to: "/meus-servicos", label: "Meus Serviços", icon: Scissors },
    { to: "/clientes", label: "Meus Clientes", icon: User },
    { to: "/cupons", label: "Cupons", icon: Ticket },
    { to: "/bloqueios", label: "Bloqueios", icon: Ban },
    { to: "/relatorios", label: "Meus relatórios", icon: BarChart3 },
  ],
  client: [
    { to: "/inicio", label: "Início", icon: LayoutDashboard },
    { to: "/reservar", label: "Reservar", icon: Calendar },
    { to: "/agendamentos", label: "Meus agendamentos", icon: Calendar },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  const [studioName, setStudioName] = useState("Studio");
  const [studioSlug, setStudioSlug] = useState("");

  useEffect(() => {
    const load = () => api.get("/notifications").then((r) => setNotifs(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (user?.role && user.role !== "super_admin") {
      api.get("/settings").then((r) => {
        setStudioName(r.data.name || "Studio");
        setStudioSlug(r.data.slug || "");
        if (r.data.public_url) setPublicUrl(`${window.location.origin}${r.data.public_url}`);
      }).catch(() => {});
    }
  }, [user?.role]);

  const unread = notifs.filter((n) => !n.read).length;
  const items = NAV[user.role] || [];

  const doLogout = async () => { await logout(); nav("/login"); };

  const markRead = async (id) => {
    await api.post(`/notifications/${id}/read`);
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const navLinks = (onClick, prefix = "nav") => items.map(({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={studioSlug ? `${to}?studio=${encodeURIComponent(studioSlug)}` : to}
      onClick={onClick}
      data-testid={`${prefix}-${to.replace("/", "")}`}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
          isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        }`
      }
    >
      <Icon size={16} strokeWidth={1.5} />
      {label}
    </NavLink>
  ));

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r border-border bg-card/30 hidden md:flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="text-xs tracking-[0.4em] text-primary uppercase">Studio</div>
          <div className="font-display text-2xl">{studioName}</div>
        </div>
        <nav className="flex-1 p-4 space-y-1">{navLinks(undefined, "nav-desktop")}</nav>
        <div className="p-4 border-t border-border text-xs text-muted-foreground">
          <div className="mb-2">{user.name}</div>
          <div className="uppercase tracking-widest">{user.role}</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="min-h-16 border-b border-border backdrop-blur-xl bg-black/60 sticky top-0 z-30 flex items-center justify-between gap-2 px-3 sm:px-6 py-2">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button data-testid="mobile-menu-btn" className="md:hidden p-2 -ml-2 rounded-full hover:bg-secondary/60 transition-colors" aria-label="Menu">
                <Menu size={20} strokeWidth={1.5} />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-card border-border" data-testid="mobile-menu">
              <div className="p-6 border-b border-border">
                <div className="text-xs tracking-[0.4em] text-primary uppercase">Studio</div>
                <div className="font-display text-2xl">{studioName}</div>
              </div>
              <nav className="p-4 space-y-1">{navLinks(() => setMenuOpen(false), "nav")}</nav>
              <div className="p-4 border-t border-border text-xs text-muted-foreground">
                <div className="mb-1">{user.name}</div>
                <div className="uppercase tracking-widest">{user.role}</div>
              </div>
            </SheetContent>
          </Sheet>
          <div className="font-display text-base sm:text-xl md:hidden ml-1 truncate">{studioName}</div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <InstallAppButton compact />
            {publicUrl && <Button variant="ghost" size="sm" className="px-2 sm:px-3" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link público copiado"); }}><Copy size={16} className="sm:mr-2" /><span className="hidden sm:inline">Link público</span></Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="notif-bell" className="relative p-2 rounded-full hover:bg-secondary/60 transition-colors">
                  <Bell size={18} strokeWidth={1.5} />
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                      {unread}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notificações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifs.length === 0 && <div className="p-3 text-sm text-muted-foreground">Nenhuma notificação</div>}
                {notifs.slice(0, 10).map((n) => (
                  <DropdownMenuItem key={n.id} onClick={() => markRead(n.id)} data-testid={`notif-${n.id}`} className="flex flex-col items-start gap-1 py-2">
                    <div className="flex items-center gap-2 w-full">
                      <span className="font-medium">{n.title}</span>
                      {!n.read && <Badge className="ml-auto bg-primary/20 text-primary hover:bg-primary/20">nova</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{n.body}</div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button data-testid="logout-btn" variant="ghost" size="sm" className="px-2 sm:px-3" onClick={doLogout}>
              <LogOut size={16} className="sm:mr-2" /><span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </header>
        <main className="responsive-shell flex-1 min-w-0 p-3 sm:p-6 lg:p-10 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
