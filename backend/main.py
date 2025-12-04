from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import (
    hosts, bridges, mirrors, vms, containers, refresh, port_mappings,
    ports, bonds, statistics, flow_export, diagnostics, vm_network, cache
)
from app.models.database import init_db
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="OVS Manager API",
    description="API for managing Open vSwitch configurations across multiple Proxmox hosts",
    version="0.1.0"
)

# CORS middleware - allow all origins in development
# In production, set ALLOWED_ORIGINS environment variable with comma-separated list
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if allowed_origins_env:
    # Parse comma-separated origins
    allow_origins_list = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
    allow_credentials = True
else:
    # Default: allow all origins (development mode)
    allow_origins_list = ["*"]
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins_list,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
init_db()

# Include routers
app.include_router(hosts.router)
app.include_router(bridges.router)
app.include_router(ports.router)
app.include_router(bonds.router)
app.include_router(mirrors.router)
app.include_router(statistics.router)
app.include_router(flow_export.router)
app.include_router(diagnostics.router)
app.include_router(vms.router)
app.include_router(containers.router)
app.include_router(refresh.router)
app.include_router(port_mappings.router)
app.include_router(vm_network.router)
app.include_router(cache.router)


@app.get("/")
async def root():
    return {
        "message": "OVS Manager API",
        "version": "0.1.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}

