import { CircleQuestionMark, LoaderCircle, TriangleAlert, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

// ---------------------------------------------------------------- Button
type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: ReactNode }) {
  const v = {
    primary:
      "bg-gradient-to-b from-violet-400 to-violet-600 text-white shadow-[0_6px_20px_-8px_rgb(139_92_246/0.8),inset_0_1px_0_rgb(255_255_255/0.25)] hover:from-violet-300 hover:to-violet-500",
    secondary: "bg-white/[0.06] text-fg border border-white/10 hover:bg-white/[0.1] hover:border-white/20",
    ghost: "text-fg-muted hover:text-fg hover:bg-white/[0.06]",
    danger: "bg-critical/15 text-red-300 border border-critical/40 hover:bg-critical/25",
  }[variant];
  const s = { sm: "h-8 px-2.5 text-xs gap-1.5", md: "h-9 px-3.5 text-sm gap-2", lg: "h-11 px-5 text-[15px] gap-2" }[size];
  return (
    <button
      className={cx(
        "inline-flex select-none items-center justify-center rounded-lg font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        v, s, className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Card
export function Card({
  title, subtitle, actions, children, className, glass, bodyClass, id,
}: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode;
  className?: string; glass?: boolean; bodyClass?: string; id?: string;
}) {
  return (
    <section id={id} className={cx("rounded-[var(--radius-card)]", glass ? "glass" : "surface", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-fg-faint">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- Badge
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "cyan" | "good" | "warn" | "critical"; className?: string }) {
  const t = {
    neutral: "bg-white/[0.06] text-fg-muted border-white/10",
    accent: "bg-violet-500/15 text-violet-200 border-violet-400/30",
    cyan: "bg-cyan-500/10 text-cyan-200 border-cyan-400/30",
    good: "bg-green-500/10 text-green-300 border-green-500/30",
    warn: "bg-amber-500/10 text-amber-200 border-amber-400/30",
    critical: "bg-red-500/10 text-red-300 border-red-500/30",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", t, className)}>{children}</span>;
}

// ---------------------------------------------------------------- Tooltip
export function InfoTip({ children, label = "More information", className }: { children: ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150), y: r.bottom + 8 });
    setOpen(true);
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        className={cx("inline-flex text-fg-faint hover:text-fg-muted align-middle", className)}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); open ? setOpen(false) : show(); }}
      >
        <CircleQuestionMark className="size-3.5" aria-hidden />
      </button>
      {open && pos &&
        createPortal(
          <div
            role="tooltip"
            id={id}
            style={{ left: pos.x, top: pos.y }}
            className="glass animate-fade-in pointer-events-none fixed z-[100] w-72 -translate-x-1/2 rounded-lg px-3 py-2 text-xs leading-relaxed text-fg-muted"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

// ---------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx("glass animate-scale-in relative max-h-[90vh] w-full overflow-auto rounded-2xl outline-none", wide ? "max-w-3xl" : "max-w-md")}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-fg-faint hover:bg-white/10 hover:text-fg" aria-label="Close dialog">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-fg-muted">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger, onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}
      footer={<><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button></>}>
      {message}
    </Modal>
  );
}

// ---------------------------------------------------------------- Feedback
export function ErrorBanner({ messages, onDismiss, title = "Something needs attention" }: { messages: string[] | null; onDismiss?: () => void; title?: string }) {
  if (!messages?.length) return null;
  return (
    <div role="alert" className="animate-fade-in flex gap-3 rounded-xl border border-critical/40 bg-critical/10 px-4 py-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-red-200">{title}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-200/80">
          {messages.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}
          {messages.length > 8 && <li>…and {messages.length - 8} more</li>}
        </ul>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="self-start rounded p-0.5 text-red-200/70 hover:text-red-100"><X className="size-4" /></button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-fg-muted">{icon}</div>
      <p className="font-medium text-fg">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-fg-faint">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-fg-muted">
      <LoaderCircle className="size-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

// ---------------------------------------------------------------- Stat card
export function StatCard({ label, value, unit, help, tone, sub }: { label: string; value: ReactNode; unit?: string; help?: ReactNode; tone?: "warn" | "critical" | "good"; sub?: ReactNode }) {
  return (
    <div className="surface animate-fade-up rounded-xl px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-faint">
        {label}
        {help && <InfoTip label={`About ${label}`}>{help}</InfoTip>}
      </div>
      <div className={cx("mt-1 font-mono text-xl font-semibold tabular-nums", tone === "warn" ? "text-amber-200" : tone === "critical" ? "text-red-300" : "text-fg")}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-fg-faint">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-fg-faint">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Page header
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="animate-fade-up mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow mb-1.5 text-cyan/80">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Form bits
export function Label({ children, htmlFor, help }: { children: ReactNode; htmlFor?: string; help?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
      {children}
      {help && <InfoTip>{help}</InfoTip>}
    </label>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("field appearance-none bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239aa3b2' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-white/10 bg-ink-950/60 p-0.5">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", value === o.value ? "bg-white/10 text-fg shadow-sm" : "text-fg-faint hover:text-fg-muted")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button id={id} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx("relative h-5 w-9 rounded-full border transition-colors", checked ? "border-violet-400/60 bg-violet-500/60" : "border-white/15 bg-white/[0.06]")}>
      <span className={cx("absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow transition-transform", checked && "translate-x-4")} />
    </button>
  );
}
