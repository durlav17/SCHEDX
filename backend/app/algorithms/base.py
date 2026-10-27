"""Scheduling-policy interface used by the simulator.

A policy never mutates simulator state directly except for policy-owned
fields on a PCB (``level`` for MLFQ, ``eff_priority`` for Priority). The
simulator owns time, queues and transitions; the policy only decides.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:  # pragma: no cover
    from app.engine.simulator import PCB, Simulator


@dataclass
class Selection:
    pcb: "PCB"
    rule: str  # short machine-readable rule id, e.g. "fifo_head"
    explanation: str  # truthful, human-readable sentence built from recorded data
    candidates: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Preemption:
    candidate: "PCB"
    reason: str


class Policy:
    key = "base"
    name = "Base"
    preemptive = False

    def __init__(self, params: dict[str, Any]):
        self.params = params

    # --- hooks -----------------------------------------------------------
    def on_enter_ready(self, sim: "Simulator", pcb: "PCB", cause: str) -> None:
        """Called whenever a process joins the ready queue."""

    def select(self, sim: "Simulator") -> Selection:
        raise NotImplementedError

    def quantum(self, sim: "Simulator", pcb: "PCB") -> tuple[Optional[int], Optional[dict[str, Any]]]:
        """Time slice for a dispatch (None = run until the burst ends)."""
        return None, None

    def preempt_check(self, sim: "Simulator", running: "PCB") -> Optional[Preemption]:
        return None

    def on_slice_end(self, sim: "Simulator", pcb: "PCB", reason: str, ran: int, overhead: int) -> None:
        """reason is one of: quantum, block, terminate, preempt."""

    def on_time(self, sim: "Simulator") -> list[dict[str, Any]]:
        """Time-driven policy events (e.g. MLFQ priority boost)."""
        return []


def fmt_pids(pcbs: list["PCB"]) -> str:
    return ", ".join(p.pid for p in pcbs) if pcbs else "none"
