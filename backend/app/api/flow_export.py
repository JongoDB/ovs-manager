from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from sqlalchemy.orm import Session
from app.models.schemas import FlowExportConfig, ConfigureFlowExportRequest
from app.models.database import get_db
from app.services.host_config import get_host_config
from app.services.ssh_service import SSHService
from app.services.flow_export_service import FlowExportService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hosts/{host_id}/bridges/{bridge_name}", tags=["flow-export"])


# ======================
# NetFlow Endpoints
# ======================

@router.post("/netflow", status_code=201)
async def configure_netflow(host_id: str, bridge_name: str, request: ConfigureFlowExportRequest, db: Session = Depends(get_db)):
    """Configure NetFlow export for a bridge"""
    try:
        if not request.targets or len(request.targets) == 0:
            raise HTTPException(status_code=400, detail="At least one target is required")

        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            flow_service = FlowExportService(ssh)
            success = flow_service.configure_netflow(
                bridge=bridge_name,
                targets=request.targets,
                active_timeout=request.active_timeout,
                engine_id=request.engine_id,
                engine_type=request.engine_type
            )

            if not success:
                raise HTTPException(status_code=500, detail="Failed to configure NetFlow")

            return {"message": f"NetFlow configured successfully on bridge {bridge_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error configuring NetFlow: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to configure NetFlow: {str(e)}")


@router.get("/netflow", response_model=Optional[FlowExportConfig])
async def get_netflow_config(host_id: str, bridge_name: str, db: Session = Depends(get_db)):
    """Get NetFlow configuration for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            flow_service = FlowExportService(ssh)
            netflow_config = flow_service.get_netflow_config(bridge_name)
            return netflow_config
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting NetFlow config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get NetFlow config: {str(e)}")


@router.delete("/netflow", status_code=200)
async def disable_netflow(host_id: str, bridge_name: str, db: Session = Depends(get_db)):
    """Disable NetFlow export for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            flow_service = FlowExportService(ssh)
            success = flow_service.disable_netflow(bridge_name)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to disable NetFlow")

            return {"message": f"NetFlow disabled successfully on bridge {bridge_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disabling NetFlow: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to disable NetFlow: {str(e)}")


# ======================
# sFlow Endpoints
# ======================

@router.post("/sflow", status_code=201)
async def configure_sflow(host_id: str, bridge_name: str, request: ConfigureFlowExportRequest, db: Session = Depends(get_db)):
    """Configure sFlow export for a bridge"""
    try:
        if not request.targets or len(request.targets) == 0:
            raise HTTPException(status_code=400, detail="At least one target is required")

        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            flow_service = FlowExportService(ssh)
            success = flow_service.configure_sflow(
                bridge=bridge_name,
                targets=request.targets,
                header=request.header,
                sampling=request.sampling,
                polling=request.polling
            )

            if not success:
                raise HTTPException(status_code=500, detail="Failed to configure sFlow")

            return {"message": f"sFlow configured successfully on bridge {bridge_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error configuring sFlow: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to configure sFlow: {str(e)}")


@router.get("/sflow", response_model=Optional[FlowExportConfig])
async def get_sflow_config(host_id: str, bridge_name: str, db: Session = Depends(get_db)):
    """Get sFlow configuration for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            flow_service = FlowExportService(ssh)
            sflow_config = flow_service.get_sflow_config(bridge_name)
            return sflow_config
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting sFlow config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get sFlow config: {str(e)}")


@router.delete("/sflow", status_code=200)
async def disable_sflow(host_id: str, bridge_name: str, db: Session = Depends(get_db)):
    """Disable sFlow export for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            flow_service = FlowExportService(ssh)
            success = flow_service.disable_sflow(bridge_name)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to disable sFlow")

            return {"message": f"sFlow disabled successfully on bridge {bridge_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disabling sFlow: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to disable sFlow: {str(e)}")


# ======================
# IPFIX Endpoints
# ======================

@router.post("/ipfix", status_code=201)
async def configure_ipfix(host_id: str, bridge_name: str, request: ConfigureFlowExportRequest, db: Session = Depends(get_db)):
    """Configure IPFIX export for a bridge"""
    try:
        if not request.targets or len(request.targets) == 0:
            raise HTTPException(status_code=400, detail="At least one target is required")

        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            flow_service = FlowExportService(ssh)
            success = flow_service.configure_ipfix(
                bridge=bridge_name,
                targets=request.targets,
                obs_domain_id=request.obs_domain_id,
                obs_point_id=request.obs_point_id,
                cache_active_timeout=request.cache_active_timeout,
                cache_max_flows=request.cache_max_flows
            )

            if not success:
                raise HTTPException(status_code=500, detail="Failed to configure IPFIX")

            return {"message": f"IPFIX configured successfully on bridge {bridge_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error configuring IPFIX: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to configure IPFIX: {str(e)}")


@router.get("/ipfix", response_model=Optional[FlowExportConfig])
async def get_ipfix_config(host_id: str, bridge_name: str, db: Session = Depends(get_db)):
    """Get IPFIX configuration for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            flow_service = FlowExportService(ssh)
            ipfix_config = flow_service.get_ipfix_config(bridge_name)
            return ipfix_config
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting IPFIX config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get IPFIX config: {str(e)}")


@router.delete("/ipfix", status_code=200)
async def disable_ipfix(host_id: str, bridge_name: str, db: Session = Depends(get_db)):
    """Disable IPFIX export for a bridge"""
    try:
        config = get_host_config(host_id, db)
        with SSHService(config) as ssh:
            flow_service = FlowExportService(ssh)
            success = flow_service.disable_ipfix(bridge_name)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to disable IPFIX")

            return {"message": f"IPFIX disabled successfully on bridge {bridge_name}"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disabling IPFIX: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to disable IPFIX: {str(e)}")
