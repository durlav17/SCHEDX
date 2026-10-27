from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from app.algorithms.registry import POLICIES
from app.api.schemas import (
    CompareRequest,
    ExperimentCreate,
    ExperimentRename,
    GenerateRequest,
    SchedulerConfigIn,
    SimulationRequest,
    SweepRequest,
)
from app.engine.compact import compact_result, summary_result
from app.engine.models import (
    ALGORITHM_PARAM_DEFAULTS,
    MAX_CONTEXT_SWITCH,
    MAX_HORIZON,
    MAX_PROCESSES,
    SimConfig,
    ValidationError,
)
from app.engine.simulator import simulate
from app.experiments import analysis
from app.experiments.generator import GENERATOR_DEFAULTS, generate_workload
from app.experiments.presets import list_presets

router = APIRouter(prefix="/api")

DESCRIPTIONS = {
    "fcfs": "Non-preemptive. Dispatches the process that entered the ready queue earliest.",
    "sjf": "Non-preemptive. Dispatches the ready process with the shortest current CPU burst (exact burst length is the estimate).",
    "srtf": "Preemptive SJF. A newly ready process preempts only if its remaining burst is strictly shorter.",
    "rr": "Preemptive time slicing. Ready-queue order; a process that uses its full quantum rejoins the tail.",
    "priority": "Smaller number = higher priority. Optional preemption and ageing to mitigate starvation.",
    "mlfq": "Three to five levels with growing time slices, demotion on full-slice use and periodic priority boost.",
    "aqs": "Experimental Round Robin variant whose quantum adapts within bounds to queue length and switch overhead.",
}


PREEMPTION = {"fcfs": "no", "sjf": "no", "srtf": "yes", "rr": "yes", "priority": "configurable",
              "mlfq": "yes", "aqs": "yes"}


def to_config(c: SchedulerConfigIn, record_frames: bool = True) -> SimConfig:
    return SimConfig(c.algorithm, dict(c.params), c.context_switch_cost, c.starvation_threshold, record_frames)


def dump_workload(w) -> list[dict[str, Any]]:
    return [p.model_dump() for p in w] if w is not None else None


@router.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "schedx", "engine": "discrete-time", "version": "1.0.0"}


@router.get("/algorithms")
def algorithms() -> dict[str, Any]:
    return {
        "algorithms": [
            {
                "key": k,
                "name": cls.name,
                "preemptive": PREEMPTION[k],
                "description": DESCRIPTIONS[k],
                "defaults": ALGORITHM_PARAM_DEFAULTS[k],
                "experimental": k == "aqs",
            }
            for k, cls in POLICIES.items()
        ],
        "limits": {
            "max_processes": MAX_PROCESSES,
            "max_horizon": MAX_HORIZON,
            "max_context_switch_cost": MAX_CONTEXT_SWITCH,
            "max_compare": analysis.MAX_COMPARE,
            "max_sweep_points": analysis.MAX_SWEEP_POINTS,
            "max_trials": analysis.MAX_TRIALS,
        },
        "priority_convention": "Smaller numeric value = higher priority (0 is highest).",
    }


@router.get("/presets")
def presets() -> dict[str, Any]:
    return {"presets": list_presets(), "generator_defaults": GENERATOR_DEFAULTS}


@router.post("/simulations/run")
def run_simulation(req: SimulationRequest) -> dict[str, Any]:
    result = simulate(dump_workload(req.workload), to_config(req))
    if req.detail == "compact":
        return compact_result(result)
    if req.detail == "summary":
        return summary_result(result)
    return result


@router.post("/experiments/compare")
def compare(req: CompareRequest) -> dict[str, Any]:
    result = analysis.compare(dump_workload(req.workload), [to_config(c) for c in req.configs], req.include_frames)
    for run, c in zip(result["runs"], req.configs):
        run["label"] = c.label
    return result


@router.post("/workloads/generate")
def generate(req: GenerateRequest) -> dict[str, Any]:
    from app.experiments.generator import validate_generator

    cfg = validate_generator(req.generator)
    return {"generator": cfg, "processes": generate_workload(cfg)}


@router.post("/experiments/sweep")
def sweep(req: SweepRequest) -> dict[str, Any]:
    return analysis.sweep(to_config(req.config, False), req.parameter, req.values,
                          dump_workload(req.workload), req.generator, req.trials)


def _store(request: Request):
    return request.app.state.store


