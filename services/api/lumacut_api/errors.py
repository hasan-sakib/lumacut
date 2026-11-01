"""One error shape for every API failure: {"error": {"code", "message", "fields"?}}."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str
    fields: dict[str, str] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class ApiError(Exception):
    """Raise from route code; rendered as an ErrorResponse with an actionable message."""

    def __init__(self, status: int, code: str, message: str, headers: dict[str, str] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers


def error_responses(*statuses: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI `responses=` entry documenting the error shape for these statuses."""
    return {status: {"model": ErrorResponse} for status in statuses}


def use_error_shape_in_openapi(app: FastAPI) -> None:
    """Document 422s with ErrorResponse (what the handler below returns), not FastAPI's default
    HTTPValidationError, so generated clients get the real shape."""
    default_openapi = app.openapi

    def openapi() -> dict[str, Any]:
        if app.openapi_schema is not None:
            return app.openapi_schema
        schema = default_openapi()
        ref = {"$ref": "#/components/schemas/ErrorResponse"}
        for path in schema.get("paths", {}).values():
            for operation in path.values():
                response = operation.get("responses", {}).get("422")
                if response is not None:
                    response["content"] = {"application/json": {"schema": ref}}
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        for name in ("HTTPValidationError", "ValidationError"):
            components.pop(name, None)
        components.setdefault(
            "ErrorResponse",
            ErrorResponse.model_json_schema(ref_template="#/components/schemas/{model}"),
        )
        defs = components["ErrorResponse"].pop("$defs", {})
        for name, definition in defs.items():
            components.setdefault(name, definition)
        app.openapi_schema = schema
        return schema

    app.openapi = openapi  # type: ignore[method-assign]


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        body = ErrorResponse(error=ErrorBody(code=exc.code, message=exc.message))
        return JSONResponse(
            body.model_dump(exclude_none=True), status_code=exc.status, headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
            fields[".".join(loc) or "request"] = str(err.get("msg", "invalid value"))
        body = ErrorResponse(
            error=ErrorBody(
                code="invalid_request", message="Some fields are invalid.", fields=fields
            )
        )
        return JSONResponse(body.model_dump(exclude_none=True), status_code=422)
