from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.schemas import Bridge, BridgeDetail, CreateBridgeRequest, UpdateBridgeRequest
from app.models.database import get_db, HostCache
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.ovsdb_service import OVSDBService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hosts/{host_id}/bridges", tags=["bridges"])


@router.get("", response_model=List[Bridge])
async def get_bridges(host_id: str, db: Session = Depends(get_db)):
    """Get all OVS bridges for a host - uses cache if available, otherwise queries host"""
    try:
        # Check cache first
        cache_entry = db.query(HostCache).filter(
            HostCache.host_id == host_id,
            HostCache.cache_type == 'bridges'
        ).first()
        
        if cache_entry and cache_entry.data:
            # Return cached data
            return [Bridge(**item) for item in cache_entry.data]
        
        # No cache, query host
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            bridges = ovsdb.get_bridges()
            
            # Cache the results
            if bridges:
                # Delete old cache
                db.query(HostCache).filter(
                    HostCache.host_id == host_id,
                    HostCache.cache_type == 'bridges'
                ).delete()
                
                # Create new cache entry
                cache_entry = HostCache(
                    host_id=host_id,
                    cache_type='bridges',
                    data=[b.dict() for b in bridges]
                )
                db.add(cache_entry)
                db.commit()
            
            return bridges
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get bridges: {str(e)}")


@router.post("", status_code=201)
async def create_bridge(host_id: str, request: CreateBridgeRequest, db: Session = Depends(get_db)):
    """Create a new OVS bridge with Proxmox network configuration"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            ovsdb.create_bridge(
                name=request.name,
                fail_mode=request.fail_mode,
                datapath_type=request.datapath_type,
                ipv4_cidr=request.ipv4_cidr,
                ipv4_gateway=request.ipv4_gateway,
                ipv6_cidr=request.ipv6_cidr,
                ipv6_gateway=request.ipv6_gateway,
                bridge_ports=request.bridge_ports,
                autostart=request.autostart,
                ovs_options=request.ovs_options,
                comment=request.comment,
                mtu=request.mtu
            )

            # Invalidate cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()
            db.commit()

            return {"message": f"Bridge {request.name} created successfully and added to Proxmox network configuration"}
    except ValueError as e:
        # Validation errors - return 400 Bad Request with detailed message
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating bridge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{bridge_name}", status_code=200)
async def delete_bridge(host_id: str, bridge_name: str, db: Session = Depends(get_db)):
    """Delete an OVS bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            ovsdb.delete_bridge(bridge_name)

            # Invalidate cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()
            db.commit()

            return {"message": f"Bridge {bridge_name} deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bridge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{bridge_name}/clear-mirrors", status_code=200)
async def clear_bridge_mirrors(host_id: str, bridge_name: str, db: Session = Depends(get_db)):
    """Clear all mirrors on a bridge (failsafe force destroy)"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            # Execute ovs-vsctl clear Bridge bridge_name mirrors
            cmd = f"ovs-vsctl clear Bridge {bridge_name} mirrors"
            stdout, stderr, exit_code = ssh.execute(cmd)

            if exit_code != 0:
                raise HTTPException(status_code=500, detail=f"Failed to clear mirrors: {stderr}")

            # Invalidate caches for both bridges and mirrors
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type.in_(['bridges', 'mirrors'])
            ).delete()
            db.commit()

            return {"message": f"All mirrors cleared from bridge {bridge_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing mirrors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{bridge_name}", status_code=200)
async def update_bridge(host_id: str, bridge_name: str, request: UpdateBridgeRequest, db: Session = Depends(get_db)):
    """Update bridge properties"""
    try:
        config = get_host_config(host_id, db)

        # Build properties dict from request, excluding None values
        properties = {}
        if request.fail_mode is not None:
            properties['fail_mode'] = request.fail_mode
        if request.datapath_type is not None:
            properties['datapath_type'] = request.datapath_type
        if request.protocols is not None:
            properties['protocols'] = request.protocols
        if request.controller is not None:
            properties['controller'] = request.controller
        if request.stp_enable is not None:
            properties['stp_enable'] = request.stp_enable
        if request.rstp_enable is not None:
            properties['rstp_enable'] = request.rstp_enable
        if request.mcast_snooping_enable is not None:
            properties['mcast_snooping_enable'] = request.mcast_snooping_enable

        if not properties:
            return {"message": "No properties to update"}

        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.update_bridge(bridge_name, properties)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to update bridge")

            # Invalidate cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()
            db.commit()

            return {"message": f"Bridge {bridge_name} updated successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating bridge: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update bridge: {str(e)}")


@router.get("/{bridge_name}/details", response_model=BridgeDetail)
async def get_bridge_details(host_id: str, bridge_name: str, db: Session = Depends(get_db)):
    """Get detailed information about a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            bridge_detail = ovsdb.get_bridge_details(bridge_name)

            if not bridge_detail:
                raise HTTPException(status_code=404, detail=f"Bridge {bridge_name} not found")

            return bridge_detail
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting bridge details: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get bridge details: {str(e)}")


@router.post("/{bridge_name}/flush-fdb", status_code=200)
async def flush_bridge_fdb(host_id: str, bridge_name: str, db: Session = Depends(get_db)):
    """Flush MAC learning table for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.flush_bridge_fdb(bridge_name)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to flush bridge FDB")

            return {"message": f"FDB flushed successfully for bridge {bridge_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error flushing bridge FDB: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to flush FDB: {str(e)}")

