import os
import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import init_db
from routers import analyze, reports, certificate, intelligence, geolens, watermark

logger = logging.getLogger("synthshield")


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs("uploads", exist_ok=True)
    init_db()
    yield


app = FastAPI(
    title="SynthShield API",
    description="Quantum Deepfake and Misinformation Shield",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s\n%s", exc, traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"error": "Validation error", "detail": str(exc)})


app.include_router(analyze.router,       prefix="/api/analyze",       tags=["analyze"])
app.include_router(reports.router,       prefix="/api/reports",       tags=["reports"])
app.include_router(certificate.router,   prefix="/api/certificate",   tags=["certificate"])
app.include_router(intelligence.router,  prefix="/api/intelligence",  tags=["intelligence"])
app.include_router(geolens.router,       prefix="/api/geolens",       tags=["geolens"])
app.include_router(watermark.router,     prefix="/api/watermark",     tags=["watermark"])


@app.get("/health")
def health_check():
    return {"status": "ok", "app": "SynthShield"}
