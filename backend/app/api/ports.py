from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.schemas import PortDetail, CreatePortRequest, UpdatePortRequest
from app.models.database import get_db, HostCache
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.ovsdb_service import OVSDBService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hosts/{host_id}", tags=["ports"])


@router.get("/ports", response_model=List[PortDetail])
async def get_all_ports(host_id: str, db: Session = Depends(get_db)):
    """Get all ports across all bridges for a host"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            bridges = ovsdb.get_bridges()

            all_ports = []
            for bridge in bridges:
                for port in bridge.ports:
                    port_detail = ovsdb.get_port_details(port.name)
                    if port_detail:
                        all_ports.append(port_detail)

            return all_ports
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting ports: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get ports: {str(e)}")


@router.post("/bridges/{bridge_name}/ports", status_code=201)
async def add_port(host_id: str, bridge_name: str, request: CreatePortRequest, db: Session = Depends(get_db)):
    """Add a port to a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.add_port(
                bridge=bridge_name,
                port_name=request.name,
                port_type=request.port_type,
                options=request.options
            )

            if not success:
                raise HTTPException(status_code=500, detail="Failed to add port")

            # Invalidate bridge cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()
            db.commit()

            return {"message": f"Port {request.name} added to bridge {bridge_name} successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding port: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add port: {str(e)}")


@router.delete("/ports/{port_name}", status_code=200)
async def delete_port(host_id: str, port_name: str, bridge_name: str, db: Session = Depends(get_db)):
    """Delete a port from a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.delete_port(bridge_name, port_name)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to delete port")

            # Invalidate bridge cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()
            db.commit()

            return {"message": f"Port {port_name} deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting port: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete port: {str(e)}")


@router.put("/ports/{port_name}", status_code=200)
async def update_port(host_id: str, port_name: str, request: UpdatePortRequest, db: Session = Depends(get_db)):
    """Update port properties"""
    try:
        config = get_host_config(host_id, db)

        # Build properties dict from request, excluding None values
        properties = {}
        if request.tag is not None:
            properties['tag'] = request.tag
        if request.trunks is not None:
            properties['trunks'] = request.trunks
        if request.vlan_mode is not None:
            properties['vlan_mode'] = request.vlan_mode

        if not properties:
            return {"message": "No properties to update"}

        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.update_port(port_name, properties)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to update port")

            # Invalidate bridge cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()
            db.commit()

            return {"message": f"Port {port_name} updated successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating port: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update port: {str(e)}")


@router.get("/ports/{port_name}", response_model=PortDetail)
async def get_port_details(host_id: str, port_name: str, db: Session = Depends(get_db)):
    """Get detailed information about a port"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            port_detail = ovsdb.get_port_details(port_name)

            if not port_detail:
                raise HTTPException(status_code=404, detail=f"Port {port_name} not found")

            return port_detail
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting port details: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get port details: {str(e)}")


@router.put("/ports/{port_name}/vlan", status_code=200)
async def configure_port_vlan(host_id: str, port_name: str, vlan_id: int, mode: str = "access", db: Session = Depends(get_db)):
    """Configure VLAN for a port"""
    try:
        if mode not in ["access", "trunk", "native-tagged", "native-untagged"]:
            raise HTTPException(status_code=400, detail="Invalid VLAN mode. Must be: access, trunk, native-tagged, or native-untagged")

        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.set_port_vlan(port_name, vlan_id, mode)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to configure port VLAN")

            # Invalidate bridge cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()
            db.commit()

            return {"message": f"VLAN configured successfully for port {port_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error configuring port VLAN: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to configure VLAN: {str(e)}")


@router.get("/ports/available", response_model=List[str])
async def list_available_interfaces(host_id: str, db: Session = Depends(get_db)):
    """List system interfaces that could be added to OVS"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            interfaces = ovsdb.list_available_interfaces()
            return interfaces
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing available interfaces: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list interfaces: {str(e)}")
