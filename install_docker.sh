#!/bin/bash
# Docker Installation Script for Ubuntu 24.04

set -e

echo "=========================================="
echo "Docker Installation for OVS Manager"
echo "=========================================="
echo

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo:"
    echo "  sudo bash install_docker.sh"
    exit 1
fi

echo "Installing Docker..."

# Update package index
apt-get update -qq

# Install prerequisites
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Set up Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Add current user to docker group (if not root)
if [ -n "$SUDO_USER" ]; then
    usermod -aG docker $SUDO_USER
    echo
    echo "✅ Docker installed successfully!"
    echo
    echo "⚠️  IMPORTANT: You must logout and login again for group changes to take effect"
    echo
    echo "After logout/login, run:"
    echo "  cd /home/jon-dev/ovs-dev/ovs-manager"
    echo "  docker compose up --build"
else
    echo "✅ Docker installed successfully!"
fi

# Test Docker installation
docker --version
docker compose version

echo
echo "Installation complete!"
