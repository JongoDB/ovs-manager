from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from app.models.database import get_db, HostCache
from app.services.ssh_service import SSHService
from app.api.hosts import get_host_config
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hosts/{host_id}", tags=["vm-network"])


# Request Models
class AddVMNetworkDeviceRequest(BaseModel):
    vmid: int
    bridge: str
    model: str = "virtio"  # virtio, e1000, rtl8139, etc.
    firewall: bool = False
    macaddr: Optional[str] = None
    tag: Optional[int] = None  # VLAN tag
    rate: Optional[int] = None  # Rate limit in MB/s


class AddContainerNetworkDeviceRequest(BaseModel):
    ctid: int
    bridge: str
    name: Optional[str] = None  # Interface name inside container (e.g., eth1)
    firewall: bool = False
    hwaddr: Optional[str] = None  # MAC address
    tag: Optional[int] = None  # VLAN tag
    ip: Optional[str] = None  # IPv4 address (e.g., "dhcp" or "10.0.0.2/24")
    ip6: Optional[str] = None  # IPv6 address
    rate: Optional[int] = None  # Rate limit in MB/s


class RemoveNetworkDeviceRequest(BaseModel):
    device_id: str  # e.g., "net0", "net1"


# VM Network Device Endpoints
@router.post("/vms/{vmid}/network-devices")
async def add_vm_network_device(
    host_id: str,
    vmid: int,
    request: AddVMNetworkDeviceRequest,
    db: Session = Depends(get_db)
):
    """Add a network device to a VM"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            # Find the next available network device ID
            stdout, stderr, exit_code = ssh.execute(f"qm config {vmid} | grep '^net'")

            existing_devices = []
            if exit_code == 0 and stdout.strip():
                for line in stdout.strip().split('\n'):
                    if line.startswith('net'):
                        device_id = line.split(':')[0].replace('net', '')
                        existing_devices.append(int(device_id))

            # Find next available ID
            next_id = 0
            while next_id in existing_devices:
                next_id += 1

            # Build the network device configuration
            config_parts = [request.model]

            if request.macaddr:
                config_parts.append(f"macaddr={request.macaddr}")

            config_parts.append(f"bridge={request.bridge}")

            if request.firewall:
                config_parts.append("firewall=1")
            else:
                config_parts.append("firewall=0")

            if request.tag is not None:
                config_parts.append(f"tag={request.tag}")

            if request.rate is not None:
                config_parts.append(f"rate={request.rate}")

            net_config = ",".join(config_parts)

            # Execute the command
            cmd = f"qm set {vmid} -net{next_id} {net_config}"
            stdout, stderr, exit_code = ssh.execute(cmd)

            if exit_code != 0:
                raise HTTPException(status_code=500, detail=f"Failed to add network device: {stderr}")

            # Invalidate cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type.in_(['vms', 'bridges', 'ports'])
            ).delete()
            db.commit()

            return {
                "status": "success",
                "message": f"Network device net{next_id} added to VM {vmid}",
                "device_id": f"net{next_id}",
                "config": net_config
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding VM network device: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/vms/{vmid}/network-devices/{device_id}")
async def remove_vm_network_device(
    host_id: str,
    vmid: int,
    device_id: str,
    db: Session = Depends(get_db)
):
    """Remove a network device from a VM"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            # Remove the network device
            cmd = f"qm set {vmid} --delete {device_id}"
            stdout, stderr, exit_code = ssh.execute(cmd)

            if exit_code != 0:
                raise HTTPException(status_code=500, detail=f"Failed to remove network device: {stderr}")

            # Invalidate cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type.in_(['vms', 'bridges', 'ports'])
            ).delete()
            db.commit()

            return {
                "status": "success",
                "message": f"Network device {device_id} removed from VM {vmid}"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing VM network device: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Container Network Device Endpoints
@router.post("/containers/{ctid}/network-devices")
async def add_container_network_device(
    host_id: str,
    ctid: int,
    request: AddContainerNetworkDeviceRequest,
    db: Session = Depends(get_db)
):
    """Add a network device to a container"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            # Find the next available network device ID
            stdout, stderr, exit_code = ssh.execute(f"pct config {ctid} | grep '^net'")

            existing_devices = []
            if exit_code == 0 and stdout.strip():
                for line in stdout.strip().split('\n'):
                    if line.startswith('net'):
                        device_id = line.split(':')[0].replace('net', '')
                        existing_devices.append(int(device_id))

            # Find next available ID
            next_id = 0
            while next_id in existing_devices:
                next_id += 1

            # Build the network device configuration
            config_parts = []

            # Interface name inside container
            if request.name:
                config_parts.append(f"name={request.name}")
            else:
                config_parts.append(f"name=eth{next_id}")

            config_parts.append(f"bridge={request.bridge}")

            if request.hwaddr:
                config_parts.append(f"hwaddr={request.hwaddr}")

            if request.firewall:
                config_parts.append("firewall=1")
            else:
                config_parts.append("firewall=0")

            if request.tag is not None:
                config_parts.append(f"tag={request.tag}")

            if request.ip:
                config_parts.append(f"ip={request.ip}")

            if request.ip6:
                config_parts.append(f"ip6={request.ip6}")

            if request.rate is not None:
                config_parts.append(f"rate={request.rate}")

            config_parts.append("type=veth")

            net_config = ",".join(config_parts)

            # Execute the command
            cmd = f"pct set {ctid} -net{next_id} {net_config}"
            stdout, stderr, exit_code = ssh.execute(cmd)

            if exit_code != 0:
                raise HTTPException(status_code=500, detail=f"Failed to add network device: {stderr}")

            # Invalidate cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type.in_(['containers', 'bridges', 'ports'])
            ).delete()
            db.commit()

            return {
                "status": "success",
                "message": f"Network device net{next_id} added to container {ctid}",
                "device_id": f"net{next_id}",
                "config": net_config
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding container network device: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/containers/{ctid}/network-devices/{device_id}")
async def remove_container_network_device(
    host_id: str,
    ctid: int,
    device_id: str,
    db: Session = Depends(get_db)
):
    """Remove a network device from a container"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            # Remove the network device
            cmd = f"pct set {ctid} --delete {device_id}"
            stdout, stderr, exit_code = ssh.execute(cmd)

            if exit_code != 0:
                raise HTTPException(status_code=500, detail=f"Failed to remove network device: {stderr}")

            # Invalidate cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type.in_(['containers', 'bridges', 'ports'])
            ).delete()
            db.commit()

            return {
                "status": "success",
                "message": f"Network device {device_id} removed from container {ctid}"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing container network device: {e}")
        raise HTTPException(status_code=500, detail=str(e))
