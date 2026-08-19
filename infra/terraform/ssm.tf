# SSM Parameter Store — secrets are stored here and read by EC2 at deploy time.
# After `terraform apply`, update these values via AWS Console or CLI:
#   aws ssm put-parameter --name "/lecturebridge/prod/SECRET_KEY" \
#       --value "$(openssl rand -hex 64)" --type SecureString --overwrite

locals {
  ssm_prefix = "/${var.project_name}/${var.environment}"
}

resource "aws_ssm_parameter" "secret_key" {
  name        = "${local.ssm_prefix}/SECRET_KEY"
  description = "FastAPI JWT signing key — replace placeholder before first deploy"
  type        = "SecureString"
  value       = "REPLACE_ME_run_openssl_rand_hex_64"

  lifecycle {
    # Prevent Terraform from overwriting after first deploy
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "gemini_api_key" {
  name        = "${local.ssm_prefix}/GEMINI_API_KEY"
  description = "Gemini API key for the OpenAI-compatible provider endpoint"
  type        = "SecureString"
  value       = "REPLACE_ME"

  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "cors_origins" {
  name        = "${local.ssm_prefix}/CORS_ALLOW_ORIGINS"
  description = "Comma-separated allowed CORS origins"
  type        = "String"
  value       = "https://${local.name_prefix}.amplifyapp.com"

  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "whisper_model_size" {
  name        = "${local.ssm_prefix}/WHISPER_MODEL_SIZE"
  description = "Faster-Whisper model size: tiny | base | small"
  type        = "String"
  value       = "base"
}
