import re
from typing import List, Dict, Any, Optional
from app.models.schemas import (
    Bridge, Port, Mirror, VM, VMInterface, Container,
    BridgeDetail, PortDetail, InterfaceDetail, InterfaceStats,
    BondStatus, LACPStatus
)
from app.services.ssh_service import SSHService
from app.models.schemas import HostConfig
import logging

logger = logging.getLogger(__name__)


class OVSDBService:
    """Service for querying and managing OVS databases via SSH"""
    
    def __init__(self, ssh_service: SSHService):
        self.ssh = ssh_service
    
    def get_bridges(self) -> List[Bridge]:
        """Get all OVS bridges with their ports"""
        try:
            stdout, stderr, exit_code = self.ssh.execute("ovs-vsctl show")
            if exit_code != 0:
                raise Exception(f"Failed to get bridges: {stderr}")

            bridges = self._parse_bridges(stdout)

            # Get all mirrors and associate them with their bridges
            mirrors = self.get_mirrors()
            for mirror in mirrors:
                # Find the bridge this mirror belongs to
                for bridge in bridges:
                    if bridge.name == mirror.bridge:
                        bridge.mirrors.append(mirror)
                        break

            return bridges
        except Exception as e:
            logger.error(f"Error getting bridges: {e}")
            return []
    
    def get_mirrors(self) -> List[Mirror]:
        """Get all OVS mirrors"""
        try:
            # Get mirror list
            stdout, stderr, exit_code = self.ssh.execute("ovs-vsctl list mirror")
            if exit_code != 0:
                return []
            
            # Get port information for mapping UUIDs to names
            ports_stdout, _, _ = self.ssh.execute("ovs-vsctl list port")
            port_map = self._parse_port_map(ports_stdout)
            
            # Get bridge-to-mirror mapping by listing all bridges
            # This ensures we get the correct bridge name for each mirror
            bridges_stdout, bridges_stderr, bridges_exit = self.ssh.execute("ovs-vsctl list bridge")
            if bridges_exit != 0:
                logger.error(f"Failed to list bridges: {bridges_stderr}")
                bridge_to_mirrors = {}
            else:
                bridge_to_mirrors = self._parse_bridge_mirrors(bridges_stdout)
                logger.info(f"Parsed {len(bridge_to_mirrors)} mirror-to-bridge mappings from bridge list")
            
            # Get bridge information for port-to-bridge mapping (for fallback)
            bridges_show_stdout, _, _ = self.ssh.execute("ovs-vsctl show")
            bridge_map = self._parse_bridge_map(bridges_show_stdout)
            
            return self._parse_mirrors(stdout, port_map, bridge_map, bridge_to_mirrors)
        except Exception as e:
            logger.error(f"Error getting mirrors: {e}")
            return []
    
    def get_vms(self) -> List[VM]:
        """Get all Proxmox VMs with their interfaces"""
        try:
            stdout, stderr, exit_code = self.ssh.execute("qm list")
            if exit_code != 0:
                return []
            
            vms = []
            lines = stdout.strip().split('\n')[1:]  # Skip header
            
            for line in lines:
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        vmid = int(parts[0])
                        name = parts[1]
                        status = parts[2] if len(parts) > 2 else "unknown"
                        
                        # Get interfaces for this VM
                        interfaces = self._get_vm_interfaces(vmid)
                        
                        vms.append(VM(
                            vmid=vmid,
                            name=name,
                            status=status,
                            interfaces=interfaces
                        ))
                    except (ValueError, IndexError):
                        continue
            
            return vms
        except Exception as e:
            logger.error(f"Error getting VMs: {e}")
            return []
    
    def get_containers(self) -> List[Container]:
        """Get all Proxmox containers (LXC) with their interfaces"""
        try:
            stdout, stderr, exit_code = self.ssh.execute("pct list")
            if exit_code != 0:
                return []
            
            containers = []
            lines = stdout.strip().split('\n')[1:]  # Skip header
            
            for line in lines:
                # Split by whitespace, but handle multiple spaces
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        ctid = int(parts[0])
                        status = parts[1] if len(parts) > 1 else "unknown"
                        
                        # Name is everything after status and lock
                        # Format: VMID Status Lock Name
                        # Lock column might be empty, so we need to find where name starts
                        # Common status values: running, stopped, paused, etc.
                        # If parts[2] is a known status value, it's actually the status and parts[3] is name
                        # Otherwise, parts[2] or later is the name
                        known_statuses = ['running', 'stopped', 'paused', 'unknown']
                        
                        if len(parts) >= 3:
                            # Check if parts[2] looks like a status (shouldn't happen, but handle it)
                            if parts[2] in known_statuses:
                                # parts[2] is status, name starts at parts[3]
                                name = ' '.join(parts[3:]) if len(parts) > 3 else f"CT{ctid}"
                            else:
                                # parts[2] is likely lock or name, name starts at parts[2]
                                # Skip if it's just "-" or empty
                                name_parts = []
                                for i in range(2, len(parts)):
                                    if parts[i] != '-' and parts[i] != '':
                                        name_parts.append(parts[i])
                                name = ' '.join(name_parts) if name_parts else f"CT{ctid}"
                        else:
                            name = f"CT{ctid}"
                        
                        if not name or name == '-' or name.strip() == '':
                            name = f"CT{ctid}"
                        
                        # Get interfaces for this container
                        interfaces = self._get_container_interfaces(ctid)
                        
                        containers.append(Container(
                            ctid=ctid,
                            name=name.strip(),
                            status=status,
                            interfaces=interfaces
                        ))
                    except (ValueError, IndexError) as e:
                        logger.debug(f"Error parsing container line '{line}': {e}")
                        continue
            
            return containers
        except Exception as e:
            logger.error(f"Error getting containers: {e}")
            return []
    
    def _get_container_interfaces(self, ctid: int) -> List[VMInterface]:
        """Get interfaces for a specific container"""
        try:
            stdout, stderr, exit_code = self.ssh.execute(f"pct config {ctid}")
            if exit_code != 0:
                return []
            
            interfaces = []
            # Parse interface information
            # Format: net0: name=eth0,bridge=ovsbr0,firewall=1,hwaddr=BC:24:11:1A:33:AB
            # or: net0: name=eth0,bridge=ovsbr0,firewall=1
            patterns = [
                r'net(\d+):\s+name=([^,]+),bridge=([^,]+)(?:,hwaddr=([^,\s]+))?',
                r'net(\d+):\s+bridge=([^,]+)',
                r'net(\d+):\s+([^,]+),bridge=([^,]+)',
            ]
            
            for pattern in patterns:
                matches = re.findall(pattern, stdout)
                if matches:
                    for match in matches:
                        if len(match) >= 2:
                            netid = match[0]
                            bridge = match[2] if len(match) > 2 else match[1]
                            mac = match[3] if len(match) > 3 else ''
                            
                            # Avoid duplicates
                            if not any(i.netid == f"net{netid}" for i in interfaces):
                                interfaces.append(VMInterface(
                                    netid=f"net{netid}",
                                    tap=f"veth{ctid}i{netid}",  # Container interfaces use veth
                                    mac=mac,
                                    bridge=bridge
                                ))
                    break
            
            return interfaces
        except Exception as e:
            logger.error(f"Error getting container interfaces for {ctid}: {e}")
            return []
    
    def _get_vm_interfaces(self, vmid: int) -> List[VMInterface]:
        """Get interfaces for a specific VM using qm config"""
        try:
            # Always use qm config - it works for both running and stopped VMs
            # and provides the configuration file format which is easier to parse
            stdout, stderr, exit_code = self.ssh.execute(f"qm config {vmid}")
            if exit_code != 0:
                logger.error(f"qm config failed for VM {vmid}: {stderr}")
                return []
            logger.debug(f"qm config output for VM {vmid}:\n{stdout}")

            interfaces = []
            # Parse interface information from qm config output
            # Format: net0: virtio=02:F6:B7:1D:8E:07,bridge=ovsbr2
            # Try multiple patterns to handle different formats
            patterns = [
                # Pattern 1: model=MAC,bridge=xxx or bridge=xxx,model=MAC
                r'net(\d+):\s+.*?bridge=([^,\s]+)',
                # Pattern 2: Strict MAC then bridge
                r'net(\d+):\s+\w+=([A-F0-9:]{17}),bridge=([^,]+)',
                # Pattern 3: MAC somewhere in line with bridge
                r'net(\d+):\s+[^,]*mac=([A-F0-9:]{17})[^,]*bridge=([^,]+)',
            ]

            logger.info(f"Parsing VM {vmid} interfaces from {len(stdout)} chars of output")
            logger.info(f"First 200 chars: {repr(stdout[:200])}")

            for i, pattern in enumerate(patterns):
                matches = re.findall(pattern, stdout, re.IGNORECASE)
                logger.info(f"Pattern {i+1} ({pattern}): found {len(matches)} matches")
                if matches:
                    for match in matches:
                        if len(match) >= 2:  # At least netid and bridge
                            netid = match[0]
                            # Pattern 1 has 2 groups (netid, bridge), others have 3 (netid, mac, bridge)
                            if len(match) == 2:
                                bridge = match[1]
                                mac = ''
                            else:
                                mac = match[1]
                                bridge = match[2]

                            # Try to extract MAC if not already found
                            if not mac or not re.match(r'^[A-F0-9:]{17}$', mac, re.IGNORECASE):
                                # Look for mac= or model=MAC in the same line
                                line_match = re.search(rf'net{netid}:[^\n]*?(?:mac=|virtio=|e1000=|[a-z]+\d*=)([A-F0-9:]{{17}})', stdout, re.IGNORECASE)
                                if line_match:
                                    mac = line_match.group(1)
                                else:
                                    mac = ''

                            tap_name = f"tap{vmid}i{netid}"
                            # Avoid duplicates
                            if not any(i.tap == tap_name for i in interfaces):
                                interfaces.append(VMInterface(
                                    netid=f"net{netid}",
                                    tap=tap_name,
                                    mac=mac,
                                    bridge=bridge
                                ))
                    break  # Use first pattern that matches
            
            return interfaces
        except Exception as e:
            logger.error(f"Error getting VM interfaces for {vmid}: {e}")
            return []
    
    def _parse_bridges(self, output: str) -> List[Bridge]:
        """Parse ovs-vsctl show output"""
        logger.info("=== _parse_bridges called ===")
        bridges = []
        current_bridge = None
        current_port = None

        for line in output.split('\n'):
            line = line.strip()
            if line.startswith('Bridge '):
                if current_bridge:
                    bridges.append(current_bridge)
                bridge_name = line.split()[-1].strip('"')
                current_bridge = Bridge(uuid="", name=bridge_name, ports=[], mirrors=[])
            elif line.startswith('Port ') and current_bridge:
                port_name = line.split()[-1].strip('"')
                current_port = Port(uuid="", name=port_name, bridge=current_bridge.name, interfaces=[])
                current_bridge.ports.append(current_port)
            elif line.startswith('Interface ') and current_port:
                iface_name = line.split()[-1].strip('"')
                current_port.interfaces.append({"name": iface_name})

        if current_bridge:
            bridges.append(current_bridge)

        # Get UUIDs and CIDR for bridges
        # First, get CIDR information from /etc/network/interfaces
        bridge_cidr_map = self._get_bridge_cidr_from_interfaces()

        for bridge in bridges:
            try:
                stdout, _, _ = self.ssh.execute(f"ovs-vsctl get Bridge {bridge.name} _uuid")
                bridge.uuid = stdout.strip()

                # Get CIDR from /etc/network/interfaces if available
                if bridge.name in bridge_cidr_map:
                    bridge.cidr = bridge_cidr_map[bridge.name]
                    logger.debug(f"Found CIDR for bridge {bridge.name} from /etc/network/interfaces: {bridge.cidr}")
            except:
                pass

        # Get interface types for all ports
        # Query all interfaces at once to get their types
        try:
            stdout, stderr, exit_code = self.ssh.execute("ovs-vsctl --columns=name,type list interface")
            if exit_code == 0:
                interface_types = self._parse_interface_types(stdout)
                logger.info(f"Parsed {len(interface_types)} interface types: {interface_types}")

                # Apply types to port interfaces
                for bridge in bridges:
                    for port in bridge.ports:
                        # Determine port type based on its interfaces
                        # If port has one interface, use that interface's type
                        # If port has multiple interfaces, it's likely a bond
                        if port.interfaces:
                            primary_iface_name = port.interfaces[0].get('name', '')
                            iface_type = interface_types.get(primary_iface_name, 'unknown')

                            # Set port type based on interface type
                            # OVS interface types: system, internal, tap, patch, tunnel types (vxlan, gre, geneve, etc), dpdk
                            port.type = iface_type
                            logger.debug(f"Port {port.name}: type={iface_type} (interface={primary_iface_name})")

                            # Also add type to each interface
                            for iface in port.interfaces:
                                iface_name = iface.get('name', '')
                                iface['type'] = interface_types.get(iface_name, 'unknown')
        except Exception as e:
            logger.warning(f"Failed to get interface types: {e}")
            import traceback
            logger.warning(f"Traceback: {traceback.format_exc()}")

        return bridges

    def _parse_interface_types(self, output: str) -> Dict[str, str]:
        """Parse interface types from 'ovs-vsctl list interface' output"""
        interface_types = {}
        current_name = None

        logger.debug(f"Parsing interface types from output length: {len(output)}")

        for line in output.split('\n'):
            line = line.strip()
            if line.startswith('name'):
                # name : "tap107i0"
                parts = line.split(':', 1)
                if len(parts) == 2:
                    current_name = parts[1].strip().strip('"')
                    logger.debug(f"Found interface name: {current_name}")
            elif line.startswith('type') and current_name:
                # type : ""  or  type : "vxlan"
                parts = line.split(':', 1)
                if len(parts) == 2:
                    type_value = parts[1].strip().strip('"')
                    original_type = type_value
                    # Empty type means "system" or "internal" - we'll determine based on port name
                    if not type_value:
                        # If it's a tap/veth interface, mark it as such for clarity
                        if current_name.startswith('tap'):
                            type_value = 'tap'
                        elif current_name.startswith('veth'):
                            type_value = 'veth'
                        else:
                            # Default empty type - could be system or internal
                            type_value = 'system'
                    interface_types[current_name] = type_value
                    logger.debug(f"Interface {current_name}: type='{original_type}' -> '{type_value}'")
                    current_name = None

        return interface_types
    
    def _get_bridge_cidr_from_interfaces(self) -> Dict[str, str]:
        """Parse /etc/network/interfaces to get CIDR for each OVS bridge"""
        bridge_cidr_map = {}
        try:
            stdout, stderr, exit_code = self.ssh.execute("cat /etc/network/interfaces")
            if exit_code != 0:
                logger.warning(f"Failed to read /etc/network/interfaces: {stderr}")
                return bridge_cidr_map
            
            lines = stdout.split('\n')
            
            # Look for OVS bridge configurations
            # Format example:
            # iface ovsbr0 inet static
            #     address 10.10.10.1/24
            #     ovs_type OVSBridge
            #     ovs_ports ...
            
            for i, line in enumerate(lines):
                line = line.strip()
                # Skip comments and empty lines
                if not line or line.startswith('#'):
                    continue
                
                # Look for: iface <bridge_name> inet static/manual
                iface_match = re.search(r'iface\s+(\w+)\s+inet\s+\w+', line, re.IGNORECASE)
                if iface_match:
                    bridge_name = iface_match.group(1)
                    # Check next lines for address with CIDR
                    for j in range(i + 1, min(i + 15, len(lines))):  # Check next 15 lines
                        next_line = lines[j].strip()
                        if not next_line or next_line.startswith('#'):
                            continue
                        
                        # Stop if we hit another iface or auto line (new section)
                        if next_line.startswith('iface ') or next_line.startswith('auto '):
                            break
                        
                        # Look for address with CIDR notation: address 10.10.10.1/24
                        addr_match = re.search(r'address\s+(\d+\.\d+\.\d+\.\d+)/(\d+)', next_line, re.IGNORECASE)
                        if addr_match:
                            ip = addr_match.group(1)
                            prefix = addr_match.group(2)
                            ip_octets = ip.split('.')
                            
                            if len(ip_octets) == 4:
                                # Convert IP address to network CIDR
                                # For /24: 10.10.10.1 -> 10.10.10.0/24
                                # For /16: 10.10.1.1 -> 10.10.0.0/16
                                # For /8: 10.1.1.1 -> 10.0.0.0/8
                                prefix_int = int(prefix)
                                if prefix_int == 24:
                                    network = f"{ip_octets[0]}.{ip_octets[1]}.{ip_octets[2]}.0/{prefix}"
                                elif prefix_int == 16:
                                    network = f"{ip_octets[0]}.{ip_octets[1]}.0.0/{prefix}"
                                elif prefix_int == 8:
                                    network = f"{ip_octets[0]}.0.0.0/{prefix}"
                                else:
                                    # For other prefixes, calculate network address
                                    # Simple approach: use the IP as-is for now
                                    # In production, you'd want proper network calculation
                                    network = f"{ip}/{prefix}"
                                
                                bridge_cidr_map[bridge_name] = network
                                logger.debug(f"Found CIDR {network} for bridge {bridge_name} from /etc/network/interfaces")
                                break
        
        except Exception as e:
            logger.error(f"Error parsing /etc/network/interfaces: {e}")
        
        return bridge_cidr_map
    
    def _parse_port_map(self, output: str) -> Dict[str, str]:
        """Parse port list to create UUID to name mapping"""
        port_map = {}
        current_uuid = None
        
        for line in output.split('\n'):
            line = line.strip()
            if line.startswith('_uuid'):
                current_uuid = line.split(':')[1].strip()
            elif line.startswith('name') and current_uuid:
                name = line.split(':')[1].strip()
                port_map[current_uuid] = name
        
        return port_map
    
    def _parse_bridge_map(self, output: str) -> Dict[str, str]:
        """Parse bridge show to create tap to bridge mapping"""
        bridge_map = {}
        current_bridge = None
        
        for line in output.split('\n'):
            line = line.strip()
            if "Bridge" in line:
                current_bridge = line.split()[-1].strip('"')
            elif current_bridge and "Port" in line:
                # Match any port, not just tap ports
                port_name = line.split()[-1].strip('"')
                bridge_map[port_name] = current_bridge
        
        return bridge_map
    
    def _parse_bridge_mirrors(self, output: str) -> Dict[str, str]:
        """Parse bridge list to create mirror UUID to bridge name mapping"""
        mirror_to_bridge = {}
        current_bridge = None
        current_bridge_uuid = None
        
        # Split output by empty lines to separate bridge entries
        bridge_blocks = []
        current_block = []
        
        for line in output.split('\n'):
            line = line.strip()
            if not line:
                if current_block:
                    bridge_blocks.append('\n'.join(current_block))
                    current_block = []
            else:
                current_block.append(line)
        
        # Add last block
        if current_block:
            bridge_blocks.append('\n'.join(current_block))
        
        # Parse each bridge block
        for block in bridge_blocks:
            current_bridge = None
            for line in block.split('\n'):
                line = line.strip()
                if line.startswith('name'):
                    # Extract bridge name
                    parts = line.split(':', 1)
                    if len(parts) == 2:
                        current_bridge = parts[1].strip().strip('"')
                        logger.debug(f"Found bridge: {current_bridge}")
                elif 'mirrors' in line.lower() and current_bridge:
                    # Extract mirror UUIDs from mirrors field
                    # Format: mirrors: [uuid1 uuid2] or mirrors: set([uuid1, uuid2])
                    uuid_pattern = r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
                    mirror_uuids = re.findall(uuid_pattern, line)
                    for mirror_uuid in mirror_uuids:
                        mirror_to_bridge[mirror_uuid] = current_bridge
                        logger.info(f"Found mirror {mirror_uuid} on bridge {current_bridge}")
        
        logger.info(f"Parsed {len(mirror_to_bridge)} mirror-to-bridge mappings: {mirror_to_bridge}")
        return mirror_to_bridge
    
    def _parse_mirrors(self, output: str, port_map: Dict[str, str], bridge_map: Dict[str, str], bridge_to_mirrors: Dict[str, str]) -> List[Mirror]:
        """Parse mirror list output"""
        mirrors = []
        current_mirror = {}
        
        for line in output.split('\n'):
            line = line.strip()
            if line.startswith('_uuid'):
                if current_mirror:
                    mirrors.append(self._create_mirror_object(current_mirror, port_map, bridge_map, bridge_to_mirrors))
                current_mirror = {'uuid': line.split(':')[1].strip()}
            elif ':' in line:
                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()
                if key in ['name', 'output_port', 'select_src_port', 'select_dst_port', 'output_vlan', 'select_all']:
                    current_mirror[key] = value
        
        if current_mirror:
            mirrors.append(self._create_mirror_object(current_mirror, port_map, bridge_map, bridge_to_mirrors))
        
        return mirrors
    
    def _create_mirror_object(self, mirror_data: Dict, port_map: Dict[str, str], bridge_map: Dict[str, str], bridge_to_mirrors: Dict[str, str]) -> Mirror:
        """Create Mirror object from parsed data"""
        mirror_uuid = mirror_data.get('uuid', '').strip()
        output_port_uuid = mirror_data.get('output_port', '').strip('[]')
        src_port_uuid = mirror_data.get('select_src_port', '').strip('[]')
        
        output_port = port_map.get(output_port_uuid, '')
        src_port = port_map.get(src_port_uuid, '')
        
        logger.debug(f"Creating mirror object for UUID: {mirror_uuid}")
        logger.debug(f"  Source port UUID: {src_port_uuid} -> {src_port}")
        logger.debug(f"  Output port UUID: {output_port_uuid} -> {output_port}")
        logger.debug(f"  Available bridge-to-mirrors mappings: {list(bridge_to_mirrors.keys())}")
        
        # First, try to get bridge name from bridge-to-mirrors mapping (most accurate)
        bridge_name = bridge_to_mirrors.get(mirror_uuid)
        
        # Fallback to port-based lookup if not found
        if not bridge_name:
            bridge_name = bridge_map.get(src_port) or bridge_map.get(output_port) or "unknown"
            logger.warning(f"Mirror {mirror_uuid} bridge not found in bridge list, using port-based lookup: {bridge_name}")
            logger.warning(f"  Source port '{src_port}' maps to bridge: {bridge_map.get(src_port)}")
            logger.warning(f"  Output port '{output_port}' maps to bridge: {bridge_map.get(output_port)}")
        else:
            logger.info(f"Mirror {mirror_uuid} is on bridge {bridge_name} (from bridge list)")
        
        # Parse select_all (it's a boolean in OVS, comes as "true" or "false" string)
        select_all_str = mirror_data.get('select_all', 'false').strip().lower()
        select_all = select_all_str == 'true'

        return Mirror(
            uuid=mirror_uuid,
            name=mirror_data.get('name', ''),
            bridge=bridge_name,
            select_src_port=[src_port] if src_port else None,
            select_dst_port=[src_port] if src_port else None,
            output_port=output_port,
            select_all=select_all
        )
    
    def create_mirror(self, bridge_name: str, mirror_name: str, mode: str, source_ports: Optional[List[str]] = None, output_port: str = None) -> bool:
        """Create a new OVS mirror
        
        Args:
            bridge_name: Name of the bridge
            mirror_name: Name for the mirror
            mode: 'manual' or 'dynamic'
            source_ports: List of source ports (for manual mode)
            output_port: Output port name
        """
        try:
            if not output_port:
                logger.error("Output port is required")
                return False
            
            # Get bridge UUID
            bridge_uuid_stdout, _, _ = self.ssh.execute(f"ovs-vsctl get Bridge {bridge_name} _uuid")
            bridge_uuid = bridge_uuid_stdout.strip()
            
            # Get output port UUID
            monitor_uuid_stdout, _, _ = self.ssh.execute(f"ovs-vsctl get Port {output_port} _uuid")
            monitor_uuid = monitor_uuid_stdout.strip()
            
            if mode == 'dynamic':
                # Dynamic mode: use select-all=true
                command = f"""ovs-vsctl -- \
                    --id=@p get Port {output_port} \
                    -- --id=@m create Mirror name={mirror_name} select-all=true output-port=@p \
                    -- add Bridge {bridge_name} mirrors @m"""
            else:
                # Manual mode: use selected source ports
                if not source_ports or len(source_ports) == 0:
                    logger.error("Manual mode requires at least one source port")
                    return False
                
                # Build command with multiple source ports
                # For multiple ports, we need to reference them as a set
                if len(source_ports) == 1:
                    # Single port - simple case
                    command = f"""ovs-vsctl -- \
                        --id=@src get Port {source_ports[0]} \
                        -- --id=@out get Port {output_port} \
                        -- --id=@m create Mirror name={mirror_name} \
                            select-src-port=@src select-dst-port=@src \
                            output-port=@out \
                        -- add Bridge {bridge_name} mirrors @m"""
                else:
                    # Multiple ports - need to build set references
                    port_refs = []
                    for i, port in enumerate(source_ports):
                        port_refs.append(f"--id=@src{i} get Port {port}")
                    
                    # Create select-src-port and select-dst-port references as a set
                    # OVS uses space-separated references for sets
                    src_refs = " ".join([f"@src{i}" for i in range(len(source_ports))])
                    
                    # Build the full command
                    port_refs_str = " \\\n                    ".join(port_refs)
                    command = f"""ovs-vsctl -- \
                        {port_refs_str} \
                        -- --id=@out get Port {output_port} \
                        -- --id=@m create Mirror name={mirror_name} \
                            select-src-port={{{src_refs}}} select-dst-port={{{src_refs}}} \
                            output-port=@out \
                        -- add Bridge {bridge_name} mirrors @m"""
            
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to create mirror: {stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Error creating mirror: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def clear_bridge_mirrors(self, bridge_name: str) -> bool:
        """Clear all mirrors from a bridge"""
        try:
            command = f"ovs-vsctl clear bridge {bridge_name} mirrors"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to clear bridge mirrors: {stderr}")
                return False
            logger.info(f"Successfully cleared all mirrors from bridge {bridge_name}")
            return True
        except Exception as e:
            logger.error(f"Error clearing bridge mirrors: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def get_mirror_statistics(self, mirror_name: str) -> Dict[str, Any]:
        """Get statistics for a mirror"""
        try:
            command = f"ovs-vsctl get Mirror {mirror_name} statistics"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to get mirror statistics: {stderr}")
                return {}
            
            # Parse the statistics output
            # Format is typically: {key1=value1, key2=value2, ...}
            stats = {}
            output = stdout.strip()
            if output.startswith('{') and output.endswith('}'):
                # Remove braces
                content = output[1:-1]
                # Parse key=value pairs
                for pair in content.split(','):
                    pair = pair.strip()
                    if '=' in pair:
                        key, value = pair.split('=', 1)
                        key = key.strip()
                        value = value.strip()
                        # Try to convert to number if possible
                        try:
                            if '.' in value:
                                stats[key] = float(value)
                            else:
                                stats[key] = int(value)
                        except ValueError:
                            stats[key] = value
            else:
                # If not in expected format, return raw output
                stats['raw'] = output
            
            return stats
        except Exception as e:
            logger.error(f"Error getting mirror statistics: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {}
    
    def delete_mirror(self, bridge_name: str, mirror_uuid: str) -> bool:
        """Delete an OVS mirror using the specified approach:
        1. List bridge to determine which bridges have mirrors and grab appropriate mirror uuid
        2. Remove mirror using: ovs-vsctl remove bridge <bridgename> mirrors <uuid>
        """
        try:
            # Step 1: List bridge to determine which bridges have mirrors and get mirror UUID
            logger.info(f"Listing bridge {bridge_name} to verify mirror {mirror_uuid} exists")
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl list bridge {bridge_name}")
            
            if exit_code != 0:
                logger.error(f"Failed to list bridge {bridge_name}: {stderr}")
                return False
            
            # Parse the bridge output to find mirrors
            # The mirrors field can be in formats like:
            # mirrors: [uuid1 uuid2]
            # mirrors: set([uuid1, uuid2])
            uuid_pattern = r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
            mirrors_found = re.findall(uuid_pattern, stdout)
            
            # Verify the mirror UUID exists in the bridge's mirrors
            if mirror_uuid in mirrors_found:
                logger.info(f"Verified mirror UUID {mirror_uuid} exists in bridge {bridge_name}")
            else:
                logger.warning(f"Mirror UUID {mirror_uuid} not found in bridge {bridge_name} mirrors list")
                logger.debug(f"Found mirrors in bridge: {mirrors_found}")
                # Still try to delete it - the UUID might be correct even if parsing failed
            
            # Step 2: Remove mirror using the exact command format specified
            logger.info(f"Removing mirror {mirror_uuid} from bridge {bridge_name}")
            command = f"ovs-vsctl remove bridge {bridge_name} mirrors {mirror_uuid}"
            stdout, stderr, exit_code = self.ssh.execute(command)
            
            if exit_code != 0:
                logger.error(f"Failed to delete mirror: {stderr}")
                logger.error(f"Command: {command}")
                logger.error(f"Exit code: {exit_code}")
                logger.error(f"Stdout: {stdout}")
                return False
            
            logger.info(f"Successfully deleted mirror {mirror_uuid} from bridge {bridge_name}")
            return True

        except Exception as e:
            logger.error(f"Error deleting mirror: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False

    # ======================
    # Bridge Management
    # ======================

    def _validate_ip_address(self, ip: str, is_ipv6: bool = False) -> bool:
        """Validate IP address format (IPv4 or IPv6)"""
        import ipaddress
        try:
            if is_ipv6:
                ipaddress.IPv6Address(ip)
            else:
                ipaddress.IPv4Address(ip)
            return True
        except (ipaddress.AddressValueError, ValueError):
            return False

    def _validate_cidr(self, cidr: str, is_ipv6: bool = False) -> bool:
        """Validate CIDR notation (IP/prefix)"""
        import ipaddress
        try:
            if is_ipv6:
                ipaddress.IPv6Network(cidr, strict=False)
            else:
                ipaddress.IPv4Network(cidr, strict=False)
            return True
        except (ipaddress.AddressValueError, ipaddress.NetmaskValueError, ValueError):
            return False

    def _check_existing_gateway(self) -> Optional[str]:
        """Check if a default gateway already exists in network configuration.
        Returns the interface name that has a gateway, or None if no gateway exists."""
        try:
            # Read /etc/network/interfaces
            stdout, stderr, exit_code = self.ssh.execute("cat /etc/network/interfaces")
            if exit_code != 0:
                logger.warning(f"Could not read network interfaces: {stderr}")
                return None

            lines = stdout.split('\n')
            current_iface = None

            for line in lines:
                line = line.strip()

                # Track which interface we're currently in
                if line.startswith('iface '):
                    parts = line.split()
                    if len(parts) >= 2:
                        current_iface = parts[1]

                # Check for gateway line
                if line.startswith('gateway ') and current_iface:
                    # Found a gateway - return the interface it belongs to
                    return current_iface

            return None
        except Exception as e:
            logger.warning(f"Error checking for existing gateway: {e}")
            return None

    def create_bridge(self, name: str, fail_mode: str = "standalone", datapath_type: str = "system",
                     ipv4_cidr: str = None, ipv4_gateway: str = None,
                     ipv6_cidr: str = None, ipv6_gateway: str = None,
                     bridge_ports: str = None, autostart: bool = True,
                     ovs_options: str = None, comment: str = None, mtu: int = 1500) -> bool:
        """Create a new OVS bridge with Proxmox network configuration"""
        try:
            # Validate bridge name (Proxmox naming rules)
            if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', name):
                raise ValueError(
                    f"Invalid bridge name '{name}'. Bridge names must start with a letter "
                    f"and can only contain letters, numbers, and underscores. "
                    f"No hyphens or special characters allowed. "
                    f"Examples: vmbr1, ovsbr0, mybridge_1"
                )

            # Validate IPv4 CIDR format if provided
            if ipv4_cidr:
                if not self._validate_cidr(ipv4_cidr, is_ipv6=False):
                    raise ValueError(
                        f"Invalid IPv4 CIDR format '{ipv4_cidr}'. "
                        f"Must be in format: 192.168.1.1/24 or 10.0.0.1/8"
                    )

            # Validate IPv4 gateway format if provided
            if ipv4_gateway:
                if not self._validate_ip_address(ipv4_gateway, is_ipv6=False):
                    raise ValueError(
                        f"Invalid IPv4 gateway address '{ipv4_gateway}'. "
                        f"Must be a valid IPv4 address like 192.168.1.254"
                    )

                # Check if a default gateway already exists
                existing_gateway = self._check_existing_gateway()
                if existing_gateway:
                    raise ValueError(
                        f"Default gateway already exists on interface '{existing_gateway}'. "
                        f"Remove the gateway parameter or delete the existing gateway first. "
                        f"Multiple default gateways cause routing conflicts."
                    )

            # Validate IPv6 CIDR format if provided
            if ipv6_cidr:
                if not self._validate_cidr(ipv6_cidr, is_ipv6=True):
                    raise ValueError(
                        f"Invalid IPv6 CIDR format '{ipv6_cidr}'. "
                        f"Must be in format: fe80::1/64 or 2001:db8::1/48"
                    )

            # Validate IPv6 gateway format if provided
            if ipv6_gateway:
                if not self._validate_ip_address(ipv6_gateway, is_ipv6=True):
                    raise ValueError(
                        f"Invalid IPv6 gateway address '{ipv6_gateway}'. "
                        f"Must be a valid IPv6 address like fe80::1"
                    )

            # Validate MTU range
            if mtu and (mtu < 576 or mtu > 9000):
                raise ValueError(
                    f"Invalid MTU value '{mtu}'. Must be between 576 and 9000. "
                    f"Standard Ethernet: 1500, Jumbo frames: 9000"
                )

            # Step 1: Create the OVS bridge
            command = f"ovs-vsctl add-br {name}"
            if datapath_type != "system":
                command += f" -- set bridge {name} datapath_type={datapath_type}"
            if fail_mode:
                command += f" -- set bridge {name} fail_mode={fail_mode}"

            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to create bridge: {stderr}")
                return False

            # Step 2: Add to Proxmox network configuration
            # Match Proxmox's exact format: auto first, 8-space indentation, comment at end
            config_lines = []

            # Auto-start configuration
            if autostart:
                config_lines.append(f"auto {name}")

            # IPv4 configuration
            if ipv4_cidr:
                config_lines.append(f"iface {name} inet static")
                config_lines.append(f"        address {ipv4_cidr}")
                if ipv4_gateway:
                    config_lines.append(f"        gateway {ipv4_gateway}")
            else:
                config_lines.append(f"iface {name} inet manual")

            # OVS bridge configuration
            config_lines.append("        ovs_type OVSBridge")
            if bridge_ports:
                config_lines.append(f"        ovs_ports {bridge_ports}")
            if mtu and mtu != 1500:
                config_lines.append(f"        ovs_mtu {mtu}")
            if ovs_options:
                config_lines.append(f"        ovs_options {ovs_options}")

            # IPv6 configuration (if provided)
            if ipv6_cidr:
                config_lines.append(f"iface {name} inet6 static")
                config_lines.append(f"        address {ipv6_cidr}")
                if ipv6_gateway:
                    config_lines.append(f"        gateway {ipv6_gateway}")

            # Comment comes AFTER the bridge block (Proxmox format)
            if comment:
                config_lines.append(f"#{comment}")

            # Add blank lines before and after to match Proxmox spacing
            config_block = "\n\n" + "\n".join(config_lines) + "\n\n"

            # Step 3: Write directly to /etc/network/interfaces and apply immediately
            # This avoids the "pending changes" state in Proxmox UI
            # Backup the current interfaces file
            backup_cmd = "cp /etc/network/interfaces /etc/network/interfaces.bak.$(date +%Y%m%d_%H%M%S)"
            self.ssh.execute(backup_cmd)

            # Append to /etc/network/interfaces directly
            escaped_config = config_block.replace("'", "'\\''")
            append_cmd = f"echo '{escaped_config}' >> /etc/network/interfaces"
            stdout, stderr, exit_code = self.ssh.execute(append_cmd)
            if exit_code != 0:
                logger.error(f"Failed to update network config: {stderr}")
                self.ssh.execute(f"ovs-vsctl del-br {name}")
                raise Exception(f"Failed to update network configuration: {stderr}")

            # Step 4: Bring up the interface immediately
            # Use ifup instead of ifreload -a to avoid reloading all interfaces
            ifup_cmd = f"ifup {name}"
            stdout, stderr, exit_code = self.ssh.execute(ifup_cmd)
            if exit_code != 0:
                logger.warning(f"ifup returned non-zero exit code {exit_code}: {stderr}")
                # Interface might already be up from ovs-vsctl, that's okay

            logger.info(f"Successfully created OVS bridge {name} with Proxmox configuration")
            return True

        except ValueError:
            # Re-raise validation errors so they propagate to the API with detailed messages
            raise
        except Exception as e:
            logger.error(f"Error creating bridge: {e}")
            # Try to clean up
            try:
                self.ssh.execute(f"ovs-vsctl del-br {name}")
            except:
                pass
            raise Exception(f"Failed to create bridge: {str(e)}")

    def delete_bridge(self, name: str) -> bool:
        """Delete an OVS bridge and remove from Proxmox network configuration"""
        try:
            # Step 1: Delete the OVS bridge
            command = f"ovs-vsctl del-br {name}"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to delete bridge: {stderr}")
                raise Exception(f"Failed to delete OVS bridge: {stderr}")

            # Step 2: Remove from /etc/network/interfaces directly
            # Backup first
            backup_cmd = "cp /etc/network/interfaces /etc/network/interfaces.bak.$(date +%Y%m%d_%H%M%S)"
            self.ssh.execute(backup_cmd)

            # Read current /etc/network/interfaces
            stdout, stderr, exit_code = self.ssh.execute("cat /etc/network/interfaces")
            if exit_code != 0:
                logger.error(f"Failed to read network config: {stderr}")
                raise Exception(f"Failed to read network configuration: {stderr}")

            # Remove the bridge configuration block from the content
            # Parse line by line and skip the bridge's config block
            lines = stdout.split('\n')
            new_lines = []
            in_bridge_block = False
            i = 0

            while i < len(lines):
                original_line = lines[i]
                stripped_line = original_line.strip()

                # Check if we're starting a bridge block for our target bridge
                if stripped_line == f'auto {name}':
                    # This is the start of our bridge - skip everything until we hit a non-indented line
                    in_bridge_block = True
                    i += 1
                    continue

                # Check if this is an iface line for our bridge (in case auto was missing)
                if stripped_line.startswith(f'iface {name} '):
                    in_bridge_block = True
                    i += 1
                    continue

                # If we're in the bridge block
                if in_bridge_block:
                    # Check if this line is indented (part of the bridge config)
                    # or a comment line that follows the bridge
                    if original_line.startswith(' ') or original_line.startswith('\t'):
                        # Indented line - part of the bridge config, skip it
                        i += 1
                        continue
                    elif stripped_line.startswith('#') and not stripped_line.startswith('##'):
                        # Single # comment (likely the bridge comment), skip it
                        i += 1
                        # After the comment, skip any following blank lines
                        while i < len(lines) and lines[i].strip() == '':
                            i += 1
                        in_bridge_block = False
                        continue
                    elif stripped_line == '':
                        # Empty line - could be the end of the block or just spacing
                        # Peek ahead to see if the next non-empty line is indented or a comment
                        peek_idx = i + 1
                        while peek_idx < len(lines) and lines[peek_idx].strip() == '':
                            peek_idx += 1

                        if peek_idx < len(lines):
                            peek_line = lines[peek_idx]
                            # If next line is indented or starts with iface for same bridge, keep skipping
                            if peek_line.startswith(' ') or peek_line.startswith('\t') or peek_line.strip().startswith(f'iface {name} '):
                                i += 1
                                continue
                            elif peek_line.strip().startswith('#') and not peek_line.strip().startswith('##'):
                                # It's the comment at the end, skip this blank and continue
                                i += 1
                                continue

                        # End of bridge block
                        in_bridge_block = False
                        i += 1
                        continue
                    else:
                        # Non-indented, non-comment, non-empty line - end of bridge block
                        in_bridge_block = False
                        # Don't skip this line, fall through to add it

                # Keep this line
                new_lines.append(original_line)
                i += 1

            new_config = '\n'.join(new_lines)

            # Write directly to /etc/network/interfaces
            write_cmd = f"cat > /etc/network/interfaces << 'EOF'\n{new_config}\nEOF"
            stdout, stderr, exit_code = self.ssh.execute(write_cmd)
            if exit_code != 0:
                logger.error(f"Failed to write network config: {stderr}")
                raise Exception(f"Failed to write network configuration: {stderr}")

            # Step 3: Bring down the interface
            ifdown_cmd = f"ifdown {name} 2>/dev/null || true"
            self.ssh.execute(ifdown_cmd)

            logger.info(f"Successfully deleted OVS bridge {name}")
            return True

        except Exception as e:
            logger.error(f"Error deleting bridge: {e}")
            raise

    def update_bridge(self, name: str, properties: Dict[str, Any]) -> bool:
        """Update bridge properties"""
        try:
            commands = []
            for key, value in properties.items():
                if value is not None:
                    if isinstance(value, bool):
                        value_str = "true" if value else "false"
                    elif isinstance(value, list):
                        value_str = f"{{{','.join(str(v) for v in value)}}}"
                    else:
                        value_str = str(value)
                    commands.append(f"set bridge {name} {key}={value_str}")

            if not commands:
                return True

            command = "ovs-vsctl " + " -- ".join(commands)
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to update bridge: {stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Error updating bridge: {e}")
            return False

    def get_bridge_details(self, name: str) -> Optional[BridgeDetail]:
        """Get detailed information about a bridge"""
        try:
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl list bridge {name}")
            if exit_code != 0:
                logger.error(f"Failed to get bridge details: {stderr}")
                return None

            # Parse bridge details
            bridge_data = self._parse_ovs_list_output(stdout)
            if not bridge_data:
                return None

            # Get ports for this bridge
            ports_stdout, _, _ = self.ssh.execute(f"ovs-vsctl list-ports {name}")
            port_names = [p.strip() for p in ports_stdout.strip().split('\n') if p.strip()]

            ports = []
            for port_name in port_names:
                port_detail = self.get_port_details(port_name)
                if port_detail:
                    ports.append(port_detail)

            # Get mirrors
            mirrors = [m for m in self.get_mirrors() if m.bridge == name]

            return BridgeDetail(
                uuid=bridge_data.get('_uuid', ''),
                name=bridge_data.get('name', name),
                fail_mode=bridge_data.get('fail_mode'),
                datapath_type=bridge_data.get('datapath_type'),
                datapath_id=bridge_data.get('datapath_id'),
                protocols=self._parse_array_field(bridge_data.get('protocols', '')),
                controller=bridge_data.get('controller'),
                stp_enable=bridge_data.get('stp_enable', 'false') == 'true',
                rstp_enable=bridge_data.get('rstp_enable', 'false') == 'true',
                mcast_snooping_enable=bridge_data.get('mcast_snooping_enable', 'false') == 'true',
                ports=ports,
                mirrors=mirrors
            )
        except Exception as e:
            logger.error(f"Error getting bridge details: {e}")
            return None

    def flush_bridge_fdb(self, name: str) -> bool:
        """Flush MAC learning table for a bridge"""
        try:
            command = f"ovs-appctl fdb/flush {name}"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to flush bridge FDB: {stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Error flushing bridge FDB: {e}")
            return False

    # ======================
    # Port Management
    # ======================

    def add_port(self, bridge: str, port_name: str, port_type: str = "internal", options: Optional[Dict[str, str]] = None) -> bool:
        """Add a port to a bridge"""
        try:
            command = f"ovs-vsctl add-port {bridge} {port_name}"

            # Add port type if specified
            if port_type and port_type != "system":
                command += f" -- set interface {port_name} type={port_type}"

            # Add options if specified
            if options:
                for key, value in options.items():
                    command += f" -- set interface {port_name} options:{key}={value}"

            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to add port: {stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Error adding port: {e}")
            return False

    def delete_port(self, bridge: str, port_name: str) -> bool:
        """Delete a port from a bridge"""
        try:
            command = f"ovs-vsctl del-port {bridge} {port_name}"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to delete port: {stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Error deleting port: {e}")
            return False

    def update_port(self, port_name: str, properties: Dict[str, Any]) -> bool:
        """Update port properties"""
        try:
            commands = []
            for key, value in properties.items():
                if value is not None:
                    if isinstance(value, bool):
                        value_str = "true" if value else "false"
                    elif isinstance(value, list):
                        # For trunks, use set notation
                        value_str = f"{{{','.join(str(v) for v in value)}}}"
                    else:
                        value_str = str(value)
                    commands.append(f"set port {port_name} {key}={value_str}")

            if not commands:
                return True

            command = "ovs-vsctl " + " -- ".join(commands)
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to update port: {stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Error updating port: {e}")
            return False

    def get_port_details(self, port_name: str) -> Optional[PortDetail]:
        """Get detailed information about a port"""
        try:
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl list port {port_name}")
            if exit_code != 0:
                return None

            port_data = self._parse_ovs_list_output(stdout)
            if not port_data:
                return None

            # Get interfaces for this port
            interfaces_uuids = self._parse_array_field(port_data.get('interfaces', ''))
            interfaces = []
            for iface_uuid in interfaces_uuids:
                iface_detail = self._get_interface_by_uuid(iface_uuid)
                if iface_detail:
                    interfaces.append(iface_detail)

            # Get bridge for this port
            bridge_name = ""
            for bridge in self.get_bridges():
                if any(p.name == port_name for p in bridge.ports):
                    bridge_name = bridge.name
                    break

            return PortDetail(
                uuid=port_data.get('_uuid', ''),
                name=port_data.get('name', port_name),
                bridge=bridge_name,
                tag=int(port_data['tag']) if port_data.get('tag') and port_data['tag'] != '[]' else None,
                trunks=self._parse_int_array(port_data.get('trunks', '')),
                vlan_mode=port_data.get('vlan_mode') if port_data.get('vlan_mode') != '[]' else None,
                bond_mode=port_data.get('bond_mode') if port_data.get('bond_mode') != '[]' else None,
                lacp=port_data.get('lacp') if port_data.get('lacp') != '[]' else None,
                bond_updelay=int(port_data['bond_updelay']) if port_data.get('bond_updelay') and port_data['bond_updelay'] != '[]' else None,
                bond_downdelay=int(port_data['bond_downdelay']) if port_data.get('bond_downdelay') and port_data['bond_downdelay'] != '[]' else None,
                interfaces=interfaces
            )
        except Exception as e:
            logger.error(f"Error getting port details: {e}")
            return None

    def list_available_interfaces(self) -> List[str]:
        """List system interfaces that could be added to OVS"""
        try:
            stdout, stderr, exit_code = self.ssh.execute("ip link show")
            if exit_code != 0:
                return []

            # Parse interface names from ip link output
            interfaces = []
            for line in stdout.split('\n'):
                if ':' in line and not line.startswith(' '):
                    parts = line.split(':')
                    if len(parts) >= 2:
                        iface_name = parts[1].strip()
                        # Exclude loopback and already attached interfaces
                        if iface_name and iface_name != 'lo':
                            interfaces.append(iface_name)

            return interfaces
        except Exception as e:
            logger.error(f"Error listing available interfaces: {e}")
            return []

    # ======================
    # VLAN Management
    # ======================

    def set_port_vlan(self, port_name: str, vlan_id: int, mode: str = "access") -> bool:
        """Configure VLAN for a port"""
        try:
            if mode == "access":
                command = f"ovs-vsctl set port {port_name} tag={vlan_id} vlan_mode=access"
            elif mode == "trunk":
                command = f"ovs-vsctl set port {port_name} vlan_mode=trunk"
            elif mode in ["native-tagged", "native-untagged"]:
                command = f"ovs-vsctl set port {port_name} tag={vlan_id} vlan_mode={mode}"
            else:
                logger.error(f"Invalid VLAN mode: {mode}")
                return False

            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to set port VLAN: {stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Error setting port VLAN: {e}")
            return False

    def set_port_trunks(self, port_name: str, vlan_list: List[int]) -> bool:
        """Configure trunk VLANs for a port"""
        try:
            vlans_str = ",".join(str(v) for v in vlan_list)
            command = f"ovs-vsctl set port {port_name} trunks={vlans_str}"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to set port trunks: {stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Error setting port trunks: {e}")
            return False

    def get_port_vlan_config(self, port_name: str) -> Dict[str, Any]:
        """Get VLAN configuration for a port"""
        try:
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl list port {port_name}")
            if exit_code != 0:
                return {}

            port_data = self._parse_ovs_list_output(stdout)
            return {
                'tag': int(port_data['tag']) if port_data.get('tag') and port_data['tag'] != '[]' else None,
                'trunks': self._parse_int_array(port_data.get('trunks', '')),
                'vlan_mode': port_data.get('vlan_mode') if port_data.get('vlan_mode') != '[]' else None
            }
        except Exception as e:
            logger.error(f"Error getting port VLAN config: {e}")
            return {}

    # ======================
    # Bonding (Link Aggregation)
    # ======================

    def create_bond(self, bridge: str, bond_name: str, interfaces: List[str], mode: str = "active-backup", lacp: str = "off") -> bool:
        """Create a bond from multiple interfaces"""
        try:
            ifaces_str = " ".join(interfaces)
            command = f"ovs-vsctl add-bond {bridge} {bond_name} {ifaces_str} bond_mode={mode} lacp={lacp}"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to create bond: {stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Error creating bond: {e}")
            return False

    def update_bond(self, bond_name: str, properties: Dict[str, Any]) -> bool:
        """Update bond properties"""
        return self.update_port(bond_name, properties)

    def get_bond_status(self, bond_name: str) -> Optional[BondStatus]:
        """Get bond health and slave status"""
        try:
            port_detail = self.get_port_details(bond_name)
            if not port_detail:
                return None

            # Get bond-specific details from ovs-appctl
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-appctl bond/show {bond_name}")

            slaves = []
            active_slave = None

            if exit_code == 0:
                # Parse bond/show output for slave status
                for line in stdout.split('\n'):
                    if 'slave' in line.lower() and ':' in line:
                        parts = line.split(':')
                        if len(parts) >= 2:
                            slave_name = parts[0].strip().replace('slave ', '')
                            status = parts[1].strip()
                            slaves.append({'name': slave_name, 'status': status})
                            if 'active' in status.lower():
                                active_slave = slave_name

            return BondStatus(
                name=bond_name,
                mode=port_detail.bond_mode or "unknown",
                lacp=port_detail.lacp or "off",
                active_slave=active_slave,
                slaves=slaves
            )
        except Exception as e:
            logger.error(f"Error getting bond status: {e}")
            return None

    def enable_disable_bond_slave(self, bond_name: str, slave: str, enabled: bool) -> bool:
        """Enable or disable a bond slave"""
        try:
            action = "enable" if enabled else "disable"
            command = f"ovs-appctl bond/{action}-slave {bond_name} {slave}"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to {action} bond slave: {stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Error {action}ing bond slave: {e}")
            return False

    def get_lacp_status(self, bond_name: str) -> Optional[LACPStatus]:
        """Get LACP negotiation details"""
        try:
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-appctl lacp/show {bond_name}")
            if exit_code != 0:
                return None

            # Parse LACP output for actor/partner keys and status
            lacp_data = {}
            for line in stdout.split('\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    lacp_data[key.strip().lower()] = value.strip()

            return LACPStatus(
                bond_name=bond_name,
                actor_key=int(lacp_data.get('actor key', 0)),
                partner_key=int(lacp_data.get('partner key', 0)),
                aggregation_status=lacp_data.get('status', 'unknown'),
                details=lacp_data
            )
        except Exception as e:
            logger.error(f"Error getting LACP status: {e}")
            return None

    # ======================
    # Interface Statistics
    # ======================

    def get_interface_stats(self, interface_name: str) -> Optional[InterfaceStats]:
        """Get statistics for a specific interface"""
        try:
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl list interface {interface_name}")
            if exit_code != 0:
                return None

            iface_data = self._parse_ovs_list_output(stdout)
            if not iface_data:
                return None

            # Parse statistics from the statistics field
            stats_str = iface_data.get('statistics', '{}')
            stats = self._parse_dict_field(stats_str)

            from datetime import datetime
            return InterfaceStats(
                rx_packets=int(stats.get('rx_packets', 0)),
                rx_bytes=int(stats.get('rx_bytes', 0)),
                rx_dropped=int(stats.get('rx_dropped', 0)),
                rx_errors=int(stats.get('rx_errors', 0)),
                tx_packets=int(stats.get('tx_packets', 0)),
                tx_bytes=int(stats.get('tx_bytes', 0)),
                tx_dropped=int(stats.get('tx_dropped', 0)),
                tx_errors=int(stats.get('tx_errors', 0)),
                timestamp=datetime.now()
            )
        except Exception as e:
            logger.error(f"Error getting interface stats: {e}")
            return None

    def get_all_interface_stats(self) -> Dict[str, InterfaceStats]:
        """Get statistics for all interfaces"""
        try:
            bridges = self.get_bridges()
            stats_dict = {}

            for bridge in bridges:
                for port in bridge.ports:
                    for iface in port.interfaces:
                        iface_name = iface.get('name', '')
                        if iface_name:
                            stats = self.get_interface_stats(iface_name)
                            if stats:
                                stats_dict[iface_name] = stats

            return stats_dict
        except Exception as e:
            logger.error(f"Error getting all interface stats: {e}")
            return {}

    def calculate_stats_delta(self, baseline: InterfaceStats, current: InterfaceStats) -> Dict[str, float]:
        """Calculate delta for rate monitoring"""
        time_delta = (current.timestamp - baseline.timestamp).total_seconds()
        if time_delta <= 0:
            time_delta = 1  # Avoid division by zero

        return {
            'rx_bps': (current.rx_bytes - baseline.rx_bytes) * 8 / time_delta,
            'tx_bps': (current.tx_bytes - baseline.tx_bytes) * 8 / time_delta,
            'rx_pps': (current.rx_packets - baseline.rx_packets) / time_delta,
            'tx_pps': (current.tx_packets - baseline.tx_packets) / time_delta,
            'rx_dropped_ps': (current.rx_dropped - baseline.rx_dropped) / time_delta,
            'tx_dropped_ps': (current.tx_dropped - baseline.tx_dropped) / time_delta,
            'rx_errors_ps': (current.rx_errors - baseline.rx_errors) / time_delta,
            'tx_errors_ps': (current.tx_errors - baseline.tx_errors) / time_delta,
        }

    # ======================
    # Helper Methods
    # ======================

    def _parse_ovs_list_output(self, output: str) -> Dict[str, str]:
        """Parse ovs-vsctl list output into key-value dict"""
        data = {}
        for line in output.split('\n'):
            line = line.strip()
            if ':' in line:
                key, value = line.split(':', 1)
                data[key.strip()] = value.strip()
        return data

    def _parse_array_field(self, field_value: str) -> List[str]:
        """Parse array field from OVS output (e.g., [uuid1, uuid2])"""
        field_value = field_value.strip()
        if field_value.startswith('[') and field_value.endswith(']'):
            content = field_value[1:-1].strip()
            if not content:
                return []
            return [item.strip() for item in content.split(',')]
        return []

    def _parse_int_array(self, field_value: str) -> Optional[List[int]]:
        """Parse integer array field from OVS output"""
        items = self._parse_array_field(field_value)
        if not items:
            return None
        try:
            return [int(item) for item in items if item]
        except ValueError:
            return None

    def _parse_dict_field(self, field_value: str) -> Dict[str, str]:
        """Parse dictionary field from OVS output (e.g., {key1=val1, key2=val2})"""
        result = {}
        field_value = field_value.strip()
        if field_value.startswith('{') and field_value.endswith('}'):
            content = field_value[1:-1]
            for pair in content.split(','):
                pair = pair.strip()
                if '=' in pair:
                    key, value = pair.split('=', 1)
                    result[key.strip()] = value.strip()
        return result

    def _get_interface_by_uuid(self, uuid: str) -> Optional[InterfaceDetail]:
        """Get interface details by UUID"""
        try:
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl --columns=name,type,mac_in_use,mtu,admin_state,link_state,options list interface {uuid}")
            if exit_code != 0:
                return None

            iface_data = self._parse_ovs_list_output(stdout)
            if not iface_data:
                return None

            options = self._parse_dict_field(iface_data.get('options', '{}'))

            # Get interface name and type
            iface_name = iface_data.get('name', '').strip('"')
            iface_type = iface_data.get('type', '').strip('"')

            # Apply name-based type detection if OVS type is empty (same logic as _parse_interface_types)
            if not iface_type:
                if iface_name.startswith('tap'):
                    iface_type = 'tap'
                elif iface_name.startswith('veth'):
                    iface_type = 'veth'
                else:
                    iface_type = 'system'

            return InterfaceDetail(
                name=iface_name,
                type=iface_type,
                mac_address=iface_data.get('mac_in_use', '').strip('"') if iface_data.get('mac_in_use') != '[]' else None,
                mtu=int(iface_data['mtu']) if iface_data.get('mtu') and iface_data['mtu'] != '[]' else None,
                admin_state=iface_data.get('admin_state', '').strip('"') if iface_data.get('admin_state') != '[]' else None,
                link_state=iface_data.get('link_state', '').strip('"') if iface_data.get('link_state') != '[]' else None,
                options=options if options else None
            )
        except Exception as e:
            logger.error(f"Error getting interface by UUID: {e}")
            return None

