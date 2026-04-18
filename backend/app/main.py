import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routes.chat import router as chat_router
from app.routes.process import router as process_router
from app.routes.settings import router as settings_router

app = FastAPI(title="VideoMind API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(process_router)
app.include_router(chat_router)
app.include_router(settings_router)

logger = logging.getLogger(__name__)


def _status_to_code(status_code: int) -> str:
    if status_code == 400:
        return "BAD_REQUEST"
    if status_code == 401:
        return "UNAUTHORIZED"
    if status_code == 403:
        return "FORBIDDEN"
    if status_code == 404:
        return "NOT_FOUND"
    if status_code == 409:
        return "CONFLICT"
    if status_code == 422:
        return "UNPROCESSABLE_ENTITY"
    if status_code == 429:
        return "TOO_MANY_REQUESTS"
    if status_code >= 500:
        return "SERVER_ERROR"
    return "ERROR"


def _normalize_error(status_code: int, detail: object) -> dict:
    if isinstance(detail, dict):
        code = str(detail.get("code") or _status_to_code(status_code))
        message = str(detail.get("message") or "Request failed")
        payload = {
            "code": code,
            "message": message,
            "status": status_code,
        }
        if "details" in detail and detail.get("details") is not None:
            payload["details"] = detail.get("details")
        return payload

    message = str(detail) if detail else "Request failed"
    return {
        "code": _status_to_code(status_code),
        "message": message,
        "status": status_code,
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": _normalize_error(exc.status_code, exc.detail)},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled server exception", exc_info=exc)
    status_code = 500
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": "SERVER_ERROR",
                "message": "Unexpected server error occurred.",
                "status": status_code,
            }
        },
    )
