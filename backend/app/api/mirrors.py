from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.models.schemas import Mirror, CreateMirrorRequest, DeleteMirrorRequest
from app.models.database import get_db, HostCache
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.ovsdb_service import OVSDBService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hosts/{host_id}/mirrors", tags=["mirrors"])


@router.get("", response_model=List[Mirror])
async def get_mirrors(host_id: str, db: Session = Depends(get_db)):
    """Get all OVS mirrors for a host - uses cache if available, otherwise queries host"""
    try:
        # Check cache first
        cache_entry = db.query(HostCache).filter(
            HostCache.host_id == host_id,
            HostCache.cache_type == 'mirrors'
        ).first()
        
        if cache_entry and cache_entry.data:
            # Return cached data
            return [Mirror(**item) for item in cache_entry.data]
        
        # No cache, query host
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            mirrors = ovsdb.get_mirrors()
            
            # Cache the results (even if empty list)
            # Delete old cache
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type == 'mirrors'
            ).delete()
            
            # Create new cache entry
            cache_entry = HostCache(
                host_id=host_id,
                cache_type='mirrors',
                data=[m.dict() for m in mirrors] if mirrors else []
            )
            db.add(cache_entry)
            db.commit()
            
            return mirrors if mirrors else []
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        logger.error(f"Error getting mirrors: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to get mirrors: {str(e)}")


@router.post("", response_model=dict)
async def create_mirror(host_id: str, request: CreateMirrorRequest, db: Session = Depends(get_db)):
    """Create a new OVS mirror"""
    try:
        # Validate mode
        if request.mode not in ['manual', 'dynamic']:
            raise HTTPException(status_code=400, detail="Mode must be 'manual' or 'dynamic'")
        
        # Validate manual mode has source ports
        if request.mode == 'manual' and (not request.source_ports or len(request.source_ports) == 0):
            raise HTTPException(status_code=400, detail="Manual mode requires at least one source port")
        
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.create_mirror(
                bridge_name=request.bridge_name,
                mirror_name=request.mirror_name,
                mode=request.mode,
                source_ports=request.source_ports if request.mode == 'manual' else None,
                output_port=request.output_port
            )
            if success:
                # Invalidate mirrors and bridges cache so UI refreshes with correct data
                db.query(HostCache).filter(
                    HostCache.host_id == host_id,
                    HostCache.cache_type.in_(['mirrors', 'bridges'])
                ).delete()
                db.commit()
                return {"status": "success", "message": "Mirror created successfully"}
            else:
                raise HTTPException(status_code=500, detail="Failed to create mirror")
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create mirror: {str(e)}")


class ClearBridgeRequest(BaseModel):
    bridge_name: str


@router.post("/clear-bridge", response_model=dict)
async def clear_bridge_mirrors(host_id: str, request: ClearBridgeRequest = Body(...), db: Session = Depends(get_db)):
    """Clear all mirrors from a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.clear_bridge_mirrors(request.bridge_name)
            if success:
                # Invalidate mirrors and bridges cache
                db.query(HostCache).filter(
                    HostCache.host_id == host_id,
                    HostCache.cache_type.in_(['mirrors', 'bridges'])
                ).delete()
                db.commit()
                return {"status": "success", "message": f"All mirrors cleared from bridge {request.bridge_name}"}
            else:
                raise HTTPException(status_code=500, detail="Failed to clear bridge mirrors")
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error clearing bridge mirrors: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to clear bridge mirrors: {str(e)}")


@router.get("/{mirror_name}/statistics", response_model=dict)
async def get_mirror_statistics(host_id: str, mirror_name: str, db: Session = Depends(get_db)):
    """Get statistics for a mirror"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            stats = ovsdb.get_mirror_statistics(mirror_name)
            return {"status": "success", "statistics": stats}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting mirror statistics: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to get mirror statistics: {str(e)}")


