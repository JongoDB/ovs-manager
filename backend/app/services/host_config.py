from typing import List
from sqlalchemy.orm import Session
from app.models.schemas import HostConfig
from app.models.database import HostConfigDB


def load_host_configs(db: Session) -> List[HostConfig]:
    """Load host configurations from database"""
    db_hosts = db.query(HostConfigDB).all()
    return [
        HostConfig(
            name=host.name,
            hostname=host.hostname,
            port=host.port,
            username=host.username,
            ssh_key_path=host.ssh_key_path,
            password=host.password,
            description=host.description
        )
        for host in db_hosts
    ]


def get_host_config(host_id: str, db: Session) -> HostConfig:
    """Get configuration for a specific host from database"""
    db_host = db.query(HostConfigDB).filter(HostConfigDB.name == host_id).first()
    if not db_host:
        raise ValueError(f"Host {host_id} not found in configuration")
    
    return HostConfig(
        name=db_host.name,
        hostname=db_host.hostname,
        port=db_host.port,
        username=db_host.username,
        ssh_key_path=db_host.ssh_key_path,
        password=db_host.password,
        description=db_host.description
    )

