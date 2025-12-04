from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.schemas import HostConfig, HostStatus
from app.models.database import get_db, HostConfigDB, HostCache
from app.services.host_config import load_host_configs, get_host_config
from app.services.ssh_service import SSHService
import paramiko
import logging
from datetime import datetime
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hosts", tags=["hosts"])


class CreateHostRequest(BaseModel):
    name: str
    hostname: str
    port: int = 22
    username: str
    ssh_key_path: Optional[str] = None
    password: Optional[str] = None
    description: Optional[str] = None


class UpdateHostRequest(BaseModel):
    hostname: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    ssh_key_path: Optional[str] = None
    password: Optional[str] = None
    description: Optional[str] = None


@router.get("", response_model=List[HostConfig])
async def list_hosts(db: Session = Depends(get_db)):
    """List all configured Proxmox hosts"""
    return load_host_configs(db)


@router.post("", response_model=HostConfig)
async def create_host(request: CreateHostRequest, db: Session = Depends(get_db)):
    """Create a new host configuration - validates SSH connection before saving"""
    # Check if host already exists
    existing = db.query(HostConfigDB).filter(HostConfigDB.name == request.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Host with name '{request.name}' already exists")
    
    # Validate that either ssh_key_path or password is provided
    if not request.ssh_key_path and not request.password:
        raise HTTPException(status_code=400, detail="Either ssh_key_path or password must be provided")
    
    # Test SSH connection before saving to database
    test_config = HostConfig(
        name=request.name,
        hostname=request.hostname,
        port=request.port,
        username=request.username,
        ssh_key_path=request.ssh_key_path,
        password=request.password,
        description=request.description
    )
    
    try:
        ssh = SSHService(test_config)
        # Use validate_connection() which raises exceptions with detailed error messages
        ssh.validate_connection()
        
        # Test a simple command to verify authentication works
        try:
            stdout, stderr, exit_code = ssh.execute("echo 'test'")
            if exit_code != 0:
                ssh.disconnect()
                raise HTTPException(
                    status_code=401,
                    detail="Authentication successful but command execution failed. Check user permissions."
                )
        except Exception as e:
            ssh.disconnect()
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(
                status_code=401,
                detail=f"Authentication successful but unable to execute commands: {str(e)}"
            )
        ssh.disconnect()
        
    except HTTPException:
        raise
    except paramiko.AuthenticationException as e:
        raise HTTPException(
            status_code=401,
            detail="Authentication failed. Please verify your SSH key or password."
        )
    except paramiko.SSHException as e:
        error_msg = str(e)
        if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
            raise HTTPException(
                status_code=408,
                detail=f"Connection timeout. Unable to reach {request.hostname}:{request.port}. Check network connectivity and firewall rules."
            )
        else:
            raise HTTPException(
                status_code=401,
                detail=f"SSH connection error: {error_msg}"
            )
    except Exception as e:
        error_msg = str(e)
        if "No route to host" in error_msg or "Name or service not known" in error_msg or "getaddrinfo failed" in error_msg:
            raise HTTPException(
                status_code=404,
                detail=f"Host not found: {request.hostname}. Please verify the hostname or IP address."
            )
        elif "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
            raise HTTPException(
                status_code=408,
                detail=f"Connection timeout. Unable to reach {request.hostname}:{request.port}. Check network connectivity and firewall rules."
            )
        else:
            raise HTTPException(
                status_code=401,
                detail=f"Connection failed: {error_msg}"
            )
    
    # Only save to database if authentication was successful
    db_host = HostConfigDB(
        name=request.name,
        hostname=request.hostname,
        port=request.port,
        username=request.username,
        ssh_key_path=request.ssh_key_path,
        password=request.password,
        description=request.description
    )
    
    db.add(db_host)
    db.commit()
    db.refresh(db_host)
    
    return HostConfig(
        name=db_host.name,
        hostname=db_host.hostname,
        port=db_host.port,
        username=db_host.username,
        ssh_key_path=db_host.ssh_key_path,
        password=db_host.password,
        description=db_host.description
    )


@router.get("/{host_id}", response_model=HostConfig)
async def get_host(host_id: str, db: Session = Depends(get_db)):
    """Get a specific host configuration"""
    try:
        return get_host_config(host_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{host_id}", response_model=HostConfig)
async def update_host(host_id: str, request: UpdateHostRequest, db: Session = Depends(get_db)):
    """Update a host configuration"""
    db_host = db.query(HostConfigDB).filter(HostConfigDB.name == host_id).first()
    if not db_host:
        raise HTTPException(status_code=404, detail=f"Host '{host_id}' not found")
    
    # Update only provided fields
    if request.hostname is not None:
        db_host.hostname = request.hostname
    if request.port is not None:
        db_host.port = request.port
    if request.username is not None:
        db_host.username = request.username
    if request.ssh_key_path is not None:
        db_host.ssh_key_path = request.ssh_key_path
    if request.password is not None:
        db_host.password = request.password
    if request.description is not None:
        db_host.description = request.description
    
    db_host.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_host)
    
    return HostConfig(
        name=db_host.name,
        hostname=db_host.hostname,
        port=db_host.port,
        username=db_host.username,
        ssh_key_path=db_host.ssh_key_path,
        password=db_host.password,
        description=db_host.description
    )


@router.delete("/{host_id}", response_model=dict)
async def delete_host(host_id: str, db: Session = Depends(get_db)):
    """Delete a host configuration and all associated data"""
    db_host = db.query(HostConfigDB).filter(HostConfigDB.name == host_id).first()
    if not db_host:
        raise HTTPException(status_code=404, detail=f"Host '{host_id}' not found")
    
    # Delete all cache entries for this host
    db.query(HostCache).filter(HostCache.host_id == host_id).delete()
    
    # Delete port mapping file
    from app.services.port_mapping_service import PortMappingService
    import os
    cache_dir = os.getenv("CACHE_DIR", "./cache")
    port_mapping_service = PortMappingService(cache_dir=cache_dir)
    cache_path = port_mapping_service.get_cache_path(host_id)
    if os.path.exists(cache_path):
        try:
            os.remove(cache_path)
        except Exception as e:
            logger.warning(f"Failed to delete port mapping file: {e}")
    
    # Delete host configuration
    db.delete(db_host)
    db.commit()
    
    return {"status": "success", "message": f"Host '{host_id}' and all associated data deleted successfully"}


@router.get("/{host_id}/last-queried", response_model=HostStatus)
async def get_host_last_queried(host_id: str, db: Session = Depends(get_db)):
    """Get the last time data was queried from this host (no SSH connection)"""
    try:
        config = get_host_config(host_id, db)
        
        # Get the most recent last_updated from any cache entry for this host
        from app.models.database import HostCache
        latest_cache = db.query(HostCache).filter(
            HostCache.host_id == host_id
        ).order_by(HostCache.last_updated.desc()).first()
        
        last_queried = latest_cache.last_updated if latest_cache else None
        
        return HostStatus(
            host_id=host_id,
            name=config.name,
            connected=False,  # Not used anymore, kept for compatibility
            last_checked=last_queried,
            error=None
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        return HostStatus(
            host_id=host_id,
            name=host_id,
            connected=False,
            last_checked=None,
            error=str(e)
        )

