# Studio Aurea - Test Credentials

## Super Admin (Master da Plataforma)
- **Email**: dvssystem@hotmail.com
- **Password**: Douglas0101
- **Role**: super_admin
- **Login tab**: Equipe (atalho: `/login?staff=1`)
- Acessa `/plataforma/studios` e `/minha-conta` (alterar senha + registro de acessos)
- Recuperar senha: `/esqueci-senha` → link aparece no log do backend (`grep 'PASSWORD RESET LINK' /var/log/supervisor/backend.*.log`)

## Manager (Gerente do Studio padrão)
- **Email**: gerente@studio.com
- **Password**: Studio@2026
- **Role**: manager
- **Login tab**: Equipe

## Client
- Registrar novo cliente em `/register` (telefone + senha)
