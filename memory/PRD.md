# Studio Aurea - App de Agenda

## Original Problem Statement
"importa meu projeto" — GitHub: https://github.com/dvscanvas1421-ctrl/app-de-agenda

## Description
SaaS multi-tenant de agendamento e gestão para Studios de beleza.
Stack: FastAPI + MongoDB + React (CRA/craco) + Tailwind + shadcn/ui.

## Roles
- super_admin: gerencia studios da plataforma
- manager: gerente do studio (dashboard, serviços, profissionais, cupons, agenda, relatórios)
- professional: agenda + serviços próprios + cupons próprios + galeria
- client: reserva serviços, cupons de indicação

## Import status (2026-01)
- Repo importado do GitHub. Faltavam no repo: `.env` do backend/frontend, `src/lib/api.js`, `src/lib/auth.jsx`, `src/lib/utils.js`, e UI shadcn (`sonner`, `select`, `sheet`, `switch`, `tabs`, `textarea`). Todos criados.
- Backend rodando em 0.0.0.0:8001 via supervisor.
- Frontend compilando e servindo em 3000. Login/API funcionando (`/api/auth/login` 200 OK, seed do manager criado).

## Environment configured
- backend/.env: MONGO_URL, DB_NAME=studio_aurea, JWT_SECRET, COOKIE_SECURE=true, ADMIN_*, SUPER_ADMIN_*, CORS_ORIGINS
- frontend/.env: REACT_APP_BACKEND_URL, WDS_SOCKET_PORT

## Known notes
- Storage inicializa contra `integrations.emergentagent.com`; se falhar, uploads caem para diretório local `/app/backend/uploads` (o código já cobre isso quando EMERGENT_LLM_KEY está ausente; com key presente pode dar 400 na init — verificar caso queira usar upload).

## Auth extras (2026-06)
- `/login?staff=1` abre direto na aba Equipe; dica na aba; link "Esqueci minha senha" (só na aba Equipe).
- Página `/minha-conta` (menu do super admin; acessível a manager/professional também): alterar senha + registro de acessos (data, IP via X-Forwarded-For, navegador, sucesso/falha). Coleção `login_events`, endpoint `GET /api/auth/login-history`.
- Recuperação de senha: `POST /api/auth/forgot-password` (token 1h, coleção `password_reset_tokens` com TTL), `POST /api/auth/reset-password`, páginas `/esqueci-senha` e `/redefinir-senha?token=`. **Envio de e-mail MOCKADO**: link vai só para o log do backend (`PASSWORD RESET LINK`).
- Seed do super admin não sobrescreve mais a senha quando `password_changed_at` existe (senha alterada no app é mantida em restart).
- Testado: test_reports/iteration_1.json (backend 7/7, frontend E2E ok).

## E-mail real + Acessos master + Primeiro Studio (2026-06)
- Recuperação de senha agora envia e-mail real via Emergent managed email (Resend proxy) — `backend/emailer.py` (gate de segurança G2/G3, template server-side). `.env`: `EMERGENT_EMAIL_KEY`, `EMAIL_FROM_NAME=Studio Aurea`.
- Página `/plataforma/admins` ("Acessos master"): criar/listar/remover super admins. Endpoints `GET/POST/DELETE /api/platform/admins` (não permite remover a si mesmo). Mostra último acesso via `login_events`.
- Primeiro Studio real criado: **Meu Studio** (slug `meu-studio`, gerente `gerente@meustudio.com`). Studio padrão `Studio Aurea` (default-studio) continua existindo.
- Existe um super admin legado `admin@plataforma.com` (seed antigo) — pode ser removido pela tela Acessos master.
- Testado: test_reports/iteration_2.json (backend 5/5, frontend E2E ok).

## Next backlog
- P1: Editar nome/e-mail de um super admin e redefinir senha pelo super admin.
- P1: Testar fluxos completos do studio (agenda, reservas, cupons, uploads). Storage init retorna 400 — verificar upload de galeria.
- P2: Proteção contra força bruta no login (bloqueio após 5 falhas).
- P2: Notificar admin em acesso de IP/navegador novo.
