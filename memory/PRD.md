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

## Bug fix: "Falha no login" (CORS) — 2026-06
- Causa raiz: o ingress da plataforma reescreve o header `Origin` para `https://<id>.cluster-N.preview.emergentcf.cloud`; o CORSMiddleware só aceitava `CORS_ORIGINS` exatos → preflight `OPTIONS /api/auth/login` 400 "Disallowed CORS origin" → axios erro de rede → toast "Falha no login".
- Fix: `allow_origin_regex` para `*.emergentagent.com | *.emergentcf.cloud | *.emergent.host` além de `CORS_ORIGINS` (server.py, final). Testado: test_reports/iteration_3.json.
- Lição: não confiar em whitelist exata de Origin neste ambiente; sempre testar preflight pela URL pública, não só localhost.
- 2ª causa (print do usuário): ele acessa pelo alias `importa-projeto.preview.emergentagent.com` ≠ `REACT_APP_BACKEND_URL` → chamadas cross-origin; como o proxy reescreve o Origin, o `Access-Control-Allow-Origin` nunca bate com o origin real do navegador. Fix: `lib/api.js` usa `window.location.origin` como `BACKEND_URL` quando a página está em https num host diferente do `.env` (chamadas same-origin). Testado no alias e no host principal: test_reports/iteration_4.json.

## Encaixe rápido (profissional) + fix upload logo — 2026-06
- Bug logo: axios tinha header padrão `Content-Type: application/json` → axios 1.x converte FormData em JSON → 422 "Field required". Removido o header padrão em `lib/api.js`. (iteration_5)
- Encaixe rápido agora disponível para **profissional** (só na própria agenda) e gerente. Backend: `quick` pula validação de horário de funcionamento (`_slot_ok(skip_hours=True)`), mantém checagem de conflito (a menos de `force`), status já `confirmed`. `GET /clients?scope=all` para profissional escolher qualquer cliente cadastrada (id/nome/telefone).
- Frontend `QuickBooking.jsx`: abas "Cliente cadastrada" (busca + select) / "Sem cadastro"; profissional não escolhe profissional; "Digitar horário livremente". Badge âmbar "Encaixe" (`QuickBadge`) na Agenda (borda esquerda âmbar) e em Agendamentos. Agenda pula para o dia do encaixe. `STATUS_META` ganhou `color`. (iteration_6)
- Dados de teste no Meu Studio: serviço "Design de Sobrancelha", profissional ana@meustudio.com, cliente 11988887777.

## Next backlog
- P1: Editar nome/e-mail de um super admin e redefinir senha pelo super admin.
- P1: Testar fluxos completos do studio (agenda, reservas, cupons, uploads). Storage init retorna 400 — verificar upload de galeria.
- P2: Proteção contra força bruta no login (bloqueio após 5 falhas).
- P2: Notificar admin em acesso de IP/navegador novo.
