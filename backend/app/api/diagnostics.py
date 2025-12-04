from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

from app.models.database import get_db
from app.services.ssh_service import SSHService
from app.api.hosts import get_host_config

router = APIRouter(prefix="/api/hosts/{host_id}/diagnostics", tags=["diagnostics"])


# Request/Response Models
class PingRequest(BaseModel):
    target: str
    interface: Optional[str] = None
    count: int = 4
    timeout: int = 2


class PacketTraceRequest(BaseModel):
    bridge: str
    in_port: str
    dl_src: Optional[str] = None
    dl_dst: Optional[str] = None
    dl_type: Optional[str] = "0x0800"  # IP by default
    nw_src: Optional[str] = None
    nw_dst: Optional[str] = None
    nw_proto: Optional[str] = None


class ExecuteCommandRequest(BaseModel):
    command: str


class DiagnosticResponse(BaseModel):
    success: bool
    output: str
    error: Optional[str] = None


# Bridge Inspection Endpoints
@router.get("/ovs-topology")
async def get_ovs_topology(host_id: str, db: Session = Depends(get_db)) -> DiagnosticResponse:
    """Get complete OVS topology using ovs-vsctl show"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute("ovs-vsctl show")
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/openflow-ports/{bridge_name}")
async def get_openflow_ports(
    host_id: str,
    bridge_name: str,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Get OpenFlow port status for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute(f"ovs-ofctl show {bridge_name}")
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# MAC Learning / FDB Endpoints
@router.get("/mac-table/{bridge_name}")
async def get_mac_table(
    host_id: str,
    bridge_name: str,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Get MAC learning table (FDB) for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute(f"ovs-appctl fdb/show {bridge_name}")
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Flow Rules & Packet Tracing Endpoints
@router.get("/flows/{bridge_name}")
async def get_flows(
    host_id: str,
    bridge_name: str,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Get OpenFlow rules for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute(f"ovs-ofctl dump-flows {bridge_name}")
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/packet-trace")
async def trace_packet(
    host_id: str,
    request: PacketTraceRequest,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Trace a packet through the OVS pipeline with port mapping"""
    try:
        config = get_host_config(host_id, db)

        # Build flow specification
        flow_parts = [f"in_port={request.in_port}"]
        if request.dl_src:
            flow_parts.append(f"dl_src={request.dl_src}")
        if request.dl_dst:
            flow_parts.append(f"dl_dst={request.dl_dst}")
        if request.dl_type:
            flow_parts.append(f"dl_type={request.dl_type}")
        if request.nw_src:
            flow_parts.append(f"nw_src={request.nw_src}")
        if request.nw_dst:
            flow_parts.append(f"nw_dst={request.nw_dst}")
        if request.nw_proto:
            flow_parts.append(f"nw_proto={request.nw_proto}")

        flow_spec = ",".join(flow_parts)

        with SSHService(config) as ssh:
            # Run the trace
            trace_command = f"ovs-appctl ofproto/trace {request.bridge} '{flow_spec}'"
            trace_stdout, trace_stderr, trace_exit = ssh.execute(trace_command)

            if trace_exit != 0:
                return DiagnosticResponse(
                    success=False,
                    output=trace_stdout,
                    error=trace_stderr
                )

            # Get port number to name mapping
            port_map_command = f"ovs-ofctl show {request.bridge}"
            port_stdout, port_stderr, port_exit = ssh.execute(port_map_command)

            # Get current MAC learning table
            mac_table_command = f"ovs-appctl fdb/show {request.bridge}"
            mac_stdout, mac_stderr, mac_exit = ssh.execute(mac_table_command)

            # Build enhanced output with port mapping
            output_parts = []
            output_parts.append("=" * 70)
            output_parts.append("PACKET TRACE RESULTS")
            output_parts.append("=" * 70)
            output_parts.append("")

            # Add port mapping section if available
            if port_exit == 0 and port_stdout:
                output_parts.append("PORT NUMBER → PORT NAME MAPPING:")
                output_parts.append("-" * 70)
                # Parse and show port mappings
                for line in port_stdout.split('\n'):
                    line = line.strip()
                    if line and '(' in line and ')' in line:
                        # Lines like: " 1(tap100i1): addr:..."
                        if line[0].isdigit() or (len(line) > 1 and line[1].isdigit()):
                            output_parts.append(line.split(':')[0].strip())
                output_parts.append("")

            # Add MAC learning table
            if mac_exit == 0 and mac_stdout:
                output_parts.append("CURRENT MAC LEARNING TABLE (what OVS actually knows):")
                output_parts.append("-" * 70)
                output_parts.append(mac_stdout.strip())
                output_parts.append("")
                output_parts.append("NOTE: Trace uses this table to decide if it floods or forwards!")
                output_parts.append("      If your dest MAC isn't listed above, it will flood.")
                output_parts.append("")

            output_parts.append("TRACE OUTPUT:")
            output_parts.append("-" * 70)
            output_parts.append(trace_stdout)
            output_parts.append("")
            output_parts.append("=" * 70)
            output_parts.append("HOW TO READ THIS:")
            output_parts.append("=" * 70)
            output_parts.append("")
            output_parts.append("IN PORT:")
            output_parts.append("  • 'in_port=X' - Packet entered through port number X")
            output_parts.append("  • Use the port mapping above to see the actual port name")
            output_parts.append(f"  • In this trace: in_port shown in 'Flow:' line")
            output_parts.append("")
            output_parts.append("BRIDGES TRAVERSED:")
            output_parts.append("  • Each 'bridge(\"name\")' section = a bridge the packet goes through")
            output_parts.append("  • ONE section = packet stayed on that bridge")
            output_parts.append("  • TWO+ sections = packet crossed patch ports between bridges!")
            output_parts.append("")
            output_parts.append("ACTIONS:")
            output_parts.append("  • 'NORMAL' = standard L2 switching (uses MAC learning table above)")
            output_parts.append("  • 'no learned MAC for destination, flooding' = dest MAC NOT in table")
            output_parts.append("    → Packet sent to ALL ports (broadcast)")
            output_parts.append("  • 'forwarding to learned port' = dest MAC IS in table")
            output_parts.append("    → Packet sent to ONE specific port")
            output_parts.append("")
            output_parts.append("IMPORTANT:")
            output_parts.append("  • This is a SIMULATION based on the CURRENT MAC table state")
            output_parts.append("  • MACs you specify are just the packet headers being simulated")
            output_parts.append("  • OVS checks its REAL table (shown above) to decide what to do")
            output_parts.append("  • To learn a MAC: actual traffic from that MAC must flow through OVS")
            output_parts.append("")
            output_parts.append("OUTPUT PORTS:")
            output_parts.append("  • 'Datapath actions: X,Y,Z' - packet exits through these ports")
            output_parts.append("  • NOTE: These are kernel datapath port IDs (different numbering)")
            output_parts.append("  • Multiple numbers = sent to multiple ports (broadcast/flood)")
            output_parts.append("  • To see exact port names, check 'ovs-appctl dpctl/show'")
            output_parts.append("")

            return DiagnosticResponse(
                success=True,
                output="\n".join(output_parts),
                error=None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Port/Interface Statistics Endpoints
@router.get("/port-stats/{bridge_name}")
async def get_port_stats(
    host_id: str,
    bridge_name: str,
    port_name: Optional[str] = None,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Get port statistics from OpenFlow"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            if port_name:
                command = f"ovs-ofctl dump-ports {bridge_name} {port_name}"
            else:
                command = f"ovs-ofctl dump-ports {bridge_name}"

            stdout, stderr, exit_code = ssh.execute(command)
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/interface-stats/{interface_name}")
async def get_interface_stats(
    host_id: str,
    interface_name: str,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Get detailed interface statistics from OVS"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute(
                f"ovs-vsctl get interface {interface_name} statistics"
            )
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Network Testing Endpoints
@router.get("/interfaces-with-ips")
async def get_interfaces_with_ips(
    host_id: str,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Get all interfaces with their IP addresses"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            # Use ip -brief to get concise interface list with IPs
            stdout, stderr, exit_code = ssh.execute("ip -brief addr show")
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PingRequestExtended(BaseModel):
    target: str
    source_ip: Optional[str] = None  # Source IP address
    interface: Optional[str] = None  # Interface name (only works if interface has IP)
    count: int = 4
    timeout: int = 2


@router.post("/ping")
async def ping_test(
    host_id: str,
    request: PingRequestExtended,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Perform ping test with source IP or interface"""
    try:
        config = get_host_config(host_id, db)

        command = f"ping -c {request.count} -W {request.timeout}"

        # Prefer source_ip over interface
        if request.source_ip:
            command += f" -I {request.source_ip}"
        elif request.interface:
            command += f" -I {request.interface}"

        command += f" {request.target}"

        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute(command)
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/arp-table")
async def get_arp_table(
    host_id: str,
    interface: Optional[str] = None,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Get ARP/neighbor table"""
    try:
        config = get_host_config(host_id, db)

        if interface:
            command = f"ip neigh show dev {interface}"
        else:
            command = "ip neigh show"

        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute(command)
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/interface-config/{interface_name}")
async def get_interface_config(
    host_id: str,
    interface_name: str,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Get interface IP configuration"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute(f"ip addr show {interface_name}")
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Datapath Information
@router.get("/datapath-flows")
async def get_datapath_flows(
    host_id: str,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Get kernel datapath flows"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute("ovs-appctl dpctl/dump-flows")
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bridge-protocols/{bridge_name}")
async def get_bridge_protocols(
    host_id: str,
    bridge_name: str,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Get OpenFlow protocol versions for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute(
                f"ovs-vsctl get bridge {bridge_name} protocols"
            )
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Connection Testing
@router.get("/connectivity-matrix")
async def get_connectivity_matrix(
    host_id: str,
    bridge_name: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Generate connectivity matrix for ports on a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            # Get all ports on the bridge
            stdout, stderr, exit_code = ssh.execute(f"ovs-vsctl list-ports {bridge_name}")
            if exit_code != 0:
                raise HTTPException(status_code=500, detail=stderr)

            ports = [p.strip() for p in stdout.strip().split('\n') if p.strip()]

            # Get MAC learning table
            stdout, stderr, exit_code = ssh.execute(f"ovs-appctl fdb/show {bridge_name}")
            mac_table = stdout if exit_code == 0 else ""

            # Get port statistics
            stdout, stderr, exit_code = ssh.execute(f"ovs-ofctl dump-ports {bridge_name}")
            port_stats = stdout if exit_code == 0 else ""

            return {
                "bridge": bridge_name,
                "ports": ports,
                "mac_table": mac_table,
                "port_stats": port_stats
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# OVS Command Console
class OvsVsctlCommandRequest(BaseModel):
    command: str  # The ovs-vsctl subcommand (e.g., "show", "list-br", "list-ports vmbr0")


@router.post("/ovs-vsctl")
async def execute_ovs_vsctl_command(
    host_id: str,
    request: OvsVsctlCommandRequest,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Execute an ovs-vsctl command (read-only commands only)"""
    try:
        # Whitelist of safe read-only ovs-vsctl commands
        safe_commands = [
            'show', 'list-br', 'list-ports', 'list-ifaces', 'port-to-br', 'iface-to-br',
            'br-exists', 'br-to-vlan', 'br-to-parent', 'br-get-external-id',
            'list', 'find', 'get', '--version'
        ]

        # Extract the base command (first word)
        command_parts = request.command.strip().split()
        if not command_parts:
            raise HTTPException(status_code=400, detail="Empty command")

        base_command = command_parts[0]

        # Check if command is in whitelist
        if base_command not in safe_commands:
            raise HTTPException(
                status_code=403,
                detail=f"Command '{base_command}' is not allowed. Only read-only commands are permitted."
            )

        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            full_command = f"ovs-vsctl {request.command}"
            stdout, stderr, exit_code = ssh.execute(full_command)
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ovs-ofctl/{bridge_name}/{command}")
async def execute_ovs_ofctl_command(
    host_id: str,
    bridge_name: str,
    command: str,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Execute an ovs-ofctl command on a bridge (read-only commands only)"""
    try:
        # Whitelist of safe read-only ovs-ofctl commands
        safe_commands = [
            'show', 'dump-flows', 'dump-ports', 'dump-ports-desc', 'dump-tables',
            'dump-aggregate', 'queue-stats', 'queue-get-config', 'dump-groups',
            'dump-group-stats', 'dump-meters', 'meter-stats', 'meter-features'
        ]

        if command not in safe_commands:
            raise HTTPException(
                status_code=403,
                detail=f"Command '{command}' is not allowed. Only read-only commands are permitted."
            )

        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            full_command = f"ovs-ofctl {command} {bridge_name}"
            stdout, stderr, exit_code = ssh.execute(full_command)
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/execute-command", response_model=DiagnosticResponse)
async def execute_command(
    host_id: str,
    request: ExecuteCommandRequest,
    db: Session = Depends(get_db)
) -> DiagnosticResponse:
    """Execute an arbitrary command on the host (FOR TESTING ONLY)"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            stdout, stderr, exit_code = ssh.execute(request.command)
            return DiagnosticResponse(
                success=(exit_code == 0),
                output=stdout,
                error=stderr if exit_code != 0 else None
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
