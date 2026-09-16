import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  X,
  Check,
  Info,
  ChevronRight,
  Sparkles,
  LoaderCircle,
} from "lucide-react";
import { RecordData, shortDate } from "./api";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={"logo " + (small ? "small" : "")}>
      <span className="brand-mark">
        <i />
        <i />
        <i />
      </span>
      {!small && (
        <span>
          aevum<span className="logo-dot">.</span>
        </span>
      )}
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Trend({ trend }: { trend: string }) {
  const Icon =
    trend === "Improving"
      ? ArrowUpRight
      : trend === "Worsening"
        ? ArrowDownRight
        : ArrowRight;
  return (
    <span
      className={
        "trend " +
        (trend === "Improving"
          ? "positive"
          : trend === "Worsening"
            ? "concern"
            : "muted")
      }
    >
      <Icon size={14} />
      {trend}
    </span>
  );
}
export function Button({
  children,
  onClick,
  variant = "",
  disabled = false,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  type?: "submit" | "button";
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`button ${variant} ${className}`}
    >
      {children}
    </button>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Sparkles size={24} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" />
      <p>Connecting the pieces of your biology…</p>
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current;
    el?.focus();
    const key = (e: KeyboardEvent) => {
      if (Array.from(document.querySelectorAll("[role=dialog]")).at(-1) !== el)
        return;
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const list = Array.from(
          el.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
          ),
        );
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Sparkline({
  values,
  color = "#668b72",
}: {
  values: number[];
  color?: string;
}) {
  if (values.length < 2)
    return <span className="muted">Awaiting baseline</span>;
  const min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1;
  const pts = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * 110},${27 - ((v - min) / range) * 21}`,
    )
    .join(" ");
  return (
    <svg viewBox="0 0 112 32" className="sparkline" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}
export function HistoryChart({
  signals,
  large = false,
}: {
  signals: RecordData[];
  large?: boolean;
}) {
  const colors = ["#728a75", "#7d79b7", "#cb946c"];
  const usable = signals.filter((s) => s.history?.length >= 2).slice(0, 3);
  if (!usable.length)
    return (
      <Empty title="Your trajectory starts here">
        Add measurements from two different dates to see change over time.
      </Empty>
    );
  const all = usable.flatMap((s) =>
    s.history.map((h: RecordData) => new Date(h.date).getTime()),
  );
  const first = Math.min(...all),
    last = Math.max(...all);
  const deltas = usable
    .flatMap((s) =>
      s.history.map(
        (h: RecordData) => (h.value / s.history[0].value - 1) * 100,
      ),
    )
    .filter(Number.isFinite);
  const lo = Math.min(-5, ...deltas) - 4,
    hi = Math.max(5, ...deltas) + 4,
    range = hi - lo;
  const x = (time: number) => 50 + ((time - first) / (last - first || 1)) * 650;
  const y = (value: number) => 185 - ((value - lo) / range) * 145;
  return (
    <div className={"history-chart " + (large ? "large" : "")}>
      <div className="chart-legend">
        {usable.map((s, i) => (
          <span key={s.concept_id}>
            <i style={{ background: colors[i] }} />
            {s.label}
          </span>
        ))}
        <span className="chart-note">Change from first measurement</span>
      </div>
      <svg
        viewBox="0 0 730 235"
        role="img"
        aria-label="Biomarker trajectories, percent change from first measurement"
      >
        <defs>
          {colors.map((c, i) => (
            <linearGradient key={c} id={"area" + i} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor={c} stopOpacity=".10" />
              <stop offset="1" stopColor={c} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, 1, 2, 3].map((n) => {
          const value = lo + (range * n) / 3;
          return (
            <g key={n}>
              <line
                x1="50"
                x2="700"
                y1={y(value)}
                y2={y(value)}
                stroke="#e9ecee"
                strokeDasharray="3 5"
              />
              <text x="0" y={y(value) + 4} fill="#92999f" fontSize="11">
                {Math.round(value)}%
              </text>
            </g>
          );
        })}
        {usable.map((s, i) => {
          const points = s.history.map((h: RecordData) => [
            x(new Date(h.date).getTime()),
            y((h.value / s.history[0].value - 1) * 100),
          ]);
          return (
            <g key={s.concept_id}>
              <path
                d={`M${points.map((p: number[]) => p.join(",")).join(" L")}`}
                stroke={colors[i]}
                fill="none"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {points.map((p: number[], j: number) => (
                <circle
                  key={j}
                  cx={p[0]}
                  cy={p[1]}
                  r="3.5"
                  fill="white"
                  stroke={colors[i]}
                  strokeWidth="2"
                >
                  <title>
                    {s.label}: {s.history[j].value} {s.unit} ·{" "}
                    {shortDate(s.history[j].date)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((n) => (
          <text
            key={n}
            x={x(first + (last - first) * n)}
            y="222"
            textAnchor="middle"
            fill="#92999f"
            fontSize="11"
          >
            {shortDate(new Date(first + (last - first) * n).toISOString())}
          </text>
        ))}
      </svg>
    </div>
  );
}
export function TwinOrb() {
  return (
    <div className="orb-wrap" aria-hidden="true">
      <div className="orb-orbit orbit-one" />
      <div className="orb-orbit orbit-two" />
      <div className="orb">
        <div className="orb-light" />
        {Array.from({ length: 13 }, (_, i) => (
          <span
            key={i}
            className="orb-line"
            style={{
              top: `${12 + i * 5.9}%`,
              width: `${Math.sin(((i + 1) / 14) * Math.PI) * 95}%`,
              transform: `translateX(-50%) rotate(${i * 3 - 16}deg)`,
            }}
          />
        ))}
        <div className="orb-core" />
      </div>
      <span className="orbit-point point-one" />
      <span className="orbit-point point-two" />
      <span className="orb-caption">A LIVING MODEL OF YOU</span>
    </div>
  );
}
export function EvidenceCard({ e }: { e: RecordData }) {
  return (
    <article className="evidence-card">
      <div className="row between">
        <Badge tone={e.level === "Established" ? "green" : "purple"}>
          {e.level}
        </Badge>
        <span className="muted text-small">Reviewed {e.last_reviewed}</span>
      </div>
      <h3>
        <a href={e.citation} target="_blank" rel="noreferrer">
          {e.title}
          <ArrowUpRight size={15} />
        </a>
      </h3>
      <p>{e.population}</p>
      <dl>
        <div>
          <dt>Study design</dt>
          <dd>
            {e.study_design} · {e.year}
          </dd>
        </div>
        <div>
          <dt>Measured outcome</dt>
          <dd>{e.endpoint}</dd>
        </div>
      </dl>
      <div className="info-note">
        <Info size={15} />
        <span>{e.limitations}</span>
      </div>
    </article>
  );
}
