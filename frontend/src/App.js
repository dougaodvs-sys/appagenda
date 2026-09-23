import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Layout from "@/pages/Layout";
import ManagerDashboard from "@/pages/ManagerDashboard";
import Agenda from "@/pages/Agenda";
import Professionals from "@/pages/Professionals";
import Services from "@/pages/Services";
import Clients from "@/pages/Clients";
import Coupons from "@/pages/Coupons";
import Blocks from "@/pages/Blocks";
import Settings from "@/pages/Settings";
import ClientHome from "@/pages/ClientHome";
import ClientBooking from "@/pages/ClientBooking";
import Appointments from "@/pages/Appointments";
import ProServices from "@/pages/ProServices";
import Gallery from "@/pages/Gallery";
import PlatformStudios from "@/pages/PlatformStudios";
import PublicStudio from "@/pages/PublicStudio";
import Reports from "@/pages/Reports";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import MyAccount from "@/pages/MyAccount";
import PlatformAdmins from "@/pages/PlatformAdmins";
import Reminders from "@/pages/Reminders";
import "@/App.css";

function Guard({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "manager") return <Navigate to="/dashboard" replace />;
  if (user.role === "super_admin") return <Navigate to="/plataforma/studios" replace />;
  if (user.role === "professional") return <Navigate to="/agenda" replace />;
  return <Navigate to="/inicio" replace />;
}

export default function App() {
  return (
    <div className="App dark">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/esqueci-senha" element={<ForgotPassword />} />
            <Route path="/redefinir-senha" element={<ResetPassword />} />
            <Route path="/studio/:slug" element={<PublicStudio />} />
            <Route path="/" element={<RootRedirect />} />
            <Route element={<Guard><Layout /></Guard>}>
              <Route path="/minha-conta" element={<Guard roles={["super_admin","manager","professional"]}><MyAccount /></Guard>} />
              <Route path="/dashboard" element={<Guard roles={["manager"]}><ManagerDashboard /></Guard>} />
              <Route path="/relatorios" element={<Guard roles={["manager","professional"]}><Reports /></Guard>} />
              <Route path="/plataforma/studios" element={<Guard roles={["super_admin"]}><PlatformStudios /></Guard>} />
              <Route path="/plataforma/admins" element={<Guard roles={["super_admin"]}><PlatformAdmins /></Guard>} />
              <Route path="/agenda" element={<Guard roles={["manager","professional"]}><Agenda /></Guard>} />
              <Route path="/lembretes" element={<Guard roles={["manager","professional"]}><Reminders /></Guard>} />
              <Route path="/agendamentos" element={<Appointments />} />
              <Route path="/profissionais" element={<Guard roles={["manager"]}><Professionals /></Guard>} />
              <Route path="/servicos" element={<Guard roles={["manager"]}><Services /></Guard>} />
              <Route path="/meus-servicos" element={<Guard roles={["professional"]}><ProServices /></Guard>} />
              <Route path="/galeria" element={<Guard roles={["manager","professional"]}><Gallery /></Guard>} />
              <Route path="/clientes" element={<Guard roles={["manager","professional"]}><Clients /></Guard>} />
              <Route path="/cupons" element={<Guard roles={["manager","professional"]}><Coupons /></Guard>} />
              <Route path="/bloqueios" element={<Guard roles={["manager","professional"]}><Blocks /></Guard>} />
              <Route path="/configuracoes" element={<Guard roles={["manager"]}><Settings /></Guard>} />
              <Route path="/inicio" element={<Guard roles={["client"]}><ClientHome /></Guard>} />
              <Route path="/reservar" element={<Guard roles={["client"]}><ClientBooking /></Guard>} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </div>
  );
}
