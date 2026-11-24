"""Error bodies in the shapes the frontend already reads from the Django backend:
{"detail": ...} for auth and not-found, {"error": ...} for rule violations, and
{"error": "Validation failed", "details": {field: [message]}} for bad input."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, body: dict):
        self.status = status
        self.body = body


def not_found(what: str = "Not found.") -> ApiError:
    return ApiError(404, {"detail": what})


def bad_request(message: str) -> ApiError:
    return ApiError(400, {"error": message})


def invalid(details: dict[str, list[str]]) -> ApiError:
    return ApiError(400, {"error": "Validation failed", "details": details})


def field_errors(exc: RequestValidationError) -> dict[str, list[str]]:
    """Pydantic's error list -> {field: [message]}, like DRF's serializer.errors."""
    details: dict[str, list[str]] = {}
    for err in exc.errors():
        loc = [str(p) for p in err["loc"] if p not in ("body", "query", "path")]
        field = ".".join(loc) or "non_field_errors"
        msg = err["msg"].removeprefix("Value error, ")
        if err["type"] == "missing":
            msg = "This field is required."
        details.setdefault(field, []).append(msg)
    return details


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(exc.body, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        return JSONResponse({"error": "Validation failed", "details": field_errors(exc)}, status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        # FastAPI's own 404/405s: same {"detail": ...} shape DRF used
        detail = "Not found." if exc.status_code == 404 else exc.detail
        return JSONResponse({"detail": detail}, status_code=exc.status_code)
