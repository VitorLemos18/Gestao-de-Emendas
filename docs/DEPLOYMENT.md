# Publicação na VPS

A implantação usa Docker Compose com três serviços: Angular/Nginx, API Spring Boot e PostgreSQL. O banco não publica porta na internet; a API só é alcançada pela rede interna do Compose. O Nginx entrega a interface, encaminha `/api/` e aplica HTTPS e cabeçalhos de segurança.

## Requisitos

- Ubuntu 24.04, Docker Engine e Docker Compose v2.
- Portas TCP 80 e 443 liberadas no firewall do sistema e do provedor.
- O IP público configurado na emissão do certificado deve permanecer apontado para esta VPS.
- Certbot 5.4 ou superior, pois o certificado público do Let's Encrypt para IP tem validade de seis dias e exige renovação automática.

## Primeira publicação

No servidor, crie `/var/www/certbot` e `/opt/gestao-emendas/.env`, com permissão `600`. Gere valores aleatórios longos para `DB_PASSWORD` e `BOOTSTRAP_ADMIN_PASSWORD`; preencha também e-mail e nome do primeiro administrador. Não reutilize a senha administrativa em outras contas.

```bash
cd /opt/gestao-emendas
sudo install -d -m 755 /var/www/certbot
sudo snap install certbot --classic
sudo ln -sf /snap/bin/certbot /usr/local/bin/certbot
docker compose -f compose.production.yml build backend
docker compose -f compose.production.yml build web
docker compose -f compose.certificate-bootstrap.yml up -d
sudo certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
  --preferred-profile shortlived --webroot --webroot-path /var/www/certbot \
  --ip-address 45.39.210.205
docker compose -f compose.certificate-bootstrap.yml down
docker compose -f compose.production.yml up -d
```

O serviço `web` só inicia com o certificado emitido. O perfil `shortlived` permite HTTPS confiável no navegador usando o próprio IP, sem domínio.

Depois que `/actuator/health` estiver saudável, confirme o primeiro acesso à API com `GET /api/v1/auth/csrf` e então `POST /api/v1/auth/login`. O bootstrap cria o primeiro administrador somente quando a base ainda não possui usuários e marca a conta para troca de senha no primeiro login. Assim que a conta existir, remova `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` e `BOOTSTRAP_ADMIN_PASSWORD` do `.env`, mantendo apenas `DB_PASSWORD`, e recrie a API:

```bash
docker compose -f compose.production.yml up -d --force-recreate backend
```

## Renovação e atualização

O timer do Certbot instalado pelo Snap verifica a renovação automaticamente. Após a emissão inicial, configure o deploy hook para recarregar o Nginx depois da renovação:

```bash
sudo certbot reconfigure --cert-name 45.39.210.205 \
  --preferred-profile shortlived --webroot --webroot-path /var/www/certbot \
  --ip-address 45.39.210.205 \
  --deploy-hook 'docker compose -f /opt/gestao-emendas/compose.production.yml exec -T web nginx -s reload'
```

Para publicar uma atualização versionada:

```bash
cd /opt/gestao-emendas
git pull --ff-only origin main
docker compose -f compose.production.yml build backend
docker compose -f compose.production.yml build web
docker compose -f compose.production.yml up -d
```

Confira `docker compose -f compose.production.yml ps` e os logs antes de considerar a atualização concluída. O volume `database` mantém os dados entre recriações dos contêineres. Faça e copie backups para fora da VPS antes de atualizações importantes; o volume local não protege contra perda da própria VPS.

## Acesso

Com o certificado e os serviços saudáveis, a interface ficará em `https://45.39.210.205/`. A API fica sob o mesmo endereço em `/api/v1`; Swagger está desativado em produção. O primeiro login exige troca de senha. O banco não é acessível externamente.