@router.delete("/{mirror_uuid}", response_model=dict)
async def delete_mirror(host_id: str, mirror_uuid: str, bridge_name: str, db: Session = Depends(get_db)):
    """Delete an OVS mirror and invalidate cache"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            ovsdb = OVSDBService(ssh)
            success = ovsdb.delete_mirror(bridge_name, mirror_uuid)
            if not success:
                # Check if mirror still exists
                mirrors = ovsdb.get_mirrors()
                mirror_exists = any(m.uuid == mirror_uuid for m in mirrors)
                if mirror_exists:
                    raise HTTPException(status_code=500, detail="Failed to delete mirror from host")
                # Mirror doesn't exist, might have been deleted already - still invalidate cache
                logger.warning(f"Mirror {mirror_uuid} not found on host, but invalidating cache anyway")

            # Always invalidate mirrors and bridges cache so UI refreshes
            db.query(HostCache).filter(
                HostCache.host_id == host_id,
                HostCache.cache_type.in_(['mirrors', 'bridges'])
            ).delete()
            db.commit()

            return {"status": "success", "message": "Mirror deleted successfully"}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting mirror: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to delete mirror: {str(e)}")


@router.get("/{mirror_uuid}/test", response_model=dict)
async def test_mirror(host_id: str, mirror_uuid: str, bridge_name: str, db: Session = Depends(get_db)):
    """Test a mirror to verify it's properly configured"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            # Get detailed mirror information
            ovsdb = OVSDBService(ssh)

            # Get all mirrors and find the one we're testing
            mirrors = ovsdb.get_mirrors()
            mirror = next((m for m in mirrors if m.uuid == mirror_uuid), None)

            if not mirror:
                raise HTTPException(status_code=404, detail="Mirror not found")

            # Build detailed output
            output_lines = []
            output_lines.append("=" * 60)
            output_lines.append(f"MIRROR TEST: {mirror.name or 'Unnamed'}")
            output_lines.append("=" * 60)
            output_lines.append("")

            # Basic info
            output_lines.append("CONFIGURATION:")
            output_lines.append(f"  UUID: {mirror.uuid}")
            output_lines.append(f"  Name: {mirror.name or 'N/A'}")
            output_lines.append(f"  Bridge: {mirror.bridge}")
            output_lines.append(f"  Output Port: {mirror.output_port or 'N/A'}")
            output_lines.append("")

            # Source ports
            if mirror.select_src_port:
                output_lines.append(f"  Source Ports ({len(mirror.select_src_port)}):")
                for port in mirror.select_src_port:
                    output_lines.append(f"    - {port}")
            else:
                output_lines.append("  Source Ports: ALL (dynamic)")
            output_lines.append("")

            # Destination ports
            if mirror.select_dst_port:
                output_lines.append(f"  Destination Ports ({len(mirror.select_dst_port)}):")
                for port in mirror.select_dst_port:
                    output_lines.append(f"    - {port}")
            output_lines.append("")

            # Check if output port exists
            output_lines.append("VERIFICATION:")

            if mirror.output_port:
                # Check if output port exists on the bridge
                port_check_cmd = f"ovs-vsctl list-ports {bridge_name}"
                stdout, stderr, exit_code = ssh.execute(port_check_cmd)

                if exit_code == 0:
                    ports = stdout.strip().split('\n')
                    if mirror.output_port in ports:
                        output_lines.append(f"  ✓ Output port '{mirror.output_port}' exists on bridge")
                    else:
                        output_lines.append(f"  ✗ Output port '{mirror.output_port}' NOT found on bridge!")
                        output_lines.append(f"    Available ports: {', '.join(ports)}")
                else:
                    output_lines.append(f"  ✗ Failed to verify output port: {stderr}")
            else:
                output_lines.append("  ✗ No output port configured!")

            output_lines.append("")

            # Get mirror from OVSDB to check configuration
            output_lines.append("OVS DATABASE RECORD:")
            list_cmd = f"ovs-vsctl list mirror {mirror.uuid}"
            stdout, stderr, exit_code = ssh.execute(list_cmd)

            if exit_code == 0:
                output_lines.append(stdout)
            else:
                output_lines.append(f"  Failed to retrieve: {stderr}")

            output_lines.append("")
            output_lines.append("=" * 60)
            output_lines.append("TEST COMPLETE")
            output_lines.append("=" * 60)

            return {
                "status": "success",
                "output": "\n".join(output_lines)
            }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error testing mirror: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to test mirror: {str(e)}")

