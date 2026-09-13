from __future__ import annotations

import logging
import os
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.api.routes import router

app = FastAPI(title="FixFlow API", version="0.1.0")
logger = logging.getLogger(__name__)


def configured_origins(value: str) -> list[str]:
    origins: list[str] = []
    for candidate in value.split(","):
        origin = candidate.strip().rstrip("/")
        if not origin:
            continue
        parsed = urlsplit(origin)
        if (
            origin == "*"
            or parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
            or parsed.username
            or parsed.password
        ):
            raise ValueError(f"Invalid FRONTEND_ORIGINS entry: {origin!r}")
        if origin not in origins:
            origins.append(origin)
    if not origins:
        raise ValueError("FRONTEND_ORIGINS must contain at least one HTTP(S) origin")
    return origins


origins = configured_origins(os.getenv("FRONTEND_ORIGINS", "http://localhost:3000"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "error": {"code": code, "message": message}},
    )


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, error: StarletteHTTPException) -> JSONResponse:
    return error_response("HTTP_ERROR", str(error.detail), error.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
    return error_response("VALIDATION_ERROR", "Request validation failed", 422)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, error: Exception) -> JSONResponse:
    error_info = (type(error), error, error.__traceback__)
    logger.error(
        "Unhandled error while processing %s %s",
        request.method,
        request.url.path,
        exc_info=error_info,
    )
    return error_response("INTERNAL_ERROR", "Internal server error", 500)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "fixflow-api"}


app.include_router(router, prefix="/api")
