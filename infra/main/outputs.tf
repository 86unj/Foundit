output "static_ip" {
  value = aws_lightsail_static_ip.app.ip_address
}

output "frontend_url" {
  value = "https://${var.frontend_domain}"
}

output "api_url" {
  value = "https://${var.api_domain}"
}

output "ssh_private_key_openssh" {
  value     = tls_private_key.deploy_ssh.private_key_openssh
  sensitive = true
}
