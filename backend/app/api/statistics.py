from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from sqlalchemy.orm import Session
from app.models.schemas import InterfaceStats
from app.models.database import get_db
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.ovsdb_service import OVSDBService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hosts/{host_id}/statistics", tags=["statistics"])

# In-memory storage for baseline stats (for delta calculation)
# In production, consider using Redis or database
baseline_stats_storage: Dict[str, Dict[str, InterfaceStats]] = {}


@router.get("/interfaces", response_model=Dict[str, InterfaceStats])
async def get_all_interface_stats(host_id: str, db: Session = Depends(get_db)):
    """Get statistics for all interfaces"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            stats = ovsdb.get_all_interface_stats()
            return stats
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting interface stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get interface stats: {str(e)}")


@router.get("/interfaces/{interface_name}", response_model=InterfaceStats)
async def get_interface_stats(host_id: str, interface_name: str, db: Session = Depends(get_db)):
    """Get statistics for a specific interface"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            stats = ovsdb.get_interface_stats(interface_name)

            if not stats:
                raise HTTPException(status_code=404, detail=f"Interface {interface_name} not found or has no statistics")

            return stats
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting interface stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get interface stats: {str(e)}")


@router.post("/reset-baseline", status_code=200)
async def reset_baseline(host_id: str, db: Session = Depends(get_db)):
    """Reset baseline for delta calculations"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            # Get current stats and store as baseline
            stats = ovsdb.get_all_interface_stats()

            if stats:
                baseline_stats_storage[host_id] = stats
                return {"message": f"Baseline reset for {len(stats)} interfaces", "interfaces": list(stats.keys())}
            else:
                return {"message": "No interfaces found to set baseline"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error resetting baseline: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reset baseline: {str(e)}")


@router.get("/interfaces/{interface_name}/delta", response_model=Dict[str, float])
async def get_interface_stats_delta(host_id: str, interface_name: str, db: Session = Depends(get_db)):
    """Get delta statistics (rates) for a specific interface"""
    try:
        # Check if baseline exists
        if host_id not in baseline_stats_storage or interface_name not in baseline_stats_storage[host_id]:
            raise HTTPException(
                status_code=400,
                detail=f"No baseline found for interface {interface_name}. Call /reset-baseline first."
            )

        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            current_stats = ovsdb.get_interface_stats(interface_name)

            if not current_stats:
                raise HTTPException(status_code=404, detail=f"Interface {interface_name} not found")

            baseline_stats = baseline_stats_storage[host_id][interface_name]
            delta = ovsdb.calculate_stats_delta(baseline_stats, current_stats)

            return delta
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating stats delta: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate stats delta: {str(e)}")


@router.get("/delta", response_model=Dict[str, Dict[str, float]])
async def get_all_stats_delta(host_id: str, db: Session = Depends(get_db)):
    """Get delta statistics (rates) for all interfaces"""
    try:
        # Check if baseline exists
        if host_id not in baseline_stats_storage:
            raise HTTPException(
                status_code=400,
                detail="No baseline found. Call /reset-baseline first."
            )

        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            current_stats = ovsdb.get_all_interface_stats()

            deltas = {}
            baseline_stats = baseline_stats_storage[host_id]

            for interface_name, current in current_stats.items():
                if interface_name in baseline_stats:
                    baseline = baseline_stats[interface_name]
                    delta = ovsdb.calculate_stats_delta(baseline, current)
                    deltas[interface_name] = delta

            return deltas
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating stats deltas: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate stats deltas: {str(e)}")
