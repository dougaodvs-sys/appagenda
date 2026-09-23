# Studio Aurea - Test Credentials

## Super Admin (Master da Plataforma)
- **Email**: dvssystem@hotmail.com
- **Password**: Douglas0101
- **Role**: super_admin
- **Login tab**: Equipe (atalho: `/login?staff=1`)
- Acessa `/plataforma/studios`, `/plataforma/admins` (criar/remover super admins) e `/minha-conta` (alterar senha + registro de acessos)
- Recuperar senha: `/esqueci-senha` → e-mail real enviado (log: `Password reset e-mail sent to`)

## Manager (Meu Studio — primeiro studio real)
- **Email**: gerente@meustudio.com
- **Password**: Studio@2026
- **Role**: manager · slug `meu-studio` · link público `/studio/meu-studio`
- **Login tab**: Equipe

## Profissional (Meu Studio)
- **Email**: ana@meustudio.com · **Password**: Pro@2026xx · Serviço: Design de Sobrancelha (Seg–Sex 09–18h)

## Cliente (Meu Studio)
- **Telefone**: 11988887777 · **Password**: Cliente@2026 · aba "Sou cliente" (link `/login?studio=meu-studio`)

## Manager (Studio Aurea padrão) — senha do .env NÃO funciona mais (usuário alterou); redefinir via /plataforma/studios se necessário
- **Email**: gerente@studio.com
- **Password**: Studio@2026
- **Role**: manager
- **Login tab**: Equipe

## Client
- Registrar novo cliente em `/register` (telefone + senha)
