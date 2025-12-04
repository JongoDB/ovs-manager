export interface Host {
  name: string;
  hostname: string;
  port: number;
  username: string;
  ssh_key_path?: string;
  password?: string;
  description?: string;
}

export interface HostStatus {
  host_id: string;
  name: string;
  connected: boolean;  // Deprecated, kept for compatibility
  last_checked?: string;  // This is now "last_queried"
  error?: string;
}

export interface Port {
  uuid: string;
  name: string;
  bridge?: string;
  type?: string;
  tag?: number;  // VLAN tag for access mode
  trunks?: number[];  // Trunk VLANs
  vlan_mode?: string;  // access, trunk, native-tagged, native-untagged
  interfaces: Array<{
    name: string;
    [key: string]: any;
  }>;
}

export interface Mirror {
  uuid: string;
  name?: string;
  bridge: string;
  select_src_port?: string[];
  select_dst_port?: string[];
  output_port?: string;
  output_vlan?: number[];
  select_all?: boolean;
}

export interface Bridge {
  uuid: string;
  name: string;
  ports: Port[];
  mirrors: Mirror[];
  cidr?: string;
  comment?: string;
  datapath_id?: string;
  fail_mode?: string;
  datapath_type?: string;
  stp_enable?: boolean;
  rstp_enable?: boolean;
  mcast_snooping_enable?: boolean;
}

export interface BridgeDetail extends Bridge {
  datapath_id: string;
  fail_mode: string;
  datapath_type: string;
  protocols?: string[];
  controller?: string;
  stp_enable: boolean;
  rstp_enable: boolean;
  mcast_snooping_enable: boolean;
}

export interface VMInterface {
  netid: string;
  tap: string;
  mac: string;
  bridge?: string;
}

export interface VM {
  vmid: number;
  name: string;
  status: string;
  interfaces: VMInterface[];
}

export interface Container {
  ctid: number;
  name: string;
  status: string;
  interfaces: VMInterface[];
}

