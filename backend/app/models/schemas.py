from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime


class HostConfig(BaseModel):
    name: str
    hostname: str
    port: int = 22
    username: str
    ssh_key_path: Optional[str] = None
    password: Optional[str] = None
    description: Optional[str] = None


class HostStatus(BaseModel):
    host_id: str
    name: str
    connected: bool  # Deprecated, kept for compatibility
    last_checked: Optional[datetime] = None  # This is now "last_queried"
    error: Optional[str] = None


class Port(BaseModel):
    uuid: str
    name: str
    bridge: Optional[str] = None
    type: Optional[str] = None  # system, internal, tap, veth, patch, vxlan, gre, geneve, dpdk, etc.
    interfaces: List[Dict[str, Any]] = []


class Mirror(BaseModel):
    uuid: str
    name: Optional[str] = None
    bridge: str
    select_src_port: Optional[List[str]] = None
    select_dst_port: Optional[List[str]] = None
    output_port: Optional[str] = None
    output_vlan: Optional[List[int]] = None
    select_all: bool = False


class Bridge(BaseModel):
    uuid: str
    name: str
    ports: List[Port] = []
    mirrors: List[Mirror] = []
    cidr: Optional[str] = None
    comment: Optional[str] = None


class VMInterface(BaseModel):
    netid: str
    tap: str
    mac: str
    bridge: Optional[str] = None


class VM(BaseModel):
    vmid: int
    name: str
    status: str
    interfaces: List[VMInterface] = []


class Container(BaseModel):
    ctid: int
    name: str
    status: str
    interfaces: List[VMInterface] = []


class HostData(BaseModel):
    host_id: str
    bridges: List[Bridge] = []
    mirrors: List[Mirror] = []
    vms: List[VM] = []
    last_updated: Optional[datetime] = None


class CreateMirrorRequest(BaseModel):
    bridge_name: str
    mirror_name: str
    mode: str  # 'manual' or 'dynamic'
    source_ports: Optional[List[str]] = None  # For manual mode
    output_port: str


class DeleteMirrorRequest(BaseModel):
    bridge_name: str
    mirror_uuid: str


# Extended models for enhanced OVS management

class InterfaceDetail(BaseModel):
    name: str
    type: str  # internal, patch, vxlan, gre, geneve, tap, veth, system
    mac_address: Optional[str] = None
    mtu: Optional[int] = None
    admin_state: Optional[str] = None  # up, down
    link_state: Optional[str] = None  # up, down
    options: Optional[Dict[str, str]] = None  # Type-specific options (remote_ip, key, etc.)


class InterfaceStats(BaseModel):
    rx_packets: int
    rx_bytes: int
    rx_dropped: int
    rx_errors: int
    tx_packets: int
    tx_bytes: int
    tx_dropped: int
    tx_errors: int
    timestamp: datetime


class PortDetail(BaseModel):
    uuid: str
    name: str
    bridge: str
    tag: Optional[int] = None  # VLAN tag for access mode
    trunks: Optional[List[int]] = None  # List of trunk VLANs
    vlan_mode: Optional[str] = None  # access, trunk, native-tagged, native-untagged
    bond_mode: Optional[str] = None  # active-backup, balance-slb, balance-tcp
    lacp: Optional[str] = None  # active, passive, off
    bond_updelay: Optional[int] = None
    bond_downdelay: Optional[int] = None
    interfaces: List[InterfaceDetail] = []
    statistics: Optional[InterfaceStats] = None


class BridgeDetail(BaseModel):
    uuid: str
    name: str
    fail_mode: Optional[str] = None  # secure, standalone
    datapath_type: Optional[str] = None  # system, netdev
    datapath_id: Optional[str] = None
    protocols: Optional[List[str]] = None  # OpenFlow versions
    controller: Optional[str] = None
    stp_enable: bool = False
    rstp_enable: bool = False
    mcast_snooping_enable: bool = False
    ports: List[PortDetail] = []
    mirrors: List[Mirror] = []
    cidr: Optional[str] = None
    comment: Optional[str] = None