@router.get("/experiments")
def list_experiments(request: Request, limit: Optional[int] = Query(None, ge=1, le=1000),
                     offset: int = Query(0, ge=0)) -> dict[str, Any]:
    """Saved experiments, newest first, as light summaries (no stored results). `limit`/`offset` page the list."""
    store = _store(request)
    return {"experiments": store.list(limit, offset), "total": store.count()}


def _execute(body: ExperimentCreate) -> tuple[list, dict, dict, Any]:
    """Run the experiment server-side and return (workload, config, results, seed)."""
    gen = body.generator
    if body.kind == "sweep":
        if body.sweep is None:
            raise ValidationError(["A sweep experiment requires sweep settings."])
        s = body.sweep
        res = analysis.sweep(to_config(s.config, False), s.parameter, s.values, dump_workload(s.workload),
                             s.generator, s.trials)
        wl = dump_workload(s.workload) or generate_workload(s.generator)
        summary = {"parameter": s.parameter, "points": len(s.values), "trials": s.trials}
        return wl, s.model_dump(), {"summary": summary, "sweep": res}, (s.generator or {}).get("seed")
    workload = dump_workload(body.workload)
    if workload is None:
        if gen is None:
            raise ValidationError(["Provide a workload or a generator configuration."])
        workload = generate_workload(gen)
    if not body.configs:
        raise ValidationError(["Provide at least one scheduler configuration."])
    cfg_dump = {"configs": [c.model_dump() for c in body.configs]}
    if body.kind == "simulation":
        r = simulate(workload, to_config(body.configs[0], False))
        summary = {"runs": [{"algorithm": r["algorithm"], "label": body.configs[0].label,
                             **analysis.flat_metrics(r["metrics"]["system"])}]}
        results = {"summary": summary, "metrics": r["metrics"], "segments": r["segments"],
                   "params": r["params"], "aqs_adjustments": r["aqs_adjustments"]}
    else:
        cmp_ = analysis.compare(workload, [to_config(c, False) for c in body.configs])
        summary = {"runs": [{"algorithm": run["algorithm"], "label": c.label, **run["summary"]}
                            for run, c in zip(cmp_["runs"], body.configs)]}
        results = {"summary": summary, "runs": [
            {k: run[k] for k in ("algorithm", "params", "context_switch_cost", "metrics", "summary",
                                 "delta_vs_baseline", "segments")} for run in cmp_["runs"]]}
    return workload, cfg_dump, results, (gen or {}).get("seed")


@router.post("/experiments", status_code=201)
def create_experiment(body: ExperimentCreate, request: Request) -> dict[str, Any]:
    workload, cfg, results, seed = _execute(body)
    return _store(request).create(body.name.strip(), body.kind, workload, cfg, results,
                                  seed=seed, generator=body.generator, notes=body.notes)


def _get_or_404(request: Request, exp_id: int) -> dict:
    e = _store(request).get(exp_id)
    if e is None:
        raise HTTPException(status_code=404, detail=f"Experiment {exp_id} was not found.")
    return e


@router.get("/experiments/{exp_id}")
def get_experiment(exp_id: int, request: Request) -> dict[str, Any]:
    return _get_or_404(request, exp_id)


@router.patch("/experiments/{exp_id}")
def rename_experiment(exp_id: int, body: ExperimentRename, request: Request) -> dict[str, Any]:
    _get_or_404(request, exp_id)
    return _store(request).rename(exp_id, body.name.strip())


@router.delete("/experiments/{exp_id}")
def delete_experiment(exp_id: int, request: Request) -> dict[str, Any]:
    _get_or_404(request, exp_id)
    _store(request).delete(exp_id)
    return {"deleted": exp_id}


@router.post("/experiments/{exp_id}/reproduce")
def reproduce_experiment(exp_id: int, request: Request) -> dict[str, Any]:
    """Re-run a saved experiment from its stored inputs and check the results match."""
    e = _get_or_404(request, exp_id)
    if e["kind"] == "sweep":
        body = ExperimentCreate(name=e["name"], kind="sweep", sweep=SweepRequest(**e["config"]))
    else:
        body = ExperimentCreate(name=e["name"], kind=e["kind"], workload=e["workload"],
                                configs=e["config"]["configs"])
    _, _, results, _ = _execute(body)
    identical = json.loads(json.dumps(results)) == e["results"]
    return {"id": exp_id, "identical": identical, "summary": results["summary"]}
