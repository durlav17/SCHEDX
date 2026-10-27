"""SchedX FastAPI application.

Run (from backend/):  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import router
from app.engine.models import ValidationError
from app.persistence.db import ExperimentStore

log = logging.getLogger("schedx")
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def _error(status: int, kind: str, messages: list[str]) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"type": kind, "messages": messages}})


def create_app(db_path: Optional[str] = None) -> FastAPI:
    app = FastAPI(title="SchedX API", version="1.0.0", docs_url="/api/docs", redoc_url="/api/redoc", openapi_url="/api/openapi.json",
                  description="Explainable CPU scheduling simulation and experimentation API.")
    app.state.store = ExperimentStore(db_path)
    app.add_middleware(GZipMiddleware, minimum_size=1024)  # large JSON results compress ~10x
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ValidationError)
    async def _engine_validation(_: Request, exc: ValidationError):
        return _error(422, "validation_error", exc.errors)

    @app.exception_handler(RequestValidationError)
    async def _request_validation(_: Request, exc: RequestValidationError):
        msgs = []
        for e in exc.errors():
            loc = ".".join(str(x) for x in e["loc"] if x != "body")
            msgs.append(f"{loc}: {e['msg']}" if loc else e["msg"])
        return _error(422, "validation_error", msgs)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        return _error(exc.status_code, "http_error", [str(exc.detail)])

    @app.exception_handler(Exception)
    async def _internal(_: Request, exc: Exception):
        log.exception("Unhandled error")
        return _error(500, "internal_error", ["An unexpected server error occurred. See the server log for details."])

    app.include_router(router)

    # Serve the production frontend build, if present, from the same origin.
    if FRONTEND_DIST.is_dir():
        if (FRONTEND_DIST / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            if path.startswith("api/"):
                return _error(404, "http_error", ["Not Found"])
            f = FRONTEND_DIST / path
            if path and f.is_file() and FRONTEND_DIST in f.resolve().parents:
                return FileResponse(f)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


app = create_app()
