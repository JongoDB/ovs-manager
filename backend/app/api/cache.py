from fastapi import APIRouter, HTTPException, Depends
from app.models.database import get_db, HostCache
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.ovsdb_service import OVSDBService
from app.services.port_mapping_service import PortMappingService
from sqlalchemy.orm import Session
from datetime import datetime
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hosts/{host_id}/cache", tags=["cache"])

# Initialize the port mapping service
cache_dir = os.getenv("CACHE_DIR", "./cache")
port_mapping_service = PortMappingService(cache_dir=cache_dir)


@router.post("/bridges/refresh", response_model=dict)
async def refresh_bridges_cache(host_id: str, db: Session = Depends(get_db)):
    """Invalidate and refresh only the bridges cache"""
    try:
        config = get_host_config(host_id, db)

        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            bridges = ovsdb.get_bridges()

            # Delete old cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()

            # Create new cache entry
            cache_entry = HostCache(
                host_id=host_id,
                cache_type='bridges',
                data=[b.dict() for b in bridges],
                last_updated=datetime.utcnow()
            )
            db.add(cache_entry)
            db.commit()

            return {
                "status": "success",
                "message": "Bridges cache refreshed",
                "count": len(bridges)
            }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error refreshing bridges cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to refresh bridges cache: {str(e)}")


@router.post("/mirrors/refresh", response_model=dict)
async def refresh_mirrors_cache(host_id: str, db: Session = Depends(get_db)):
    """Invalidate and refresh only the mirrors cache"""
    try:
        config = get_host_config(host_id, db)

        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            mirrors = ovsdb.get_mirrors()

            # Delete old cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'mirrors'
            ).delete()

            # Create new cache entry
            cache_entry = HostCache(
                host_id=host_id,
                cache_type='mirrors',
                data=[m.dict() for m in mirrors],
                last_updated=datetime.utcnow()
            )
            db.add(cache_entry)
            db.commit()

            return {
                "status": "success",
                "message": "Mirrors cache refreshed",
                "count": len(mirrors)
            }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error refreshing mirrors cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to refresh mirrors cache: {str(e)}")


@router.post("/vms/refresh", response_model=dict)
async def refresh_vms_cache(host_id: str, db: Session = Depends(get_db)):
    """Invalidate and refresh only the VMs cache"""
    try:
        config = get_host_config(host_id, db)

        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            vms = ovsdb.get_vms()

            # Delete old cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'vms'
            ).delete()

            # Create new cache entry
            cache_entry = HostCache(
                host_id=host_id,
                cache_type='vms',
                data=[v.dict() for v in vms],
                last_updated=datetime.utcnow()
            )
            db.add(cache_entry)
            db.commit()

            return {
                "status": "success",
                "message": "VMs cache refreshed",
                "count": len(vms)
            }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error refreshing VMs cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to refresh VMs cache: {str(e)}")


@router.post("/containers/refresh", response_model=dict)
async def refresh_containers_cache(host_id: str, db: Session = Depends(get_db)):
    """Invalidate and refresh only the containers cache"""
    try:
        config = get_host_config(host_id, db)

        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            containers = ovsdb.get_containers()

            # Delete old cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'containers'
            ).delete()

            # Create new cache entry
            cache_entry = HostCache(
                host_id=host_id,
                cache_type='containers',
                data=[c.dict() for c in containers],
                last_updated=datetime.utcnow()
            )
            db.add(cache_entry)
            db.commit()

            return {
                "status": "success",
                "message": "Containers cache refreshed",
                "count": len(containers)
            }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error refreshing containers cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to refresh containers cache: {str(e)}")


@router.delete("/{cache_type}", response_model=dict)
async def invalidate_cache(host_id: str, cache_type: str, db: Session = Depends(get_db)):
    """Invalidate a specific cache type without refreshing"""
    try:
        valid_types = ['bridges', 'mirrors', 'vms', 'containers']
        if cache_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid cache type. Must be one of: {', '.join(valid_types)}"
            )

        # Delete cache
        deleted_count = db.query(HostCache).filter(
            HostCache.host_id == host_id,
            HostCache.cache_type == cache_type
        ).delete()
        db.commit()

        return {
            "status": "success",
            "message": f"{cache_type.capitalize()} cache invalidated",
            "deleted": deleted_count > 0
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error invalidating cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to invalidate cache: {str(e)}")
