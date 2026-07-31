terraform {
  required_version = ">= 1.12"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Intentionally local state for the bootstrap stack.
  # This stack creates the S3 bucket that every other stack's remote
  # backend depends on, so it cannot depend on that bucket itself.
}

provider "aws" {
  profile = var.aws_profile
  region  = var.aws_region
}
