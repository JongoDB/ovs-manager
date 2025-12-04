import logging
from typing import Optional, Dict, Any, List
from app.services.ssh_service import SSHService
from app.models.schemas import FlowExportConfig

logger = logging.getLogger(__name__)


class FlowExportService:
    """Service for managing NetFlow, sFlow, and IPFIX flow export configurations"""

    def __init__(self, ssh_service: SSHService):
        self.ssh = ssh_service

    # ======================
    # NetFlow
    # ======================

    def configure_netflow(self, bridge: str, targets: List[str], active_timeout: Optional[int] = None,
                          engine_id: Optional[int] = None, engine_type: Optional[int] = None) -> bool:
        """Configure NetFlow export for a bridge"""
        try:
            # Build NetFlow configuration
            # Format: ovs-vsctl -- set Bridge <bridge> netflow=@nf -- --id=@nf create NetFlow targets=\"<targets>\" ...
            targets_str = '\\\"' + '\\",\\\"'.join(targets) + '\\\"'

            command_parts = [
                f"--id=@nf create NetFlow targets=[{targets_str}]"
            ]

            # Add optional parameters
            if active_timeout is not None:
                command_parts.append(f"active_timeout={active_timeout}")
            if engine_id is not None:
                command_parts.append(f"engine_id={engine_id}")
            if engine_type is not None:
                command_parts.append(f"engine_type={engine_type}")

            # Join options
            netflow_params = " ".join(command_parts)

            command = f"ovs-vsctl -- set Bridge {bridge} netflow=@nf -- {netflow_params}"

            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to configure NetFlow: {stderr}")
                return False

            logger.info(f"Successfully configured NetFlow on bridge {bridge}")
            return True
        except Exception as e:
            logger.error(f"Error configuring NetFlow: {e}")
            return False

    def get_netflow_config(self, bridge: str) -> Optional[FlowExportConfig]:
        """Get NetFlow configuration for a bridge"""
        try:
            # Check if NetFlow is configured
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl get Bridge {bridge} netflow")
            if exit_code != 0 or not stdout.strip() or stdout.strip() == '[]':
                return None

            netflow_uuid = stdout.strip()

            # Get NetFlow details
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl list NetFlow {netflow_uuid}")
            if exit_code != 0:
                return None

            netflow_data = self._parse_ovs_list_output(stdout)

            # Parse targets
            targets = self._parse_array_field(netflow_data.get('targets', '[]'))

            return FlowExportConfig(
                protocol="netflow",
                bridge=bridge,
                targets=targets,
                active_timeout=int(netflow_data['active_timeout']) if netflow_data.get('active_timeout') else None,
                engine_id=int(netflow_data['engine_id']) if netflow_data.get('engine_id') else None,
                engine_type=int(netflow_data['engine_type']) if netflow_data.get('engine_type') else None
            )
        except Exception as e:
            logger.error(f"Error getting NetFlow config: {e}")
            return None

    def disable_netflow(self, bridge: str) -> bool:
        """Disable NetFlow export for a bridge"""
        try:
            command = f"ovs-vsctl clear Bridge {bridge} netflow"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to disable NetFlow: {stderr}")
                return False

            logger.info(f"Successfully disabled NetFlow on bridge {bridge}")
            return True
        except Exception as e:
            logger.error(f"Error disabling NetFlow: {e}")
            return False

    # ======================
    # sFlow
    # ======================

    def configure_sflow(self, bridge: str, targets: List[str], header: Optional[int] = None,
                       sampling: Optional[int] = None, polling: Optional[int] = None) -> bool:
        """Configure sFlow export for a bridge"""
        try:
            # Build sFlow configuration
            targets_str = '\\\"' + '\\",\\\"'.join(targets) + '\\\"'

            command_parts = [
                f"--id=@sf create sFlow targets=[{targets_str}]"
            ]

            # Add optional parameters
            if header is not None:
                command_parts.append(f"header={header}")
            if sampling is not None:
                command_parts.append(f"sampling={sampling}")
            if polling is not None:
                command_parts.append(f"polling={polling}")

            # Join options
            sflow_params = " ".join(command_parts)

            command = f"ovs-vsctl -- set Bridge {bridge} sflow=@sf -- {sflow_params}"

            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to configure sFlow: {stderr}")
                return False

            logger.info(f"Successfully configured sFlow on bridge {bridge}")
            return True
        except Exception as e:
            logger.error(f"Error configuring sFlow: {e}")
            return False

    def get_sflow_config(self, bridge: str) -> Optional[FlowExportConfig]:
        """Get sFlow configuration for a bridge"""
        try:
            # Check if sFlow is configured
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl get Bridge {bridge} sflow")
            if exit_code != 0 or not stdout.strip() or stdout.strip() == '[]':
                return None

            sflow_uuid = stdout.strip()

            # Get sFlow details
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl list sFlow {sflow_uuid}")
            if exit_code != 0:
                return None

            sflow_data = self._parse_ovs_list_output(stdout)

            # Parse targets
            targets = self._parse_array_field(sflow_data.get('targets', '[]'))

            return FlowExportConfig(
                protocol="sflow",
                bridge=bridge,
                targets=targets,
                header=int(sflow_data['header']) if sflow_data.get('header') else None,
                sampling=int(sflow_data['sampling']) if sflow_data.get('sampling') else None,
                polling=int(sflow_data['polling']) if sflow_data.get('polling') else None
            )
        except Exception as e:
            logger.error(f"Error getting sFlow config: {e}")
            return None

    def disable_sflow(self, bridge: str) -> bool:
        """Disable sFlow export for a bridge"""
        try:
            command = f"ovs-vsctl clear Bridge {bridge} sflow"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to disable sFlow: {stderr}")
                return False

            logger.info(f"Successfully disabled sFlow on bridge {bridge}")
            return True
        except Exception as e:
            logger.error(f"Error disabling sFlow: {e}")
            return False

    # ======================
    # IPFIX
    # ======================

    def configure_ipfix(self, bridge: str, targets: List[str], obs_domain_id: Optional[int] = None,
                       obs_point_id: Optional[int] = None, cache_active_timeout: Optional[int] = None,
                       cache_max_flows: Optional[int] = None) -> bool:
        """Configure IPFIX export for a bridge"""
        try:
            # Build IPFIX configuration
            targets_str = '\\\"' + '\\",\\\"'.join(targets) + '\\\"'

            command_parts = [
                f"--id=@ipfix create IPFIX targets=[{targets_str}]"
            ]

            # Add optional parameters
            if obs_domain_id is not None:
                command_parts.append(f"obs_domain_id={obs_domain_id}")
            if obs_point_id is not None:
                command_parts.append(f"obs_point_id={obs_point_id}")
            if cache_active_timeout is not None:
                command_parts.append(f"cache_active_timeout={cache_active_timeout}")
            if cache_max_flows is not None:
                command_parts.append(f"cache_max_flows={cache_max_flows}")

            # Join options
            ipfix_params = " ".join(command_parts)

            command = f"ovs-vsctl -- set Bridge {bridge} ipfix=@ipfix -- {ipfix_params}"

            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to configure IPFIX: {stderr}")
                return False

            logger.info(f"Successfully configured IPFIX on bridge {bridge}")
            return True
        except Exception as e:
            logger.error(f"Error configuring IPFIX: {e}")
            return False

    def get_ipfix_config(self, bridge: str) -> Optional[FlowExportConfig]:
        """Get IPFIX configuration for a bridge"""
        try:
            # Check if IPFIX is configured
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl get Bridge {bridge} ipfix")
            if exit_code != 0 or not stdout.strip() or stdout.strip() == '[]':
                return None

            ipfix_uuid = stdout.strip()

            # Get IPFIX details
            stdout, stderr, exit_code = self.ssh.execute(f"ovs-vsctl list IPFIX {ipfix_uuid}")
            if exit_code != 0:
                return None

            ipfix_data = self._parse_ovs_list_output(stdout)

            # Parse targets
            targets = self._parse_array_field(ipfix_data.get('targets', '[]'))

            return FlowExportConfig(
                protocol="ipfix",
                bridge=bridge,
                targets=targets,
                obs_domain_id=int(ipfix_data['obs_domain_id']) if ipfix_data.get('obs_domain_id') else None,
                obs_point_id=int(ipfix_data['obs_point_id']) if ipfix_data.get('obs_point_id') else None,
                cache_active_timeout=int(ipfix_data['cache_active_timeout']) if ipfix_data.get('cache_active_timeout') else None,
                cache_max_flows=int(ipfix_data['cache_max_flows']) if ipfix_data.get('cache_max_flows') else None
            )
        except Exception as e:
            logger.error(f"Error getting IPFIX config: {e}")
            return None

    def disable_ipfix(self, bridge: str) -> bool:
        """Disable IPFIX export for a bridge"""
        try:
            command = f"ovs-vsctl clear Bridge {bridge} ipfix"
            stdout, stderr, exit_code = self.ssh.execute(command)
            if exit_code != 0:
                logger.error(f"Failed to disable IPFIX: {stderr}")
                return False

            logger.info(f"Successfully disabled IPFIX on bridge {bridge}")
            return True
        except Exception as e:
            logger.error(f"Error disabling IPFIX: {e}")
            return False

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
        """Parse array field from OVS output (e.g., [target1, target2])"""
        field_value = field_value.strip()
        if field_value.startswith('[') and field_value.endswith(']'):
            content = field_value[1:-1].strip()
            if not content:
                return []
            # Remove quotes and parse
            items = [item.strip().strip('"').strip("'") for item in content.split(',')]
            return [item for item in items if item]
        return []
