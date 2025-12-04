import { Port, VM, VMInterface } from '../types';
import { PortMapping } from '../services/api';

/**
 * Extract VM ID and interface number from a tap interface name
 * Format: tap<VMID>i<INTERFACE_NUMBER>
 * Example: tap101i0 -> { vmid: 101, interfaceNum: 0 }
 */
export function parseTapName(tapName: string): { vmid: number; interfaceNum: number } | null {
  const match = tapName.match(/^tap(\d+)i(\d+)$/);
  if (match) {
    return {
      vmid: parseInt(match[1], 10),
      interfaceNum: parseInt(match[2], 10),
    };
  }
  return null;
}

/**
 * Find the VM and interface information for a given port name
 */
export function findVMForPort(portName: string, vms: VM[]): { vm: VM; interface: VMInterface } | null {
  const tapInfo = parseTapName(portName);
  if (!tapInfo) {
    return null;
  }

  const vm = vms.find(v => v.vmid === tapInfo.vmid);
  if (!vm) {
    return null;
  }

  // Find interface by matching tap name directly (port name should match tap name)
  const interface_ = vm.interfaces.find(iface => iface.tap === portName);

  if (!interface_) {
    return null;
  }

  return { vm, interface: interface_ };
}

/**
 * Find container information for a port from port mapping
 */
export function findContainerForPort(portName: string, portMapping: PortMapping | null | undefined): { id: number; name: string; netid: string } | null {
  if (!portMapping?.ports) {
    return null;
  }
  
  const portInfo = portMapping.ports.find(p => p.port_name === portName);
  if (portInfo?.is_container && portInfo.container_id) {
    return {
      id: portInfo.container_id,
      name: portInfo.container_name || `CT${portInfo.container_id}`,
      netid: portInfo.interface_netid || 'unknown'
    };
  }
  return null;
}

/**
 * Get a human-readable label for a port showing VM or container information
 */
export function getPortLabel(portName: string, vms: VM[], portMapping?: PortMapping | null): string {
  const vmInfo = findVMForPort(portName, vms);
  if (vmInfo) {
    return `${portName} (VM ${vmInfo.vm.vmid}: ${vmInfo.vm.name} - ${vmInfo.interface.netid})`;
  }
  
  const containerInfo = findContainerForPort(portName, portMapping);
  if (containerInfo) {
    return `${portName} (PCT ${containerInfo.id}: ${containerInfo.name} - ${containerInfo.netid})`;
  }
  
  return portName;
}

/**
 * Get VM or container information for display
 */
export function getPortVMInfo(portName: string, vms: VM[], portMapping?: PortMapping | null): string | null {
  const vmInfo = findVMForPort(portName, vms);
  if (vmInfo) {
    return `VM ${vmInfo.vm.vmid} (${vmInfo.vm.name}) - ${vmInfo.interface.netid}`;
  }
  
  const containerInfo = findContainerForPort(portName, portMapping);
  if (containerInfo) {
    return `PCT ${containerInfo.id} (${containerInfo.name}) - ${containerInfo.netid}`;
  }
  
  return null;
}

