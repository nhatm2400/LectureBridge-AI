# Amplify is optional — only created if github_access_token is set.
# Create token at: https://github.com/settings/tokens (repo scope)
# Then add to terraform.tfvars: github_access_token = "ghp_..."

locals {
  create_amplify = var.github_access_token != ""
}

resource "aws_amplify_app" "frontend" {
  count        = local.create_amplify ? 1 : 0
  name         = "${local.name_prefix}-frontend"
  repository   = "https://github.com/${var.github_repo}"
  access_token = var.github_access_token

  build_spec = <<-YAML
    version: 1
    appRoot: src/frontend
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
  YAML

  environment_variables = {
    NEXT_PUBLIC_API_URL       = "http://${aws_eip.backend.public_ip}"
    AMPLIFY_MONOREPO_APP_ROOT = "src/frontend"
    NEXT_TELEMETRY_DISABLED   = "1"
  }

  custom_rule {
    source = "/<*>"
    target = "/index.html"
    status = "404-200"
  }

  tags = { Name = "${local.name_prefix}-amplify" }
}

resource "aws_amplify_branch" "main" {
  count       = local.create_amplify ? 1 : 0
  app_id      = aws_amplify_app.frontend[0].id
  branch_name = var.github_branch

  enable_auto_build           = true
  enable_pull_request_preview = false

  tags = { Name = "${local.name_prefix}-${var.github_branch}" }
}
