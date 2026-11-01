"""RQ round trip through the running worker container (`make test-stack`)."""

import time

import pytest
from redis import Redis
from rq import Queue
from rq.job import JobStatus

from lumacut_worker.settings import Settings

pytestmark = pytest.mark.integration


def test_worker_executes_diagnostics_job_with_ffmpeg() -> None:
    queue = Queue("default", connection=Redis.from_url(Settings().redis_url))
    job = queue.enqueue("lumacut_worker.jobs.diagnostics.media_tools_version", job_timeout=30)
    deadline = time.monotonic() + 30
    while job.get_status(refresh=True) not in {JobStatus.FINISHED, JobStatus.FAILED}:
        assert time.monotonic() < deadline, "worker did not finish the job within 30 s"
        time.sleep(0.2)
    assert job.get_status() == JobStatus.FINISHED, job.latest_result()
    result = job.return_value()
    assert isinstance(result, dict)
    assert result["ffmpeg"].startswith("ffmpeg version ")
    assert result["ffprobe"].startswith("ffprobe version ")
