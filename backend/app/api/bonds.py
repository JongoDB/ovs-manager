from fastapi import APIRouter, HTTPException, Depends
from typing import List
from sqlalchemy.orm import Session
from app.models.schemas import BondStatus, LACPStatus, CreateBondRequest, UpdateBondRequest, PortDetail
from app.models.database import get_db, HostCache
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.ovsdb_service import OVSDBService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hosts/{host_id}", tags=["bonds"])


@router.post("/bridges/{bridge_name}/bonds", status_code=201)
async def create_bond(host_id: str, bridge_name: str, request: CreateBondRequest, db: Session = Depends(get_db)):
    """Create a bond from multiple interfaces"""
    try:
        if len(request.interfaces) < 2:
            raise HTTPException(status_code=400, detail="Bond requires at least 2 interfaces")

        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.create_bond(
                bridge=bridge_name,
                bond_name=request.name,
                interfaces=request.interfaces,
                mode=request.mode,
                lacp=request.lacp
            )

            if not success:
                raise HTTPException(status_code=500, detail="Failed to create bond")

            # Invalidate bridge cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()
            db.commit()

            return {"message": f"Bond {request.name} created successfully on bridge {bridge_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating bond: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create bond: {str(e)}")


@router.get("/bonds", response_model=List[PortDetail])
async def list_bonds(host_id: str, db: Session = Depends(get_db)):
    """List all bonds across all bridges"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            bridges = ovsdb.get_bridges()

            bonds = []
            for bridge in bridges:
                for port in bridge.ports:
                    port_detail = ovsdb.get_port_details(port.name)
                    # Check if this is a bond (has bond_mode set)
                    if port_detail and port_detail.bond_mode:
                        bonds.append(port_detail)

            return bonds
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing bonds: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list bonds: {str(e)}")


@router.get("/bonds/{bond_name}", response_model=BondStatus)
async def get_bond_status(host_id: str, bond_name: str, db: Session = Depends(get_db)):
    """Get bond health and slave status"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            bond_status = ovsdb.get_bond_status(bond_name)

            if not bond_status:
                raise HTTPException(status_code=404, detail=f"Bond {bond_name} not found")

            return bond_status
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting bond status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get bond status: {str(e)}")


@router.put("/bonds/{bond_name}", status_code=200)
async def update_bond(host_id: str, bond_name: str, request: UpdateBondRequest, db: Session = Depends(get_db)):
    """Update bond settings"""
    try:
        config = get_host_config(host_id, db)

        # Build properties dict from request, excluding None values
        properties = {}
        if request.mode is not None:
            properties['bond_mode'] = request.mode
        if request.lacp is not None:
            properties['lacp'] = request.lacp
        if request.bond_updelay is not None:
            properties['bond_updelay'] = request.bond_updelay
        if request.bond_downdelay is not None:
            properties['bond_downdelay'] = request.bond_downdelay

        if not properties:
            return {"message": "No properties to update"}

        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.update_bond(bond_name, properties)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to update bond")

            # Invalidate bridge cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()
            db.commit()

            return {"message": f"Bond {bond_name} updated successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating bond: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update bond: {str(e)}")


@router.delete("/bonds/{bond_name}", status_code=200)
async def delete_bond(host_id: str, bond_name: str, bridge_name: str, db: Session = Depends(get_db)):
    """Delete a bond"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            # Deleting a bond is the same as deleting a port
            success = ovsdb.delete_port(bridge_name, bond_name)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to delete bond")

            # Invalidate bridge cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'bridges'
            ).delete()
            db.commit()

            return {"message": f"Bond {bond_name} deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bond: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete bond: {str(e)}")


@router.post("/bonds/{bond_name}/slaves/{slave}/enable", status_code=200)
async def enable_bond_slave(host_id: str, bond_name: str, slave: str, db: Session = Depends(get_db)):
    """Enable a bond slave"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.enable_disable_bond_slave(bond_name, slave, enabled=True)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to enable bond slave")

            return {"message": f"Slave {slave} enabled successfully on bond {bond_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enabling bond slave: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to enable bond slave: {str(e)}")


@router.post("/bonds/{bond_name}/slaves/{slave}/disable", status_code=200)
async def disable_bond_slave(host_id: str, bond_name: str, slave: str, db: Session = Depends(get_db)):
    """Disable a bond slave"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.enable_disable_bond_slave(bond_name, slave, enabled=False)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to disable bond slave")

            return {"message": f"Slave {slave} disabled successfully on bond {bond_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disabling bond slave: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to disable bond slave: {str(e)}")


@router.get("/bonds/{bond_name}/lacp", response_model=LACPStatus)
async def get_lacp_status(host_id: str, bond_name: str, db: Session = Depends(get_db)):
    """Get LACP negotiation details"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            lacp_status = ovsdb.get_lacp_status(bond_name)

            if not lacp_status:
                raise HTTPException(status_code=404, detail=f"LACP status not available for bond {bond_name}")

            return lacp_status
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting LACP status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get LACP status: {str(e)}")
