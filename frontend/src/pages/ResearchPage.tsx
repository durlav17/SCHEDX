import { ChartColumn, Cpu, ExternalLink, FileText, Lightbulb, Search, Sigma } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, PageHeader } from "../components/ui";
import { AqsLoopDiagram, FlowDiagram } from "../diagrams/Diagrams";

const REFS = [
  { t: "EEVDF Scheduler", src: "The Linux Kernel documentation", url: "https://docs.kernel.org/scheduler/sched-eevdf.html", note: "Linux began moving to EEVDF in kernel 6.6. Eligible tasks (lag ≥ 0) are served earliest virtual deadline first." },
  { t: "CFS Scheduler", src: "The Linux Kernel documentation", url: "https://docs.kernel.org/scheduler/sched-design-CFS.html", note: "Earlier Linux design: approximates an ideal, perfectly fair processor by tracking each task's virtual runtime." },
  { t: "Operating Systems: Three Easy Pieces, ch. 7 CPU Scheduling and ch. 8 Multi-level Feedback", src: "R. H. Arpaci-Dusseau and A. C. Arpaci-Dusseau", url: "https://pages.cs.wisc.edu/~remzi/OSTEP/", note: "Textbook treatment of FCFS, SJF, STCF, RR, response vs. turnaround, and the MLFQ rules with priority boost." },
  { t: "A Quantitative Measure of Fairness and Discrimination for Resource Allocation in Shared Computer Systems", src: "R. Jain, D. Chiu, W. Hawe, DEC Research Report TR-301, 1984", url: "https://arxiv.org/abs/cs/9809099", note: "Source of Jain's fairness index, used by SchedX on per-process slowdown." },
];


interface Cell { verdict: "better" | "worse" | "unclear"; paired: string; delta_pct: number | null; aqs: number; rr4: number }
interface SummaryTable {
  simulations: number; trials_per_class: number; context_switch_cost: number; protocol_sha256: string; rule: string; baseline: string;
  rows: ({ class: string } & Record<"response_mean" | "turnaround_mean" | "context_switches" | "max_ready_stint", Cell>)[];
}
const COLS: [keyof SummaryTable["rows"][number], string][] = [["response_mean", "Mean response"], ["turnaround_mean", "Turnaround"], ["context_switches", "Context switches"], ["max_ready_stint", "Longest ready wait"]];

function VerdictCell({ c }: { c: Cell }) {
  const tone = c.verdict === "better" ? "good" : c.verdict === "worse" ? "critical" : "neutral";
  const label = c.verdict === "better" ? "clearly lower" : c.verdict === "worse" ? "clearly higher" : "no clear difference";
  return (
    <div>
      <span className="font-mono text-fg">{c.aqs}</span> <span className="text-fg-faint">vs</span> <span className="font-mono">{c.rr4}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] text-fg-muted">{c.delta_pct === null ? "n/a" : `${c.delta_pct > 0 ? "+" : ""}${c.delta_pct.toFixed(1)}%`}</span>
        <Badge tone={tone}>{label}</Badge>
      </div>
    </div>
  );
}

