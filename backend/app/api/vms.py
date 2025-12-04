from fastapi import APIRouter, HTTPException, Depends
from typing import List
from sqlalchemy.orm import Session
from app.models.schemas import VM, VMInterface
from app.models.database import get_db, HostCache
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.ovsdb_service import OVSDBService
from app.services.port_mapping_service import PortMappingService
import os

router = APIRouter(prefix="/api/hosts/{host_id}/vms", tags=["vms"])

# Initialize the port mapping service
cache_dir = os.getenv("CACHE_DIR", "./cache")
port_mapping_service = PortMappingService(cache_dir=cache_dir)


@router.get("", response_model=List[VM])
async def get_vms(host_id: str, db: Session = Depends(get_db)):
    """Get all Proxmox VMs for a host - uses cache if available, otherwise queries host"""
    try:
        # Check cache first
        cache_entry = db.query(HostCache).filter(
            HostCache.host_id == host_id,
            HostCache.cache_type == 'vms'
        ).first()
        
        vms = None
        if cache_entry and cache_entry.data:
            # Return cached data
            vms = [VM(**item) for item in cache_entry.data]
        else:
            # No cache, query host
            config = get_host_config(host_id, db)
            with SSHService(config) as ssh:
                ovsdb = OVSDBService(ssh)
                vms = ovsdb.get_vms()
                
                # Cache the results
                if vms:
                    # Delete old cache
                    db.query(HostCache).filter(
                        HostCache.host_id == host_id,
                        HostCache.cache_type == 'vms'
                    ).delete()
                    
                    # Create new cache entry
                    cache_entry = HostCache(
                        host_id=host_id,
                        cache_type='vms',
                        data=[v.dict() for v in vms]
                    )
                    db.add(cache_entry)
                    db.commit()
        
        # Enrich VM interfaces with OVS bridge information from port mapping cache
        # This is critical because qm show only shows Proxmox bridges, not OVS bridges
        # The port mapping cache has all OVS ports with their UUIDs, bridge info, and VM mappings
        port_mapping = port_mapping_service.load_mapping(host_id)
        if port_mapping and 'ports' in port_mapping:
            # Build a map of VM ID -> list of ports/interfaces
            vm_ports_map = {}
            for port in port_mapping['ports']:
                if port.get('vm_id') and port.get('port_name'):
                    vm_id = port['vm_id']
                    if vm_id not in vm_ports_map:
                        vm_ports_map[vm_id] = []
                    vm_ports_map[vm_id].append(port)
            
            # Enrich each VM's interfaces with OVS data
            for vm in vms:
                # Get ports for this VM from port mapping
                vm_ports = vm_ports_map.get(vm.vmid, [])
                
                if not vm_ports:
                    # No ports found for this VM in port mapping
                    continue
                
                # Create a map of existing interfaces by tap name (from qm show)
                existing_interfaces = {iface.tap: iface for iface in vm.interfaces}
                
                # Add or update interfaces from port mapping (OVS bridges)
                # The port mapping has the authoritative data: port_name -> bridge_name, interface_netid, etc.
                for port in vm_ports:
                    tap_name = port.get('port_name')
                    bridge_name = port.get('bridge_name')
                    
                    if tap_name and tap_name.startswith('tap'):
                        # Get netid from port mapping (most accurate)
                        netid = port.get('interface_netid')
                        if not netid and port.get('interface_id') is not None:
                            netid = f"net{port.get('interface_id')}"
                        elif not netid:
                            # Fallback: extract from tap name (tap100i2 -> net2)
                            tap_parts = tap_name.replace('tap', '').split('i')
                            if len(tap_parts) == 2:
                                netid = f"net{tap_parts[1]}"
                            else:
                                netid = 'unknown'
                        
                        # Check if interface already exists (from qm show)
                        if tap_name in existing_interfaces:
                            # Update existing interface with OVS bridge info from port mapping
                            # Port mapping is authoritative - it knows which OVS bridge the port is on
                            if bridge_name:
                                existing_interfaces[tap_name].bridge = bridge_name
                            # Update netid if it's more accurate from port mapping
                            if netid and netid != 'unknown':
                                existing_interfaces[tap_name].netid = netid
                            # Update MAC if it's missing or empty
                            if not existing_interfaces[tap_name].mac and port.get('interface_mac'):
                                existing_interfaces[tap_name].mac = port.get('interface_mac')
                        else:
                            # Create new interface from port mapping (OVS bridge)
                            # This handles interfaces that are on OVS bridges but not shown by qm show
                            interface = VMInterface(
                                netid=netid,
                                tap=tap_name,
                                mac=port.get('interface_mac') or '',
                                bridge=bridge_name
                            )
                            vm.interfaces.append(interface)
                
                # Second pass: ensure all interfaces have bridge info from port mapping
                # This catches any interfaces that might have been missed
                for interface in vm.interfaces:
                    matching_port = next(
                        (p for p in vm_ports if p.get('port_name') == interface.tap),
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
        
        return vms
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get VMs: {str(e)}")