class FlowExportConfig(BaseModel):
    protocol: str  # netflow, sflow, ipfix
    bridge: str
    targets: List[str]  # Collector addresses (IP:port format)
    active_timeout: Optional[int] = None  # NetFlow/IPFIX
    engine_id: Optional[int] = None  # NetFlow
    engine_type: Optional[int] = None  # NetFlow
    header: Optional[int] = None  # sFlow
    sampling: Optional[int] = None  # sFlow
    polling: Optional[int] = None  # sFlow
    obs_domain_id: Optional[int] = None  # IPFIX
    obs_point_id: Optional[int] = None  # IPFIX
    cache_active_timeout: Optional[int] = None  # IPFIX
    cache_max_flows: Optional[int] = None  # IPFIX


# Request/Response Models for API endpoints

class CreateBridgeRequest(BaseModel):
    name: str
    fail_mode: Optional[str] = "standalone"  # secure or standalone
    datapath_type: Optional[str] = "system"  # system or netdev
    ipv4_cidr: Optional[str] = None  # e.g., "10.0.0.1/24"
    ipv4_gateway: Optional[str] = None  # e.g., "10.0.0.254"
    ipv6_cidr: Optional[str] = None  # e.g., "fe80::1/64"
    ipv6_gateway: Optional[str] = None
    bridge_ports: Optional[str] = None  # Space-separated list of physical ports, e.g., "eth1 eth2"
    autostart: Optional[bool] = True  # Add "auto" to /etc/network/interfaces
    ovs_options: Optional[str] = None  # Additional OVS options, e.g., "tag=100"
    comment: Optional[str] = None  # Comment for Proxmox UI
    mtu: Optional[int] = 1500  # MTU setting


class UpdateBridgeRequest(BaseModel):
    fail_mode: Optional[str] = None
    datapath_type: Optional[str] = None
    protocols: Optional[List[str]] = None
    controller: Optional[str] = None
    stp_enable: Optional[bool] = None
    rstp_enable: Optional[bool] = None
    mcast_snooping_enable: Optional[bool] = None
    comment: Optional[str] = None


class CreatePortRequest(BaseModel):
    name: str
    port_type: str = "internal"  # internal, patch, vxlan, gre, geneve, system
    options: Optional[Dict[str, str]] = None  # Type-specific options


class UpdatePortRequest(BaseModel):
    tag: Optional[int] = None  # VLAN tag
    trunks: Optional[List[int]] = None  # Trunk VLANs
    vlan_mode: Optional[str] = None  # access, trunk, native-tagged, native-untagged


class CreateBondRequest(BaseModel):
    name: str
    interfaces: List[str]  # List of interface names to bond
    mode: str = "active-backup"  # active-backup, balance-slb, balance-tcp
    lacp: str = "off"  # active, passive, off
    bond_updelay: Optional[int] = None
    bond_downdelay: Optional[int] = None


class UpdateBondRequest(BaseModel):
    mode: Optional[str] = None
    lacp: Optional[str] = None
    bond_updelay: Optional[int] = None
    bond_downdelay: Optional[int] = None


class BondStatus(BaseModel):
    name: str
    mode: str
    lacp: str
    active_slave: Optional[str] = None
    slaves: List[Dict[str, Any]] = []  # List of slave interfaces with status


class LACPStatus(BaseModel):
    bond_name: str
    actor_key: Optional[int] = None
    partner_key: Optional[int] = None
    aggregation_status: Optional[str] = None
    details: Dict[str, Any] = {}


class ConfigureFlowExportRequest(BaseModel):
    targets: List[str]  # List of collector addresses (IP:port)
    active_timeout: Optional[int] = None
    engine_id: Optional[int] = None
    engine_type: Optional[int] = None
    header: Optional[int] = None
    sampling: Optional[int] = None
    polling: Optional[int] = None
    obs_domain_id: Optional[int] = None
    obs_point_id: Optional[int] = None
    cache_active_timeout: Optional[int] = None
    cache_max_flows: Optional[int] = None


class NetworkTopology(BaseModel):
    nodes: List[Dict[str, Any]] = []  # Nodes (bridges, ports, VMs, containers)
    edges: List[Dict[str, Any]] = []  # Connections between nodes

