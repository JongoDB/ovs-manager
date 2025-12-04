from fastapi import APIRouter, HTTPException, Depends
from app.models.database import get_db, HostCache
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.ovsdb_service import OVSDBService
from app.services.port_mapping_service import PortMappingService
from sqlalchemy.orm import Session
from datetime import datetime
import os

router = APIRouter(prefix="/api/hosts/{host_id}", tags=["refresh"])

# Initialize the port mapping service
cache_dir = os.getenv("CACHE_DIR", "./cache")
port_mapping_service = PortMappingService(cache_dir=cache_dir)


@router.post("/refresh", response_model=dict)
async def refresh_host_data(host_id: str, db: Session = Depends(get_db)):
    """Refresh all cached data for a host including port mappings"""
    try:
        config = get_host_config(host_id, db)

        try:
            with SSHService(config) as ssh:
                ovsdb = OVSDBService(ssh)

                # Fetch all data
                bridges = ovsdb.get_bridges()
                mirrors = ovsdb.get_mirrors()
                vms = ovsdb.get_vms()
                containers = ovsdb.get_containers()

                # Update cache
                cache_types = {
                    'bridges': [b.dict() for b in bridges],
                    'mirrors': [m.dict() for m in mirrors],
                    'vms': [v.dict() for v in vms],
                    'containers': [c.dict() for c in containers]
                }

                for cache_type, data in cache_types.items():
                    # Delete old cache
                    db.query(HostCache).filter(
                        HostCache.host_id == host_id,
                        HostCache.cache_type == cache_type
                    ).delete()

                    # Create new cache entry
                    cache_entry = HostCache(
                        host_id=host_id,
                        cache_type=cache_type,
                        data=data,
                        last_updated=datetime.utcnow()
                    )
                    db.add(cache_entry)

                db.commit()

                # Also refresh port mapping
                port_mapping = port_mapping_service.refresh_mapping(host_id, ssh, config)
                ports_count = len(port_mapping.get('ports', [])) if port_mapping else 0

                return {
                    "status": "success",
                    "message": "Data refreshed successfully",
                    "bridges_count": len(bridges),
                    "mirrors_count": len(mirrors),
                    "vms_count": len(vms),
                    "containers_count": len(containers),
                    "ports_mapped": ports_count
                }
        except Exception as e:
            raise
            
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to refresh data: {str(e)}")

