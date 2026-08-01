# Terraform remote state bucket.
# This bucket is consumed by the "main" infra stack's backend config
# (added in a later phase) — not by this bootstrap stack itself.
resource "aws_s3_bucket" "tfstate" {
  bucket = var.state_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# IAM (policies, the group, and foundit-user's group membership) is entirely
# out-of-band — created and attached by hand in the AWS console, never by
# Terraform. foundit-user must never hold any iam:* permission, so this
# stack cannot create or attach IAM resources itself. See README.md and
# policies/ for the policy documents used in that manual setup.
