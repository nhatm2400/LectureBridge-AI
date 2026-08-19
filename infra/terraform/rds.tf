# RDS requires a subnet group spanning at least 2 AZs

resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = { Name = "${local.name_prefix}-db-subnet-group" }
}

resource "aws_db_instance" "postgres" {
  identifier = "${local.name_prefix}-postgres"

  # Free tier: db.t3.micro, 20GB gp2, single-AZ, no standby
  engine              = "postgres"
  engine_version      = "15"
  instance_class      = var.db_instance_class
  allocated_storage   = var.db_allocated_storage_gb
  storage_type        = "gp2"
  storage_encrypted   = true
  multi_az            = false # enable = ~$13/month extra
  publicly_accessible = false # only EC2 in same VPC can connect

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # Free tier restricts backup retention — 0 disables automated backups
  backup_retention_period = 0
  maintenance_window      = "Mon:03:00-Mon:04:00"

  # Set to true before destroying a production database
  skip_final_snapshot      = true
  delete_automated_backups = true

  tags = { Name = "${local.name_prefix}-postgres" }
}
