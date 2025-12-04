import mockData from './mockData.json';
import { Host, Bridge, Mirror, VM, Container, HostStatus } from '../types';

const DEMO_HOST_ID = 'proxmox-demo';

// Simulate API delay
const delay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

export const demoHostsApi = {
  list: async (): Promise<Host[]> => {
    await delay();
    return mockData.hosts;
  },

  get: async (hostId: string): Promise<Host> => {
    await delay();
    const host = mockData.hosts.find(h => h.name === hostId);
    if (!host) throw new Error('Host not found');
    return host;
  },

  create: async (): Promise<Host> => {
    await delay();
    // In demo mode, pretend to create but don't actually do anything
    throw new Error('Cannot create hosts in demo mode');
  },

  update: async (): Promise<Host> => {
    await delay();
    throw new Error('Cannot update hosts in demo mode');
  },

  delete: async (): Promise<{ status: string; message: string }> => {
    await delay();
    throw new Error('Cannot delete hosts in demo mode');
  },

  getLastQueried: async (hostId: string): Promise<HostStatus> => {
    await delay();
    return {
      host_id: hostId,
      name: hostId,
      connected: true,
      last_checked: new Date().toISOString(),
    };
  },

  refresh: async (): Promise<{ status: string; message: string }> => {
    await delay();
    return { status: 'success', message: 'Demo data refreshed' };
  },
};

export const demoBridgesApi = {
  list: async (hostId: string): Promise<Bridge[]> => {
    await delay();
    return mockData.bridges[hostId as keyof typeof mockData.bridges] || [];
  },

  get: async (hostId: string, bridgeName: string): Promise<any> => {
    await delay();
    const bridges = mockData.bridges[hostId as keyof typeof mockData.bridges] || [];
    const bridge = bridges.find(b => b.name === bridgeName);
    if (!bridge) throw new Error('Bridge not found');
    return bridge;
  },

  create: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot create bridges in demo mode');
  },

  update: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot update bridges in demo mode');
  },

  delete: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot delete bridges in demo mode');
  },

  flushFdb: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot flush FDB in demo mode');
  },

  clearMirrors: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot clear mirrors in demo mode');
  },
};

export const demoMirrorsApi = {
  list: async (hostId: string): Promise<Mirror[]> => {
    await delay();
    const bridges = mockData.bridges[hostId as keyof typeof mockData.bridges] || [];
    return bridges.flatMap(b => b.mirrors);
  },

  create: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot create mirrors in demo mode');
  },

  clearBridgeMirrors: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot clear bridge mirrors in demo mode');
  },

  getStatistics: async (): Promise<any> => {
    await delay();
    return {};
  },

  delete: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot delete mirrors in demo mode');
  },

  testMirror: async (): Promise<any> => {
    await delay();
    return { status: 'success', message: 'Demo mode: mirror test not available' };
  },
};

export const demoVmsApi = {
  list: async (hostId: string): Promise<VM[]> => {
    await delay();
    return mockData.vms[hostId as keyof typeof mockData.vms] || [];
  },

  addInterface: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot add VM interfaces in demo mode');
  },

  removeInterface: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot remove VM interfaces in demo mode');
  },
};

export const demoContainersApi = {
  list: async (hostId: string): Promise<Container[]> => {
    await delay();
    return mockData.containers[hostId as keyof typeof mockData.containers] || [];
  },

  addInterface: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot add container interfaces in demo mode');
  },

  removeInterface: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot remove container interfaces in demo mode');
  },
};

export const demoPortsApi = {
  list: async (hostId: string): Promise<any[]> => {
    await delay();
    const bridges = mockData.bridges[hostId as keyof typeof mockData.bridges] || [];
    return bridges.flatMap(b => b.ports);
  },

  create: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot create ports in demo mode');
  },

  get: async (hostId: string, portName: string): Promise<any> => {
    await delay();
    const bridges = mockData.bridges[hostId as keyof typeof mockData.bridges] || [];
    const port = bridges.flatMap(b => b.ports).find(p => p.name === portName);
    if (!port) throw new Error('Port not found');
    return port;
  },

  update: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot update ports in demo mode');
  },

  delete: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot delete ports in demo mode');
  },

  setVlan: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot set VLAN in demo mode');
  },

  listAvailable: async (): Promise<string[]> => {
    await delay();
    return [];
  },
};

export const demoStatisticsApi = {
  get: async (hostId: string): Promise<any> => {
    await delay();
    return mockData.statistics[hostId as keyof typeof mockData.statistics] || {};
  },

  getAll: async (hostId: string): Promise<any> => {
    await delay();
    return mockData.statistics[hostId as keyof typeof mockData.statistics] || {};
  },

  getInterface: async (hostId: string, interfaceName: string): Promise<any> => {
    await delay();
    const stats = mockData.statistics[hostId as keyof typeof mockData.statistics] || {};
    return (stats as Record<string, any>)[interfaceName] || {};
  },

  getDelta: async (hostId: string): Promise<any> => {
    await delay();
    // Return empty delta stats for demo
    return {};
  },

  resetBaseline: async (hostId: string): Promise<any> => {
    await delay();
    return { message: 'Baseline reset in demo mode', interfaces: [] };
  },
};

export const demoDiagnosticsApi = {
  getOvsTopology: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: OVS topology not available' };
  },

  getOpenFlowPorts: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: OpenFlow ports not available' };
  },

  getMacTable: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: MAC table not available' };
  },

  getFlows: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: Flows not available' };
  },

  tracePacket: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: Packet trace not available' };
  },

  getPortStats: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: Port stats not available' };
  },

  getInterfaceStats: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: Interface stats not available' };
  },

  getInterfacesWithIps: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: Interfaces with IPs not available' };
  },

  ping: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: Ping not available' };
  },

  getArpTable: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: ARP table not available' };
  },

  getInterfaceConfig: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: Interface config not available' };
  },

  getDatapathFlows: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: Datapath flows not available' };
  },

  getBridgeProtocols: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: Bridge protocols not available' };
  },

  getConnectivityMatrix: async (): Promise<any> => {
    await delay();
    return { success: true, matrix: [] };
  },

  executeOvsVsctl: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: ovs-vsctl not available' };
  },

  executeOvsOfctl: async (): Promise<any> => {
    await delay();
    return { success: true, output: 'Demo mode: ovs-ofctl not available' };
  },
};

export const demoFlowExportApi = {
  configureNetflow: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot configure NetFlow in demo mode');
  },

  getNetflowConfig: async (): Promise<any> => {
    await delay();
    return {};
  },

  disableNetflow: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot disable NetFlow in demo mode');
  },

  configureSflow: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot configure sFlow in demo mode');
  },

  getSflowConfig: async (): Promise<any> => {
    await delay();
    return {};
  },

  disableSflow: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot disable sFlow in demo mode');
  },
};
