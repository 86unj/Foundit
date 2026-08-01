# SSH key pair used only by this instance. Terraform generates it — nobody's
# personal key is reused. The private key is stored in Terraform state and
# exposed via a sensitive output; see outputs.tf.
resource "tls_private_key" "deploy_ssh" {
  algorithm = "ED25519"
}

resource "aws_lightsail_key_pair" "app" {
  name       = "${var.project_name}-app-key"
  public_key = tls_private_key.deploy_ssh.public_key_openssh
}

resource "aws_lightsail_instance" "app" {
  name              = "${var.project_name}-app"
  availability_zone = "${var.aws_region}a"
  blueprint_id      = var.lightsail_blueprint_id
  bundle_id         = var.lightsail_bundle_id
  key_pair_name     = aws_lightsail_key_pair.app.name

  user_data = templatefile("${path.module}/templates/cloud-init.sh.tftpl", {
    frontend_domain           = var.frontend_domain
    api_domain                = var.api_domain
    letsencrypt_email         = var.letsencrypt_email
    github_repo_ssh_url       = var.github_repo_ssh_url
    github_deploy_key_private = var.github_deploy_key_private
    database_url              = var.database_url
    jwt_access_secret         = var.jwt_access_secret
    jwt_refresh_secret        = var.jwt_refresh_secret
    r2_bucket                 = var.r2_bucket
    r2_access_key_id          = var.r2_access_key_id
    r2_secret_access_key      = var.r2_secret_access_key
    r2_endpoint               = var.r2_endpoint
    r2_public_base_url        = var.r2_public_base_url
    smtp_host                 = var.smtp_host
    smtp_port                 = var.smtp_port
    smtp_user                 = var.smtp_user
    smtp_pass                 = var.smtp_pass
    openrouter_api_key        = var.openrouter_api_key
    cd_ssh_public_key         = var.cd_ssh_public_key
  })
}

resource "aws_lightsail_static_ip" "app" {
  name = "${var.project_name}-app-ip"
}

resource "aws_lightsail_static_ip_attachment" "app" {
  static_ip_name = aws_lightsail_static_ip.app.name
  instance_name  = aws_lightsail_instance.app.name

  # instance_name is a stable string ("foundit-app"), so Terraform doesn't
  # otherwise notice when the underlying instance gets replaced (its id
  # changes, name doesn't) — without this, AWS silently detaches the static
  # IP when the old instance is destroyed, and nothing re-attaches it.
  lifecycle {
    replace_triggered_by = [aws_lightsail_instance.app.id]
  }
}

resource "aws_lightsail_instance_public_ports" "app" {
  instance_name = aws_lightsail_instance.app.name

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
  }

  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
  }

  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
  }
}

# DNS records start unproxied (grey cloud) so certbot's HTTP-01 challenge on
# first boot hits the origin directly. Switch proxied to true later, once
# TLS is confirmed working, for Cloudflare's CDN/DDoS layer.
resource "cloudflare_record" "frontend" {
  zone_id = var.cloudflare_zone_id
  name    = var.frontend_domain
  type    = "A"
  content = aws_lightsail_static_ip.app.ip_address
  proxied = false
  ttl     = 300
}

resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = var.api_domain
  type    = "A"
  content = aws_lightsail_static_ip.app.ip_address
  proxied = false
  ttl     = 300
}
