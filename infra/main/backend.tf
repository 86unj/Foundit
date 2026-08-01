# Remote state lives in the bucket created by ../bootstrap. The deploy IAM
# user (via FounditGroup -> FounditDeployPolicy) already has read/write on
# every object in this bucket, so no IAM change is needed for this state key.
#
# bucket/key/region are supplied via `-backend-config=backend.hcl` rather
# than hardcoded here — Terraform's `backend` block cannot reference
# variables, so this is the only way to make remote state per-deployer.
# Copy backend.hcl.example to backend.hcl (gitignored) and fill in your own
# values, then run `terraform init -backend-config=backend.hcl`.
terraform {
  backend "s3" {}
}
