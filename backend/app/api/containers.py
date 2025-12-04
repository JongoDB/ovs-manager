from fastapi import APIRouter, HTTPException, Depends
from typing import List
from sqlalchemy.orm import Session
from app.models.schemas import Container, VMInterface
from app.models.database import get_db, HostCache
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.ovsdb_service import OVSDBService
from app.services.port_mapping_service import PortMappingService
import os

router = APIRouter(prefix="/api/hosts/{host_id}/containers", tags=["containers"])

# Initialize the port mapping service
cache_dir = os.getenv("CACHE_DIR", "./cache")
port_mapping_service = PortMappingService(cache_dir=cache_dir)


@router.get("", response_model=List[Container])
async def get_containers(host_id: str, db: Session = Depends(get_db)):
    """Get all Proxmox containers for a host - uses cache if available, otherwise queries host"""
    try:
        # Check cache first
        cache_entry = db.query(HostCache).filter(
            HostCache.host_id == host_id,
            HostCache.cache_type == 'containers'
        ).first()
        
        containers = None
        if cache_entry and cache_entry.data:
            # Return cached data
            containers = [Container(**item) for item in cache_entry.data]
        else:
            # No cache, query host
            config = get_host_config(host_id, db)
            with SSHService(config) as ssh:
                ovsdb = OVSDBService(ssh)
                containers = ovsdb.get_containers()
                
                # Cache the results
                if containers:
                    # Delete old cache
                    db.query(HostCache).filter(
                        HostCache.host_id == host_id,
                        HostCache.cache_type == 'containers'
                    ).delete()
                    
                    # Create new cache entry
                    cache_entry = HostCache(
                        host_id=host_id,
                        cache_type='containers',
                        data=[c.dict() for c in containers]
                    )
                    db.add(cache_entry)
                    db.commit()
        
        # Enrich container interfaces with OVS bridge information from port mapping cache
        port_mapping = port_mapping_service.load_mapping(host_id)
        if port_mapping and 'ports' in port_mapping:
            # Build a map of container ID -> list of ports/interfaces
            container_ports_map = {}
            for port in port_mapping['ports']:
                if port.get('container_id') and port.get('port_name'):
                    container_id = port['container_id']
                    if container_id not in container_ports_map:
                        container_ports_map[container_id] = []
                    container_ports_map[container_id].append(port)
            
            # Enrich each container's interfaces with OVS data
            for container in containers:
                # Get ports for this container from port mapping
                container_ports = container_ports_map.get(container.ctid, [])
                
                if not container_ports:
                    # No ports found for this container in port mapping
                    continue
                
                # Create a map of existing interfaces by veth name
                existing_interfaces = {iface.tap: iface for iface in container.interfaces}
                
                # Add or update interfaces from port mapping (OVS bridges)
                # The port mapping has the authoritative data: port_name -> bridge_name, interface_netid, etc.
                for port in container_ports:
                    port_name = port.get('port_name')
                    bridge_name = port.get('bridge_name')
                    
                    if port_name and port_name.startswith('veth'):
                        # Get netid from port mapping (most accurate)
                        netid = port.get('interface_netid')
                        if not netid and port.get('interface_id') is not None:
                            netid = f"net{port.get('interface_id')}"
                        elif not netid:
                            # Fallback: extract from veth name (veth106i0 -> net0)
                            veth_parts = port_name.replace('veth', '').split('i')
                            if len(veth_parts) == 2:
                                netid = f"net{veth_parts[1]}"
                            else:
                                netid = 'unknown'
                        
                        # Check if interface already exists
                        if port_name in existing_interfaces:
                            # Update existing interface with OVS bridge info from port mapping
                            # Port mapping is authoritative - it knows which OVS bridge the port is on
                            if bridge_name:
                                existing_interfaces[port_name].bridge = bridge_name
                            # Update netid if it's more accurate from port mapping
                            if netid and netid != 'unknown':
                                existing_interfaces[port_name].netid = netid
                            # Update MAC if it's missing or empty
                            if not existing_interfaces[port_name].mac and port.get('interface_mac'):
                                existing_interfaces[port_name].mac = port.get('interface_mac')
                        else:
                            # Create new interface from port mapping (OVS bridge)
                            interface = VMInterface(
                                netid=netid,
                                tap=port_name,
                                mac=port.get('interface_mac') or '',
                                bridge=bridge_name
                            )
                            container.interfaces.append(interface)
                
                # Second pass: ensure all interfaces have bridge info from port mapping
                for interface in container.interfaces:
                    matching_port = next(
                        (p for p in container_ports if p.get('port_name') == interface.tap),
                        None
                    )
                    if matching_port:
                        # Port mapping is authoritative - use its bridge_name
                        bridge_name = matching_port.get('bridge_name')
                        if bridge_name:
                            interface.bridge = bridge_name
                        # Update netid if more accurate
                        netid = matching_port.get('interface_netid')
                        if netid and netid != 'unknown':
                            interface.netid = netid
                        # Update MAC if it's missing or empty
                        if not interface.mac and matching_port.get('interface_mac'):
                            interface.mac = matching_port.get('interface_mac')
        
        return containers
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get containers: {str(e)}")

