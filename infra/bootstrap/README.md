# Bootstrap

One-time stack that creates:

- An S3 bucket (name set via `var.state_bucket_name`) for the main infra stack's Terraform remote state (versioned, encrypted, public access blocked).

That's the only thing this Terraform stack creates. Everything IAM-related — policies, the group, and the deploy IAM user's membership in it — is set up by hand in the AWS console, not by Terraform. See "Why IAM is manual" below.

## Deploying your own fork

This stack has no personal/account-specific defaults — copy
`terraform.tfvars.example` to `terraform.tfvars` (gitignored) and fill in your
own `aws_profile` and a globally-unique `state_bucket_name`.

The two policy documents in `policies/` use `"Resource": "*"` rather than
scoping to your bucket's ARN. That is a deliberate trade-off, not an
oversight: a bucket-scoped ARN would need to be hand-edited by every deployer
before it matches their own account, and this IAM user is dedicated to this
one project's AWS account anyway, so a wildcard resource on `s3:*` /
`lightsail:*` doesn't expand the blast radius beyond "this account". Tighten
it back to your bucket's ARN yourself if you'd rather keep least-privilege.

State for this stack itself is **local** (no S3 backend) — it creates the bucket that later stacks depend on, so it can't depend on that bucket itself.

## Why IAM is manual

The deploy IAM user (e.g. `foundit-user`) must never hold any `iam:*` permission — not permanently, not temporarily, not even scoped/conditioned. That's a hard constraint, not a convenience default: it means there is no "self-elevate, run Terraform, de-elevate" dance to reason about, and no self-escalation risk to guard against with IAM conditions. If that user never has IAM permissions in the first place, it can't grant itself more.

The consequence is that this Terraform stack cannot create or attach any IAM resource — `aws_iam_policy`, `aws_iam_group`, `aws_iam_group_policy_attachment`, `aws_iam_user_group_membership`, etc. are all off the table for a stack that runs as that user. So IAM setup is a manual, one-time console task performed by you under your own admin/root identity, using the policy documents in `policies/` as copy-paste source.

## IAM layout

- **`FounditBootstrapPolicy`** (`policies/foundit-bootstrap-policy.json`) — full S3 access. Used solely to let `terraform apply` in this stack create/configure the state bucket. No IAM permissions.
- **`FounditDeployPolicy`** (`policies/foundit-deploy-policy.json`) — day-to-day deploy policy: S3 object access plus `lightsail:*`. Used by the (separate, later) main infra stack to manage Lightsail. No IAM permissions.
- **`FounditGroup`** — IAM group with both policies attached. Your deploy user is a member of this group; it holds no policies directly.

(The policy/group/user names above are just examples used throughout this doc — name them however you like in your own console.)

Both policies are standalone (customer-managed), not inline — they're durable objects you create once and leave attached, not something created and deleted per bootstrap run.

## One-time manual setup (do this before running Terraform)

In the AWS console, under your own admin/root identity (not `foundit-user`):

1. IAM → Policies → Create policy → JSON tab → paste `policies/foundit-bootstrap-policy.json` → name it `FounditBootstrapPolicy` → create.
2. IAM → Policies → Create policy → JSON tab → paste `policies/foundit-deploy-policy.json` → name it `FounditDeployPolicy` → create.
3. IAM → User groups → Create group → name it `FounditGroup` → attach both `FounditBootstrapPolicy` and `FounditDeployPolicy` to it.
4. IAM → User groups → `FounditGroup` → Add users → add your deploy user (e.g. `foundit-user`).

This is a standing setup — once done, you don't undo any of it after running Terraform. There's no inline policy to delete and no attach/detach step, because that user never held elevated permissions to begin with.

## Running the bootstrap stack

Once the manual IAM setup above is done, copy `terraform.tfvars.example` to
`terraform.tfvars` and fill in your own `aws_profile` and `state_bucket_name`.
Your deploy user (via `FounditGroup` → `FounditBootstrapPolicy`) then has
exactly the S3 permissions needed to create the state bucket. Run, as
`AWS_PROFILE=<your aws_profile>`:

```bash
cd infra/bootstrap
terraform init
terraform plan
terraform apply
```

This creates only the S3 bucket. `FounditDeployPolicy` is not exercised by this stack — it's there for the main infra stack (Lightsail etc.) to use once that stack exists.
