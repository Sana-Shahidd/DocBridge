import os
from dotenv import load_dotenv
from sqlalchemy import (
    Column, String, Float, JSON, DateTime, Text, LargeBinary, create_engine, func,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./synthshield.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(String, primary_key=True, index=True)
    file_hash = Column(String, nullable=False, index=True)
    file_type = Column(String, nullable=False)
    reality_score = Column(Float, nullable=False, default=0.0)
    signal_breakdown = Column(JSON, nullable=True)
    geolocation_result = Column(JSON, nullable=True)
    watermark_data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CybercrimeReport(Base):
    __tablename__ = "cybercrime_reports"

    id = Column(String, primary_key=True, index=True)
    analysis_id = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    platform = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DeviceFingerprint(Base):
    __tablename__ = "device_fingerprints"

    id = Column(String, primary_key=True, index=True)
    device_name = Column(String, nullable=False)
    owner_org = Column(String, nullable=True)
    prnu_fingerprint = Column(LargeBinary, nullable=True)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())


class WatermarkRegistry(Base):
    __tablename__ = "watermark_registry"

    id = Column(String, primary_key=True, index=True)
    file_hash = Column(String, nullable=False, index=True)
    watermark_payload = Column(String, nullable=False)
    user_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
