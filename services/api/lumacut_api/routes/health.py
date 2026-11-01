from fastapi import APIRouter, Request, Response, status

from lumacut_api.health import HealthReport, run_checks

router = APIRouter()


@router.get("/api/health", response_model=HealthReport)
async def health(request: Request, response: Response) -> HealthReport:
    """Readiness of every backing service. 200 when all are ok, 503 otherwise."""
    report = await run_checks(request.app.state.health_checks, request.app.state.check_timeout_s)
    if report.status != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return report
