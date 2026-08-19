output "ec2_public_ip" {
  description = "Elastic IP of the backend EC2 — use this for DNS and CORS config"
  value       = aws_eip.backend.public_ip
}

output "backend_api_url" {
  description = "Backend API base URL (HTTP — add HTTPS via Certbot after deploy)"
  value       = "http://${aws_eip.backend.public_ip}"
}

output "rds_endpoint" {
  description = "RDS PostgreSQL hostname (internal VPC only)"
  value       = aws_db_instance.postgres.address
  sensitive   = true
}

output "s3_bucket_name" {
  description = "S3 bucket for video/audio uploads"
  value       = aws_s3_bucket.uploads.bucket
}

output "ecr_backend_url" {
  description = "ECR repository URL for the backend image"
  value       = aws_ecr_repository.backend.repository_url
}

output "amplify_app_url" {
  description = "Amplify frontend URL (empty if github_access_token not set)"
  value       = local.create_amplify ? "https://${var.github_branch}.${aws_amplify_app.frontend[0].id}.amplifyapp.com" : "Not deployed — set github_access_token in terraform.tfvars"
  sensitive   = true
}

output "ssh_command" {
  description = "SSH command to access EC2"
  value       = "ssh -i ~/.ssh/${var.ec2_key_pair_name}.pem ec2-user@${aws_eip.backend.public_ip}"
}

output "next_steps" {
  description = "Post-deploy checklist"
  value       = <<-EOT
    ✅ Infrastructure ready. Next steps:

    1. Update SSM secrets (run once):
       aws ssm put-parameter --name "/${var.project_name}/${var.environment}/SECRET_KEY" \
           --value "$(openssl rand -hex 64)" --type SecureString --overwrite --region ${var.aws_region}
       aws ssm put-parameter --name "/${var.project_name}/${var.environment}/GEMINI_API_KEY" \
           --value "YOUR_GEMINI_API_KEY" --type SecureString --overwrite --region ${var.aws_region}

    2. Add GitHub Secrets for CI/CD:
       AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
       EC2_HOST = ${aws_eip.backend.public_ip}
       EC2_SSH_KEY = (contents of your PEM file)

    3. Update CORS after Amplify URL is known:
       aws ssm put-parameter --name "/${var.project_name}/${var.environment}/CORS_ALLOW_ORIGINS" \
           --value "https://YOUR_AMPLIFY_ID.amplifyapp.com" \
           --type String --overwrite --region ${var.aws_region}

    4. Enable HTTPS on EC2 (optional but recommended):
       ssh -i ~/.ssh/${var.ec2_key_pair_name}.pem ec2-user@${aws_eip.backend.public_ip}
       sudo certbot --nginx -d your-domain.com
  EOT
}
