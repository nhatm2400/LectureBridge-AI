variable "aws_region" {
  description = "AWS region to deploy into (ap-southeast-1 = Singapore, closest to Vietnam)"
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Deployment environment label"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Prefix used for all resource names"
  type        = string
  default     = "lecturebridge"
}

# ── Networking ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "your_ip_cidr" {
  description = "Your public IP in CIDR notation for SSH access, e.g. '1.2.3.4/32'. Run: curl ifconfig.me"
  type        = string
}

# ── EC2 ───────────────────────────────────────────────────────────────────────

variable "ec2_instance_type" {
  description = "EC2 instance type (t3.micro = free tier in newer accounts)"
  type        = string
  default     = "t3.micro"
}

variable "ec2_key_pair_name" {
  description = "Name of an existing EC2 key pair for SSH access"
  type        = string
}

# ── RDS ───────────────────────────────────────────────────────────────────────

variable "db_instance_class" {
  description = "RDS instance class (db.t3.micro = free tier)"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "lecturebridge"
}

variable "db_username" {
  description = "PostgreSQL admin username"
  type        = string
  default     = "lecturebridge_user"
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL admin password (at least 16 characters, no @ or /)"
  type        = string
  sensitive   = true
}

variable "db_allocated_storage_gb" {
  description = "RDS allocated storage in GB (20 = free tier max)"
  type        = number
  default     = 20
}

# ── Amplify (frontend) ────────────────────────────────────────────────────────

variable "github_repo" {
  description = "GitHub repo in owner/name format, e.g. 'owner/LectureBridge'"
  type        = string
  default     = "owner/LectureBridge"
}

variable "github_access_token" {
  description = "GitHub Personal Access Token with repo scope (for Amplify). Store in tfvars, never commit."
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_branch" {
  description = "Branch to auto-deploy from"
  type        = string
  default     = "main"
}
