"""Maps algorithm keys to policy classes."""
from app.algorithms.adaptive import MLFQ, AdaptiveQuantum
from app.algorithms.base import Policy
from app.algorithms.classic import FCFS, SJF, SRTF, PriorityScheduling, RoundRobin

POLICIES: dict[str, type[Policy]] = {
    "fcfs": FCFS,
    "sjf": SJF,
    "srtf": SRTF,
    "rr": RoundRobin,
    "priority": PriorityScheduling,
    "mlfq": MLFQ,
    "aqs": AdaptiveQuantum,
}


def make_policy(algorithm: str, params: dict) -> Policy:
    return POLICIES[algorithm](params)