/** Numbers come from research-results/ (generated JSON), never typed by hand. */
function ObservedResults() {
  const [t, setT] = useState<SummaryTable | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/research/summary-table.json").then((r) => (r.ok ? r.json() : Promise.reject())).then(setT, () => setFailed(true));
  }, []);
  return (
    <Card title="Observed results" subtitle="Recorded simulations. These are observations; the hypotheses above stay hypotheses until judged by them." glass className="edge-light">
      {failed && <p className="text-sm text-fg-faint">The recorded results table could not be loaded. See <code>research-results/summary.md</code> in the repository.</p>}
      {t && (
        <>
          <p className="mb-3 text-xs text-fg-faint">
            {t.simulations.toLocaleString()} simulations · {t.trials_per_class} seeded trials per workload class · switch cost {t.context_switch_cost} tu · AQS at its default parameters (not tuned). Each cell: <b className="text-fg-muted">AQS mean vs {t.baseline} mean</b> (time units, or counts), relative change, and whether the 95&nbsp;% confidence intervals separate. Rule fixed before the runs: a difference is clear only if the intervals do not overlap.
          </p>
          <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
            <table className="data-table">
              <thead><tr><th>Workload class</th>{COLS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.class}>
                    <td className="font-medium text-fg">{r.class}</td>
                    {COLS.map(([k]) => <td key={k}><VerdictCell c={r[k] as Cell} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <p className="eyebrow mb-2">Observed (hypothesis verdicts)</p>
          <ul className="space-y-1.5 text-[13px] text-fg-muted">
            <li><Badge tone="warn">H1 met weakly</Badge> The best mean response is Round Robin q=2 in every class. Only the SJF/SRTF turnaround leader changes, and those two are nearly tied.</li>
            <li><Badge tone="critical">H2 not supported</Badge> No clear response-time gain over RR q=4 in Interactive or Mixed, and clearly higher than MLFQ in Mixed. A clear gain appears only in CPU-bound.</li>
            <li><Badge tone="good">H3 supported</Badge> At switch cost 5, AQS makes clearly fewer switches than RR q=2 in all five classes.</li>
            <li><Badge tone="warn">H4 supported in 4 of 5</Badge> Fewer starvation flags than preemptive Priority, except High load, where the 50 tu flag saturates.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <p className="eyebrow mb-2">Interpretation (not measured directly)</p>
          <p className="text-[13px] leading-relaxed text-fg-muted">AQS behaves as a trade-off, not a free improvement. When switching is costly its overhead rule lengthens the quantum: switches and turnaround fall, but response time rises above fixed RR. With free switching it shortens the quantum under load and lowers response time in CPU-bound and High-load workloads, at the price of many more switches.</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <p className="eyebrow mb-2">Limitations of these results</p>
          <ul className="list-disc space-y-1 pl-4 text-[13px] text-fg-muted">
            <li>Default AQS parameters only; a tuned AQS may differ.</li>
            <li>Synthetic workloads, one simulated CPU, switch cost is a parameter.</li>
            <li>10 trials per cell: "no clear difference" is not "equal".</li>
            <li>No multiple-comparison correction.</li>
          </ul>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {[["fig2_aqs_vs_rr4_paired.svg", "Paired percentage difference between AQS and RR q=4 for mean response, p95 response, mean turnaround and context switches in each workload class, with 95% confidence intervals."],
          ["fig3_cost_sweep.svg", "Context switches and mean response for RR q=2, RR q=4 and AQS as the simulated switch cost rises from 0 to 5, in each workload class."]].map(([f, alt]) => (
          <figure key={f} className="overflow-hidden rounded-xl border border-white/[0.07] bg-white">
            <a href={`/research/${f}`} target="_blank" rel="noreferrer" aria-label={`Open full size: ${alt}`}>
              <img src={`/research/${f}`} alt={alt} className="block w-full" loading="lazy" />
            </a>
            <figcaption className="bg-ink-850 px-3 py-2 text-[11px] text-fg-muted">{alt} <span className="text-cyan-300">(click to open full size)</span></figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-4 text-xs text-fg-faint">Full write-up, all tables, raw per-trial data and the exact rerun commands: <code>research-results/</code> (summary.md, tables.md, raw/, PROTOCOL.md). Nothing here is a real-hardware benchmark.</p>
    </Card>
  );
}

export default function ResearchPage() {
  return (
    <>
      <PageHeader eyebrow="Research & methodology" title="Can an adaptive quantum help, and at what cost?"
        description="SchedX treats AQS as a hypothesis to test, not a result to advertise. This page states the question, the hypotheses, the experimental design and the limits of what a simulator can show." />
      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Problem statement">
            <p className="text-sm leading-relaxed text-fg-muted">Classical scheduling algorithms make different trade-offs between response time, waiting time, throughput, overhead and fairness, and their behaviour depends on workload assumptions and configuration. A fixed Round Robin quantum is a typical example: too small, and the CPU spends its time switching; too large, and the policy degenerates towards FCFS, so interactive processes wait.</p>
          </Card>
          <Card title="Research question" glass className="edge-light">
            <p className="text-[15px] leading-relaxed text-fg">Can a workload-adaptive time-quantum scheduling policy improve response time for interactive and mixed workloads without introducing unacceptable context-switch overhead, unfairness or starvation, compared with established scheduling algorithms?</p>
            <p className="mt-3 text-xs text-fg-faint">In short: can AQS improve response time on selected workload classes without excessive overhead or unfairness?</p>
          </Card>
        </div>

        <Card title="Objectives">
          <ul className="grid gap-2 text-sm text-fg-muted sm:grid-cols-2 lg:grid-cols-5">
            {["Build a correct and testable scheduling simulator.", "Provide decision-level explainability.", "Compare established algorithms under controlled workloads.", "Evaluate the proposed AQS policy.", "Preserve reproducible experiment configurations."].map((o, i) => (
              <li key={o} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><span className="font-mono text-[10px] text-fg-faint">O{i + 1}</span><p className="mt-1">{o}</p></li>
            ))}
          </ul>
        </Card>

        <Card title="Methodology">
          <FlowDiagram label="Methodology" steps={[
            { title: "Workload definition", icon: <FileText className="size-4 text-cyan-300" />, body: "Workload classes (CPU-bound, I/O-heavy, interactive, mixed, high load) are generator configurations with fixed seeds. Every comparable run uses the identical process list." },
            { title: "Algorithm execution", icon: <Cpu className="size-4 text-cyan-300" />, body: "The deterministic engine runs each policy tick by tick with a documented event order and tie-breaking, so identical inputs give identical outputs." },
            { title: "Decision tracing", icon: <Search className="size-4 text-cyan-300" />, body: "Each dispatch records its candidates, keys, preemption, context switch and AQS signals, so behaviour can be audited rather than inferred." },
            { title: "Metrics calculation", icon: <Sigma className="size-4 text-cyan-300" />, body: "Response, ready waiting, turnaround (mean, median, p95, max), throughput, CPU utilisation excluding overhead, switch count and overhead, longest ready stint, starvation flags, and Jain fairness on slowdown." },
            { title: "Comparative analysis", icon: <ChartColumn className="size-4 text-cyan-300" />, body: "Side-by-side metrics with deltas against a stated baseline. Sweeps vary one parameter at a time. Repeated seeded trials give means with 95% Student-t confidence intervals." },
            { title: "Interpretation", icon: <Lightbulb className="size-4 text-cyan-300" />, body: "Results are read as trade-offs per workload class. Negative results (AQS worse on some metric or class) are reported alongside positive ones." },
          ]} />
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Hypotheses" subtitle="To be tested. These are not findings.">
            <ol className="space-y-3 text-sm text-fg-muted">
              <li><Badge tone="accent">H1</Badge> Different workload classes produce different relative rankings of the algorithms. No single policy is most favourable on every metric.</li>
              <li><Badge tone="accent">H2</Badge> AQS may lower mean or p95 response time against fixed-quantum RR on interactive and high-load workloads, possibly at the cost of more context switches or longer turnaround.</li>
              <li><Badge tone="accent">H3</Badge> Quantum size and context-switch cost change the observed trade-offs. With a high switch cost, AQS's overhead rule should keep its switch count below that of a small fixed quantum.</li>
              <li><Badge tone="accent">H4</Badge> AQS, being FIFO-based, should not produce starvation flags under the same threshold where non-ageing preemptive priority scheduling does.</li>
            </ol>
          </Card>
          <Card title="Evaluation design">
            <ul className="space-y-2 text-sm text-fg-muted">
              <li><span className="text-fg">Identical workloads</span>: the Arena and the Studio pass one process list to every configuration.</li>
              <li><span className="text-fg">Fixed seeds</span>: the generator uses a private seeded random number generator, so a saved experiment can be re-run and verified ("Reproduce" in the History panel).</li>
              <li><span className="text-fg">Sensitivity analysis</span>: sweep the quantum, the switch cost, the process count or the burst distribution.</li>
              <li><span className="text-fg">Distribution summaries</span>: report p95 alongside means, because tail latency matters for interactive work.</li>
              <li><span className="text-fg">Repeated trials</span>: for randomised workloads, k trials use seeds s…s+k−1. Means are shown with 95% confidence intervals.</li>
              <li><span className="text-fg">Negative results</span>: kept and reported, never filtered out.</li>
            </ul>
            <Link to="/experiments" className="mt-4 inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline">Run these experiments in the Studio →</Link>
          </Card>
        </div>

        <ObservedResults />

        <Card title="The proposed AQS policy" subtitle="Formal rule in docs/aqs-policy.md">
          <AqsLoopDiagram />
          <div className="mt-4 grid gap-3 text-sm text-fg-muted md:grid-cols-3">
            <p><span className="text-fg">Signals.</span> L = processes still waiting at dispatch. ρ = context-switch overhead ÷ (overhead + executed CPU) over the last W slices.</p>
            <p><span className="text-fg">Rule.</span> First match wins: ρ &gt; limit → q+δ; L ≥ high → q−δ; L ≤ low → q+δ; otherwise hold. The result is then clamped to [q_min, q_max].</p>
            <p><span className="text-fg">Stability.</span> One bounded step per dispatch, hard bounds, and no randomness. Every adjustment is recorded in the decision trace.</p>
          </div>
          <p className="mt-3 text-xs text-fg-faint">AQS is not claimed to be novel or superior. Adaptive and dynamic quantum variants of Round Robin are a known idea. The contribution here is an explicit, testable rule, a transparent trace, and a systematic evaluation that may well show AQS losing on some workloads.</p>
        </Card>

        <Card title="Related work and references">
          <p className="mb-4 text-sm leading-relaxed text-fg-muted">The algorithms simulated here are the textbook policies. Modern Linux does not use any of them directly. Its fair-class scheduler, CFS and since kernel 6.6 EEVDF, allocates CPU in proportion to task weights using virtual runtime, lag and virtual deadlines. SchedX does not model these mechanisms. They appear here so the line between textbook simulation and a production kernel stays clear.</p>
          <ul className="space-y-3">
            {REFS.map((r) => (
              <li key={r.url} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-200 hover:underline">{r.t}<ExternalLink className="size-3" /></a>
                <p className="mt-0.5 text-xs text-fg-faint">{r.src}</p>
                <p className="mt-1 text-xs text-fg-muted">{r.note}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Limitations">
          <ul className="grid gap-2 text-sm text-fg-muted sm:grid-cols-2">
            <li>• The simulation is a model, not a production scheduler.</li>
            <li>• Results depend on the defined workloads and policy parameters.</li>
            <li>• AQS may perform worse than established approaches in some scenarios.</li>
            <li>• Simulated context-switch overhead is not a real hardware measurement.</li>
            <li>• The project does not modify the Linux kernel.</li>
            <li>• SJF/SRTF know burst lengths exactly, which real schedulers cannot.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
