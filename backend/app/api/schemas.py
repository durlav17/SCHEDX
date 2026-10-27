"""Request schemas. Pydantic checks structure and types; the engine performs the
semantic validation and produces user-facing messages."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ProcessIn(BaseModel):
    pid: str
    arrival: int
    bursts: list[int]
    priority: int = 0


class SchedulerConfigIn(BaseModel):
    algorithm: str
    params: dict[str, Any] = Field(default_factory=dict)
    context_switch_cost: int = 0
    starvation_threshold: int = 50
    label: Optional[str] = None


class SimulationRequest(SchedulerConfigIn):
    workload: list[ProcessIn]
    # full: legacy verbose result. compact: lossless "schedx-compact-1" encoding (what the web UI uses).
    # summary: segments and metrics only, without the per-event trace.
    detail: Literal["full", "compact", "summary"] = "full"


class CompareRequest(BaseModel):
    workload: list[ProcessIn]
    configs: list[SchedulerConfigIn]
    include_frames: bool = False


class GenerateRequest(BaseModel):
    generator: dict[str, Any] = Field(default_factory=dict)


class SweepRequest(BaseModel):
    config: SchedulerConfigIn
    parameter: str
    values: list[float]
    workload: Optional[list[ProcessIn]] = None
    generator: Optional[dict[str, Any]] = None
    trials: int = 1


class ExperimentCreate(BaseModel):
    """Saving an experiment re-runs it on the server: stored results always come
    from the engine, never from the client."""

    name: str = Field(min_length=1, max_length=120)
    kind: Literal["simulation", "comparison", "whatif", "sweep"]
    workload: Optional[list[ProcessIn]] = None
    generator: Optional[dict[str, Any]] = None
    configs: list[SchedulerConfigIn] = Field(default_factory=list)
    sweep: Optional[SweepRequest] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class ExperimentRename(BaseModel):
    name: str = Field(min_length=1, max_length=120)
