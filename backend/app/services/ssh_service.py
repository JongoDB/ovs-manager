import paramiko
import os
from typing import Optional
from app.models.schemas import HostConfig
import logging

logger = logging.getLogger(__name__)


class SSHService:
    """Service for managing SSH connections to Proxmox hosts"""
    
    def __init__(self, config: HostConfig):
        self.config = config
        self.client: Optional[paramiko.SSHClient] = None
    
    def connect(self) -> bool:
        """Establish SSH connection - returns False on failure for backward compatibility"""
        try:
            self._connect_internal()
            return True
        except Exception as e:
            logger.error(f"SSH connection failed: {e}")
            return False
    
    def _connect_internal(self):
        """Internal method that establishes SSH connection and raises exceptions"""
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        # Use key-based auth if available
        if self.config.ssh_key_path and os.path.exists(self.config.ssh_key_path):
            self.client.connect(
                hostname=self.config.hostname,
                port=self.config.port,
                username=self.config.username,
                key_filename=self.config.ssh_key_path,
                timeout=10
            )
        elif self.config.password:
            self.client.connect(
                hostname=self.config.hostname,
                port=self.config.port,
                username=self.config.username,
                password=self.config.password,
                timeout=10
            )
        else:
            # Try default key locations
            default_keys = [
                os.path.expanduser("~/.ssh/id_rsa"),
                os.path.expanduser("~/.ssh/id_ed25519"),
            ]
            for key_path in default_keys:
                if os.path.exists(key_path):
                    try:
                        self.client.connect(
                            hostname=self.config.hostname,
                            port=self.config.port,
                            username=self.config.username,
                            key_filename=key_path,
                            timeout=10
                        )
                        return
                    except:
                        continue
            raise Exception("No SSH authentication method available")
    
    def validate_connection(self):
        """Validate SSH connection and raise exceptions with detailed error messages"""
        try:
            self._connect_internal()
        except paramiko.AuthenticationException as e:
            logger.error(f"SSH authentication failed: {e}")
            raise
        except paramiko.SSHException as e:
            logger.error(f"SSH connection error: {e}")
            raise
        except Exception as e:
            logger.error(f"SSH connection failed: {e}")
            raise
    
    def execute(self, command: str) -> tuple[str, str, int]:
        """Execute command via SSH and return (stdout, stderr, exit_code)"""
        if not self.client:
            if not self.connect():
                raise Exception("SSH connection not available")
        
        try:
            stdin, stdout, stderr = self.client.exec_command(command)
            exit_code = stdout.channel.recv_exit_status()
            stdout_text = stdout.read().decode('utf-8')
            stderr_text = stderr.read().decode('utf-8')
            return stdout_text, stderr_text, exit_code
        except Exception as e:
            logger.error(f"Command execution failed: {e}")
            raise
    
    def execute_batch(self, commands: list[str]) -> list[tuple[str, str, int]]:
        """Execute multiple commands in sequence and return list of results"""
        results = []
        for command in commands:
            try:
                stdout, stderr, exit_code = self.execute(command)
                results.append((stdout, stderr, exit_code))
            except Exception as e:
                logger.error(f"Batch command failed: {command} - {e}")
                results.append(("", str(e), -1))
        return results

    def execute_transaction(self, transaction_parts: list[str]) -> tuple[str, str, int]:
        """
        Execute ovs-vsctl transaction with multiple commands using -- separator.
        Example: execute_transaction(['set', 'Bridge', 'br0', 'fail_mode=secure', '--', 'set', 'Bridge', 'br0', 'stp_enable=true'])
        """
        # Join all parts with proper spacing around --
        command = "ovs-vsctl " + " ".join(transaction_parts)
        return self.execute(command)

    def test_connection(self) -> dict:
        """
        Test SSH connection and return detailed status.
        Returns: {'success': bool, 'error': str | None, 'version': str | None}
        """
        try:
            self.validate_connection()
            # Try to get OVS version as a connection test
            stdout, stderr, exit_code = self.execute("ovs-vsctl --version")
            version_info = stdout.split('\n')[0] if exit_code == 0 else None
            return {
                'success': True,
                'error': None,
                'version': version_info
            }
        except paramiko.AuthenticationException:
            return {
                'success': False,
                'error': 'Authentication failed. Check username, password, or SSH key.',
                'version': None
            }
        except paramiko.SSHException as e:
            return {
                'success': False,
                'error': f'SSH error: {str(e)}',
                'version': None
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Connection failed: {str(e)}',
                'version': None
            }

    def get_ovs_version(self) -> Optional[str]:
        """Get OVS version string for compatibility checking"""
        try:
            stdout, stderr, exit_code = self.execute("ovs-vsctl --version")
            if exit_code == 0:
                # Parse first line: "ovs-vsctl (Open vSwitch) 2.17.0"
                version_line = stdout.split('\n')[0]
                if 'Open vSwitch' in version_line:
                    parts = version_line.split()
                    return parts[-1]  # Return version number
            return None
        except Exception as e:
            logger.error(f"Failed to get OVS version: {e}")
            return None

    def disconnect(self):
        """Close SSH connection"""
        if self.client:
            self.client.close()
            self.client = None

    def __enter__(self):
        self._connect_internal()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()

