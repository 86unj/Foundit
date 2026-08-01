variable "aws_profile" {
  description = "AWS CLI profile used to run this stack (elevated/admin identity only — see README)."
  type        = string
  default     = "foundit"
}

variable "aws_region" {
  description = "AWS region for the Terraform state bucket and all Foundit infra."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Globally-unique S3 bucket name for Terraform remote state."
  type        = string
  default     = "foundit-tfstate-688948287774"
}
