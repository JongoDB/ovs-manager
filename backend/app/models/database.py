from sqlalchemy import create_engine, Column, String, Integer, Text, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cache/ovs_manager.db")

# Ensure cache directory exists
db_path = DATABASE_URL.replace("sqlite:///", "")
cache_dir = os.path.dirname(db_path) if os.path.dirname(db_path) else "./cache"
os.makedirs(cache_dir, exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class HostCache(Base):
    __tablename__ = "host_cache"
    
    id = Column(Integer, primary_key=True, index=True)
    host_id = Column(String, index=True)
    cache_type = Column(String)  # 'bridges', 'mirrors', 'vms', 'ports'
    data = Column(JSON)
    last_updated = Column(DateTime, default=datetime.utcnow)


class HostConfigDB(Base):
    __tablename__ = "host_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    hostname = Column(String, nullable=False)
    port = Column(Integer, default=22)
    username = Column(String, nullable=False)
    ssh_key_path = Column(String, nullable=True)
    password = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)

