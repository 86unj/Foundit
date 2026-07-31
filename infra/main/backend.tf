# Remote state lives in the bucket created by ../bootstrap. foundit-user
# (via FounditGroup -> FounditDeployPolicy) already has read/write on every
# object in this bucket, so no IAM change is needed for this new state key.
terraform {
  backend "s3" {
    bucket = "foundit-tfstate-688948287774"
    key    = "main/terraform.tfstate"
    region = "us-east-1"
  }
}
