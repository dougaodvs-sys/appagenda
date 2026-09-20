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

## Next backlog
- Testar fluxos completos (agenda, reservas, cupons, uploads).
