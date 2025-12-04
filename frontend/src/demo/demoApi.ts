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

  delete: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot delete mirrors in demo mode');
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
    return stats[interfaceName] || {};
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
  execute: async (): Promise<any> => {
    await delay();
    return {
      stdout: 'Demo mode: Diagnostic commands are not available',
      stderr: '',
      exit_code: 0
    };
  },
};

export const demoFlowExportApi = {
  list: async (): Promise<any[]> => {
    await delay();
    return [];
  },

  create: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot create flow exports in demo mode');
  },

  delete: async (): Promise<any> => {
    await delay();
    throw new Error('Cannot delete flow exports in demo mode');
  },
};
