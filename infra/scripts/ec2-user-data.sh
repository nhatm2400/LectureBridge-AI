#!/bin/bash
# EC2 bootstrap — runs once on first launch via user-data.
# Terraform template variables are substituted at apply time.
set -euo pipefail

log() { echo "[user-data] $*" | tee -a /var/log/lecturebridge-init.log; }

# ── System packages ───────────────────────────────────────────────────────────
log "Installing packages..."
dnf update -y
dnf install -y docker nginx certbot python3-certbot-nginx

# Docker Compose v2 plugin
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL \
  "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

systemctl enable --now docker
usermod -aG docker ec2-user

# ── Swap (2GB) — prevents OOM during Whisper transcription ───────────────────
log "Configuring swap..."
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ── App directory ─────────────────────────────────────────────────────────────
mkdir -p /opt/lecturebridge
chown ec2-user:ec2-user /opt/lecturebridge

# ── docker-compose.prod.yml ───────────────────────────────────────────────────
# ECR image URL is baked in by Terraform at apply time (not a runtime variable).
cat > /opt/lecturebridge/docker-compose.prod.yml << COMPOSE
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    image: ${ecr_backend_url}:latest
    restart: unless-stopped
    env_file: /opt/lecturebridge/.env.prod
    ports:
      - "8000:8000"
    volumes:
      - uploads_data:/app/data/uploads
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8000/api/health"]
      interval: 20s
      timeout: 5s
      retries: 5

  worker:
    image: ${ecr_backend_url}:latest
    restart: unless-stopped
    env_file: /opt/lecturebridge/.env.prod
    command: ["python", "-m", "src.backend.scripts.run_worker"]
    volumes:
      - uploads_data:/app/data/uploads
    depends_on:
      redis:
        condition: service_healthy

volumes:
  uploads_data:
COMPOSE

# ── Nginx reverse proxy config ────────────────────────────────────────────────
# Quoted heredoc ('NGINX') prevents shell from expanding $host, $remote_addr etc.
cat > /etc/nginx/conf.d/lecturebridge.conf << 'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 512M;
    proxy_read_timeout 300s;
    proxy_connect_timeout 10s;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
NGINX

systemctl enable --now nginx
nginx -t && systemctl reload nginx

# ── deploy.sh — called by CI/CD on every push ────────────────────────────────
cat > /opt/lecturebridge/deploy.sh << DEPLOY
#!/bin/bash
set -euo pipefail

SSM_REGION="${aws_region}"
ECR_REGISTRY="${ecr_registry}"
SSM_PREFIX="/${project_name}/prod"

get_ssm() {
  aws ssm get-parameter --name "\$1" --with-decryption \
    --region "\$SSM_REGION" --query "Parameter.Value" --output text 2>/dev/null || echo ""
}

# Refresh secrets from SSM on every deploy
cat > /opt/lecturebridge/.env.prod << ENV
ENVIRONMENT=production
JSON_LOGS=true
DATABASE_URL=${db_url}
REDIS_URL=redis://redis:6379/0
AWS_REGION=${aws_region}
AWS_S3_BUCKET=${s3_bucket}
SECRET_KEY=\$(get_ssm "\$SSM_PREFIX/SECRET_KEY")
GEMINI_API_KEY=\$(get_ssm "\$SSM_PREFIX/GEMINI_API_KEY")
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
AI_MODEL=gemini-2.5-flash
CORS_ALLOW_ORIGINS=\$(get_ssm "\$SSM_PREFIX/CORS_ALLOW_ORIGINS")
WHISPER_MODEL_SIZE=\$(get_ssm "\$SSM_PREFIX/WHISPER_MODEL_SIZE")
ENV

chmod 600 /opt/lecturebridge/.env.prod

# Pull and restart containers
aws ecr get-login-password --region "\$SSM_REGION" \
  | docker login --username AWS --password-stdin "\$ECR_REGISTRY"

docker compose -f /opt/lecturebridge/docker-compose.prod.yml pull backend worker
docker compose -f /opt/lecturebridge/docker-compose.prod.yml up -d
docker image prune -f

echo "Deploy complete at \$(date)"
DEPLOY

chmod +x /opt/lecturebridge/deploy.sh
chown ec2-user:ec2-user /opt/lecturebridge/deploy.sh

log "Bootstrap complete. Run /opt/lecturebridge/deploy.sh after first CI push."
log "Logs: tail -f /var/log/lecturebridge-init.log"
