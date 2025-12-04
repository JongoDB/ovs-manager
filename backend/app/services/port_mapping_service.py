import json
import os
import re
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from app.services.ssh_service import SSHService
from app.models.schemas import HostConfig

logger = logging.getLogger(__name__)


class PortMappingService:
    """Service for mapping OVS ports to VMs and caching the results"""
    
    def __init__(self, cache_dir: str = "./cache"):
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)
    
    def get_cache_path(self, host_id: str) -> str:
        """Get the cache file path for a host"""
        return os.path.join(self.cache_dir, f"port_mapping_{host_id}.json")
    
    def parse_tap_name(self, tap_name: str) -> Optional[Dict[str, int]]:
        """Parse tap interface name to extract VM ID and interface ID
        Format: tap<VMID>i<INTERFACE_ID>
        Example: tap101i0 -> {vmid: 101, interface_id: 0}
        """
        match = re.match(r'^tap(\d+)i(\d+)$', tap_name)
        if match:
            return {
                'vmid': int(match.group(1)),
                'interface_id': int(match.group(2))
            }
        return None
    
    def build_port_mapping(self, ssh: SSHService, host_config: HostConfig) -> Dict:
        """Build port-to-VM mapping by querying OVS and Proxmox"""
        try:
            # Get all ports with their UUIDs
            stdout, stderr, exit_code = ssh.execute("ovs-vsctl list port")
            if exit_code != 0:
                logger.error(f"Failed to list ports: {stderr}")
                return {}
            
            ports_data = self._parse_port_list(stdout)
            
            # Get all bridges to map ports to bridges
            stdout, stderr, exit_code = ssh.execute("ovs-vsctl show")
            if exit_code != 0:
                logger.error(f"Failed to show bridges: {stderr}")
                return {}
            
            bridge_map, bridge_uuid_map = self._parse_bridge_port_mapping(stdout, ssh)
            
            # Get all VMs
            stdout, stderr, exit_code = ssh.execute("qm list")
            if exit_code != 0:
                logger.error(f"Failed to list VMs: {stderr}")
                return {}
            
            vms_data = self._parse_vm_list(stdout)
            
            # For each VM, get detailed interface info
            for vm in vms_data:
                vm_id = vm['vmid']
                stdout, stderr, exit_code = ssh.execute(f"qm show {vm_id}")
                if exit_code == 0:
                    interfaces = self._parse_vm_interfaces(stdout, vm_id)
                    vm['interfaces'] = interfaces
            
            # Get all containers (LXC)
            stdout, stderr, exit_code = ssh.execute("pct list")
            containers_data = []
            if exit_code == 0:
                containers_data = self._parse_container_list(stdout)
                logger.info(f"Found {len(containers_data)} containers")
                
                # For each container, get detailed interface info
                for container in containers_data:
                    ctid = container['ctid']
                    stdout, stderr, exit_code = ssh.execute(f"pct config {ctid}")
                    if exit_code == 0:
                        interfaces = self._parse_container_interfaces(stdout, ctid)
                        container['interfaces'] = interfaces
                        logger.debug(f"Container {ctid} has {len(interfaces)} interfaces: {interfaces}")
                    else:
                        logger.warning(f"Failed to get config for container {ctid}: {stderr}")
            else:
                logger.warning(f"Failed to list containers: {stderr}")
            
            # Build the mapping
            mapping = {
                'host_id': host_config.name,
                'hostname': host_config.hostname,
                'last_updated': datetime.utcnow().isoformat(),
                'ports': []
            }
            
            for port_name, port_uuid in ports_data.items():
                tap_info = self.parse_tap_name(port_name)
                bridge_name = bridge_map.get(port_name)
                if not bridge_name:
                    bridge_name = None  # Use None instead of 'unknown' to indicate missing data
                bridge_uuid = bridge_uuid_map.get(bridge_name) if bridge_name else None
                
                port_entry = {
                    'port_name': port_name,
                    'port_uuid': port_uuid,
                    'bridge_name': bridge_name,
                    'bridge_uuid': bridge_uuid,
                    'vm_id': None,
                    'vm_name': None,
                    'container_id': None,
                    'container_name': None,
                    'interface_id': None,
                    'interface_netid': None,
                    'interface_mac': None,
                    'is_container': False
                }
                
                # Check if it's a veth port (container interface)
                # Format: veth<CTID>i<INTERFACE_ID> (e.g., veth106i0)
                veth_match = re.match(r'^veth(\d+)i(\d+)$', port_name)
                if veth_match:
                    port_entry['is_container'] = True
                    ctid = int(veth_match.group(1))
                    interface_id = int(veth_match.group(2))
                    
                    # Find the container
                    container = next((c for c in containers_data if c['ctid'] == ctid), None)
                    if container:
                        port_entry['container_id'] = container['ctid']
                        port_entry['container_name'] = container['name']
                        port_entry['interface_id'] = interface_id
                        
                        # Find the interface details
                        interface = next(
                            (i for i in container.get('interfaces', []) 
                             if i.get('interface_id') == interface_id),
                            None
                        )
                        if interface:
                            port_entry['interface_netid'] = interface.get('netid')
                            port_entry['interface_mac'] = interface.get('mac')
                        else:
                            # Fallback: construct netid from interface_id
                            port_entry['interface_netid'] = f"net{interface_id}"
                        
                        logger.debug(f"Matched veth port {port_name} to container {ctid} ({container['name']})")
                    else:
                        logger.debug(f"Could not find container {ctid} for veth port {port_name}")
                elif port_name.startswith('veth'):
                    # Fallback: Try to find container by matching bridge and checking container configs
                    port_entry['is_container'] = True
                    matched = False
                    for container in containers_data:
                        container_interfaces = container.get('interfaces', [])
                        for iface in container_interfaces:
                            # If container interface is on the same bridge as this veth port,
                            # it's likely this container's interface
                            if iface.get('bridge') == bridge_name:
                                port_entry['container_id'] = container['ctid']
                                port_entry['container_name'] = container['name']
                                port_entry['interface_netid'] = iface.get('netid')
                                port_entry['interface_mac'] = iface.get('mac')
                                matched = True
                                logger.debug(f"Matched veth port {port_name} to container {container['ctid']} ({container['name']}) via bridge matching")
                                break
                        if matched:
                            break
                    if not matched:
                        logger.debug(f"Could not match veth port {port_name} on bridge {bridge_name} to any container")
                elif tap_info:
                    # Find the VM
                    vm = next((v for v in vms_data if v['vmid'] == tap_info['vmid']), None)
                    if vm:
                        port_entry['vm_id'] = vm['vmid']
                        port_entry['vm_name'] = vm['name']
                        port_entry['interface_id'] = tap_info['interface_id']
                        
                        # Find the interface details
                        interface = next(
                            (i for i in vm.get('interfaces', []) 
                             if i.get('interface_id') == tap_info['interface_id']),
                            None
                        )
                        if interface:
                            port_entry['interface_netid'] = interface.get('netid')
                            port_entry['interface_mac'] = interface.get('mac')
                
                mapping['ports'].append(port_entry)
            
            return mapping
            
        except Exception as e:
            logger.error(f"Error building port mapping: {e}")
            return {}
    
    def _parse_port_list(self, output: str) -> Dict[str, str]:
        """Parse ovs-vsctl list port output to get port name -> UUID mapping"""
        ports = {}
        current_uuid = None
        
        for line in output.split('\n'):
            line = line.strip()
            if line.startswith('_uuid'):
                parts = line.split(':', 1)
                if len(parts) == 2:
                    current_uuid = parts[1].strip()
            elif line.startswith('name') and current_uuid:
                parts = line.split(':', 1)
                if len(parts) == 2:
                    name = parts[1].strip().strip('"')
                    ports[name] = current_uuid
                    current_uuid = None
        
        return ports
    
    def _parse_bridge_port_mapping(self, output: str, ssh: SSHService) -> Tuple[Dict[str, str], Dict[str, str]]:
        """Parse ovs-vsctl show output to map port names to bridge names and get bridge UUIDs"""
        bridge_map = {}
        bridge_uuid_map = {}
        current_bridge = None
        bridges_seen = set()
        
        for line in output.split('\n'):
            line = line.strip()
            if 'Bridge' in line and '"' in line:
                # Extract bridge name
                parts = line.split('"')
                if len(parts) >= 2:
                    current_bridge = parts[1]
                    if current_bridge not in bridges_seen:
                        bridges_seen.add(current_bridge)
                        # Get bridge UUID
                        try:
                            uuid_stdout, _, _ = ssh.execute(f"ovs-vsctl get Bridge {current_bridge} _uuid")
                            bridge_uuid_map[current_bridge] = uuid_stdout.strip()
                        except:
                            bridge_uuid_map[current_bridge] = None
            elif 'Port' in line and '"' in line and current_bridge:
                # Extract port name
                parts = line.split('"')
                if len(parts) >= 2:
                    port_name = parts[1]
                    bridge_map[port_name] = current_bridge
        
        return bridge_map, bridge_uuid_map
    
    def _parse_vm_list(self, output: str) -> List[Dict]:
        """Parse qm list output"""
        vms = []
        lines = output.strip().split('\n')[1:]  # Skip header
        
        for line in lines:
            parts = line.split()
            if len(parts) >= 2:
                try:
                    vmid = int(parts[0])
                    name = parts[1]
                    status = parts[2] if len(parts) > 2 else "unknown"
                    vms.append({
                        'vmid': vmid,
                        'name': name,
                        'status': status,
                        'interfaces': []
                    })
                except (ValueError, IndexError):
                    continue
        
        return vms
    
    def _parse_vm_interfaces(self, output: str, vmid: int) -> List[Dict]:
        """Parse qm show output to get interface details"""
        interfaces = []
        # Format: net0: virtio=BC:24:11:1A:33:AB,bridge=vmbr0,firewall=1
        pattern = r'net(\d+):\s+\w+=([^,]+),bridge=([^,]+)'
        matches = re.findall(pattern, output)
        
        for netid, mac, bridge in matches:
            interface_id = int(netid)
            tap_name = f"tap{vmid}i{interface_id}"
            interfaces.append({
                'interface_id': interface_id,
                'netid': f"net{netid}",
                'tap': tap_name,
                'mac': mac,
                'bridge': bridge
            })
        
        return interfaces
    
    def _parse_container_list(self, output: str) -> List[Dict]:
        """Parse pct list output
        Format: VMID Status Lock Name
        Example: 106 running  sliver-client
        """
        containers = []
        lines = output.strip().split('\n')[1:]  # Skip header
        
        for line in lines:
            parts = line.split()
            if len(parts) >= 2:
                try:
                    ctid = int(parts[0])
                    status = parts[1] if len(parts) > 1 else "unknown"
                    
                    # Name is everything after status and lock
                    # Lock column might be empty, so name starts at parts[2] or later
                    if len(parts) >= 3:
                        # Skip lock column if it's "-" or empty, name starts at parts[2] or parts[3]
                        name_parts = []
                        for i in range(2, len(parts)):
                            if parts[i] != '-' and parts[i] != '':
                                name_parts.append(parts[i])
                        name = ' '.join(name_parts) if name_parts else f"CT{ctid}"
                    else:
                        name = f"CT{ctid}"
                    
                    if not name or name == '-' or name.strip() == '':
                        name = f"CT{ctid}"
                    
                    containers.append({
                        'ctid': ctid,
                        'name': name.strip(),
                        'status': status,
                        'interfaces': []
                    })
                except (ValueError, IndexError):
                    continue
        
        return containers
    
    def _parse_container_interfaces(self, output: str, ctid: int) -> List[Dict]:
        """Parse pct config output to get container interface details"""
        interfaces = []
        # Format can be:
        # net0: name=eth0,bridge=vmbr0,firewall=1,hwaddr=BC:24:11:1A:33:AB
        # net0: name=eth0,bridge=ovsbr1,firewall=1
        # Try multiple patterns to handle different formats
        patterns = [
            r'net(\d+):\s+name=([^,]+),bridge=([^,]+)(?:,hwaddr=([^,\s]+))?',
            r'net(\d+):\s+bridge=([^,]+)',
            r'net(\d+):\s+([^,]+),bridge=([^,]+)',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, output)
            if matches:
                for match in matches:
                    if len(match) >= 3:
                        netid = match[0]
                        name = match[1] if len(match) > 1 and '=' not in match[1] else f"eth{netid}"
                        bridge = match[2] if len(match) > 2 else match[1]
                        mac = match[3] if len(match) > 3 else ''
                        
                        # Avoid duplicates
                        if not any(i['interface_id'] == int(netid) for i in interfaces):
                            interfaces.append({
                                'interface_id': int(netid),
                                'netid': f"net{netid}",
                                'name': name,
                                'bridge': bridge,
                                'mac': mac if mac else ''
                            })
                break
        
        return interfaces
    
    
    def save_mapping(self, host_id: str, mapping: Dict) -> bool:
        """Save port mapping to cache file"""
        try:
            cache_path = self.get_cache_path(host_id)
            with open(cache_path, 'w') as f:
                json.dump(mapping, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Error saving port mapping: {e}")
            return False
    
    def load_mapping(self, host_id: str) -> Optional[Dict]:
        """Load port mapping from cache file"""
        try:
            cache_path = self.get_cache_path(host_id)
            if not os.path.exists(cache_path):
                return None
            
            with open(cache_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading port mapping: {e}")
            return None
    
    def refresh_mapping(self, host_id: str, ssh: SSHService, host_config: HostConfig) -> Dict:
        """Build and save a fresh port mapping"""
        mapping = self.build_port_mapping(ssh, host_config)
        if mapping:
            self.save_mapping(host_id, mapping)
        return mapping

