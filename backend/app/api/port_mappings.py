from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Optional
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.port_mapping_service import PortMappingService
import os

router = APIRouter(prefix="/api/hosts/{host_id}/port-mappings", tags=["port-mappings"])

# Initialize the port mapping service
cache_dir = os.getenv("CACHE_DIR", "./cache")
port_mapping_service = PortMappingService(cache_dir=cache_dir)


@router.get("", response_model=Dict)
async def get_port_mapping(host_id: str, db: Session = Depends(get_db)):
    """Get cached port-to-VM mapping for a host - creates mapping if it doesn't exist"""
    try:
        # Try to load from cache first
        mapping = port_mapping_service.load_mapping(host_id)
        
        # If no cache exists, create it automatically (like other endpoints)
        if mapping is None:
            config = get_host_config(host_id, db)
            with SSHService(config) as ssh:
                mapping = port_mapping_service.refresh_mapping(host_id, ssh, config)
                if not mapping:
                    raise HTTPException(status_code=500, detail="Failed to build port mapping")
        
        return mapping
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get port mapping: {str(e)}")


@router.post("/refresh", response_model=Dict)
async def refresh_port_mapping(host_id: str, db: Session = Depends(get_db)):
    """Refresh port-to-VM mapping by querying the host"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            mapping = port_mapping_service.refresh_mapping(host_id, ssh, config)
            if not mapping:
                raise HTTPException(status_code=500, detail="Failed to build port mapping")
            return mapping
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to refresh port mapping: {str(e)}")

