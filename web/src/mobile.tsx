import React, { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Database,
  Dna,
  FileText,
  FlaskConical,
  Home as HomeIcon,
  Layers,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Upload,
  Watch,
  X,
} from "lucide-react";
import { api, date, shortDate, RecordData } from "./api";
import { Badge, Button, Modal } from "./components";
import { useApp } from "./context";
import { domainIcons } from "./config";
import { isWearable } from "./wearables";

const MOBILE_QUERY = "(max-width: 700px)";

export function useIsMobile() {
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}

const tabs = [
  ["home", "Today", HomeIcon, ["home"]],
  ["twin", "Twin", Dna, ["twin", "biology"]],
  ["interventions", "Protocol", FlaskConical, ["interventions"]],
  ["ai", "Ask", Sparkles, ["ai"]],
  ["you", "You", CircleUserRound, ["you", "data", "settings"]],
] as const;

export function MobileTabBar({
  page,
  go,
}: {
  page: string;
  go: (route: string) => void;
}) {
  return (
    <nav className="mobile-tabbar" aria-label="Primary">
      {tabs.map(([id, label, Icon, pages]) => {
        const active = (pages as readonly string[]).includes(page);
        return (
          <a
            key={id}
            href={"#" + id}
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(id);
            }}
          >
            <Icon size={24} strokeWidth={active ? 2.2 : 1.8} />
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}

const trendTone = (trend: string) =>
  trend === "Improving" ? "green" : trend === "Worsening" ? "amber" : "purple";

function topSignal(d: RecordData) {
  const matching = d.signals.filter(
    (s: RecordData) => s.trend === d.trend && s.personal_change_pct != null,
  );
  return [...(matching.length ? matching : d.signals)]
    .filter((s: RecordData) => s.personal_change_pct != null)
    .sort(
      (a: RecordData, b: RecordData) =>
        Math.abs(b.personal_change_pct) - Math.abs(a.personal_change_pct),
    )[0];
}

function signalSentence(s: RecordData) {
  return `${s.label} ${s.personal_change_pct > 0 ? "increased" : "decreased"} ${Math.abs(s.personal_change_pct)}% from your personal baseline.`;
}

function relativeDays(value?: string) {
  if (!value) return "";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

function latest(observations: RecordData[]) {
  return observations
    .map((o) => o.effective_time)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function experimentWeek(e: RecordData) {
  return Math.min(
    e.planned_duration_weeks,
    Math.max(
      1,
      Math.ceil((Date.now() - new Date(e.start_date).getTime()) / 604800000),
    ),
  );
}

function headline(d: RecordData) {
  if (d.trend === "Improving") return [d.name, "is improving"];
  if (d.trend === "Worsening" || /concern/i.test(d.state || ""))
    return [d.name, "needs attention"];
  if (d.trend === "Stable") return [d.name, "is steady"];
  return [d.name, "is your focus"];
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

function BaselineChart({ signal }: { signal: RecordData }) {
  const history: RecordData[] = signal.history || [];
  if (history.length < 2) return null;
  const values = history.map((h) => Number(h.value));
  const baseline = signal.baseline == null ? null : Number(signal.baseline);
  const all = baseline == null ? values : [...values, baseline];
  const min = Math.min(...all),
    max = Math.max(...all),
    range = max - min || 1;
  const y = (v: number) => 62 - ((v - min) / range) * 52;
  const x = (i: number) => 4 + (i / (values.length - 1)) * 292;
  const path = values
    .map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`)
    .join(" ");
  const color = signal.trend === "Worsening" ? "#a8773f" : "#5a7863";
  return (
    <figure className="m-chart">
      <svg
        viewBox="0 0 300 70"
        role="img"
        aria-label={`${signal.label} history compared with your baseline`}
      >
        {baseline != null && (
          <>
            <line
              x1="0"
              x2="300"
              y1={y(baseline)}
              y2={y(baseline)}
              stroke="#5a7863"
              strokeOpacity=".45"
              strokeDasharray="4 5"
            />
            <text
              x="296"
              y={y(baseline) - 5}
              textAnchor="end"
              className="m-chart-label"
            >
              Your baseline
            </text>
          </>
        )}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={x(values.length - 1)}
          cy={y(values.at(-1)!)}
          r="4"
          fill={color}
          stroke="#fff"
          strokeWidth="2"
        />
      </svg>
      <figcaption>
        <span>{shortDate(history[0].date)}</span>
        <span>{shortDate(history.at(-1)!.date)}</span>
      </figcaption>
    </figure>
  );
}

export function MobileToday() {
  const { state, me, go, setModal } = useApp();
  const t = state.twin;
  const [checkIn, setCheckIn] = useState<RecordData | null>(null);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = me.profile.name?.split(" ")[0];
  const priority = t.priorities
    .map((id: string) => t.domains.find((d: RecordData) => d.id === id))
    .find(Boolean);
  const signal = priority && topSignal(priority);
  const pathways: string[] = priority
    ? Array.from(
        new Set(
          t.relationships
            .filter((r: RecordData) => r.domain === priority.id)
            .map((r: RecordData) => r.pathway || r.process),
        ),
      )
    : [];
  const active = state.experiments.find(
    (e: RecordData) => !["Stopped", "Evaluated"].includes(e.status),
  );
  const wearableDate = latest(
    state.observations.filter((o: RecordData) => isWearable(o.source)),
  );
  const labDate = latest(
    state.observations.filter((o: RecordData) => !isWearable(o.source)),
  );
  const hasDna =
    me.consents.genomics &&
    state.artifacts.some((a: RecordData) => a.kind === "genomics");
  const systems = t.domains.filter((d: RecordData) => d.coverage > 0);
  const [head, tail] = priority ? headline(priority) : ["", ""];
  return (
    <div className="m-today">
      <div className="m-heading">
        <span className="m-date">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </span>
        <h1>
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
      </div>
      <div className="m-chips" role="group" aria-label="Data freshness">
        <span className={"m-chip " + (wearableDate ? "green" : "")}>
          {wearableDate && <i className="m-dot" />}
          {wearableDate
            ? `Wearables · ${relativeDays(wearableDate)}`
            : "No wearable data"}
        </span>
        <span className="m-chip">
          {labDate ? `Labs · ${relativeDays(labDate)}` : "No lab results"}
        </span>
        <span className="m-chip">{hasDna ? "DNA added" : "DNA not added"}</span>
      </div>

      {priority ? (
        <section
          className={"m-card m-priority tone-" + trendTone(priority.trend)}
        >
          <div className="m-row between">
            <span className="m-eyebrow">Your #1 priority</span>
            <Badge tone={trendTone(priority.trend)}>{priority.trend}</Badge>
          </div>
          <h2>
            {head} <em>{tail}</em>
          </h2>
          <p>{signal ? signalSentence(signal) : priority.subtitle}</p>
          {signal && <BaselineChart signal={signal} />}
          {pathways.length > 0 && (
            <>
              <span className="m-label">Linked biology</span>
              <div className="m-chip-row">
                {pathways.slice(0, 3).map((p) => (
                  <span className="m-chip purple" key={p}>
                    {p}
                  </span>
                ))}
              </div>
            </>
          )}
          <Button className="m-block" onClick={() => go("twin/" + priority.id)}>
            See why this is happening <ArrowRight size={18} />
          </Button>
        </section>
      ) : (
        <section className="m-card m-priority">
          <span className="m-eyebrow">Your #1 priority</span>
          <h2>
            Let your data <em>tell the story</em>
          </h2>
          <p>
            Your priorities appear when there is enough verified information.
            Start with historical and current bloodwork.
          </p>
          <Button
            className="m-block"
            onClick={() => setModal({ type: "upload" })}
          >
            <Upload size={18} />
            Add your first report
          </Button>
        </section>
      )}

      <div className="m-section-head">
        <h2>Your protocol</h2>
        <button className="m-link" onClick={() => go("interventions")}>
          All options <ChevronRight size={16} />
        </button>
      </div>
      {active ? (
        <ExperimentProgressCard
          e={active}
          compact
          onCheckIn={() => setCheckIn(active)}
          onOpen={() => go("interventions/active")}
        />
      ) : (
        <section className="m-card">
          <h3 className="m-card-title">Make your next step measurable</h3>
          <p className="m-body">
            Turn a personal priority into a thoughtful experiment with a frozen
            baseline.
          </p>
          <Button
            variant="secondary"
            className="m-block"
            onClick={() => go("interventions")}
          >
            Explore your options <ArrowRight size={18} />
          </Button>
        </section>
      )}

      {systems.length > 0 && (
        <>
          <div className="m-section-head">
            <h2>Your systems</h2>
            <button className="m-link" onClick={() => go("twin")}>
              View Twin <ChevronRight size={16} />
            </button>
          </div>
          <div className="m-system-grid">
            {systems.map((d: RecordData) => {
              const Icon = domainIcons[d.id] || Layers;
              return (
                <button
                  key={d.id}
                  className="m-card m-system"
                  onClick={() => go("twin/" + d.id)}
                >
                  <span className="m-row between">
                    <span className={"domain-icon small domain-" + d.id}>
                      <Icon size={18} />
                    </span>
                    <Badge tone={trendTone(d.trend)}>{d.trend}</Badge>
                  </span>
                  <strong>{d.name}</strong>
                  <small>{d.state}</small>
                </button>
              );
            })}
          </div>
        </>
      )}

      <button className="m-card m-ask" onClick={() => go("ai")}>
        <span className="m-ask-icon">
          <Sparkles size={20} />
        </span>
        <span>
          <strong>Ask Aevum</strong>
          <small>Questions answered from your own Twin</small>
        </span>
        <ChevronRight size={18} />
      </button>
      {checkIn && <CheckInSheet e={checkIn} onClose={() => setCheckIn(null)} />}
    </div>
  );
}

function Step({
  n,
  eyebrow,
  title,
  children,
  chip,
  tone = "",
  last = false,
}: {
  n: number;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  chip?: string;
  tone?: string;
  last?: boolean;
}) {
  return (
    <li className={"m-step " + (last ? "last" : "")}>
      <span className="m-step-index" aria-hidden="true">
        {n}
      </span>
      <div className="m-card m-step-card">
        <div className="m-row between">
          <span className="m-eyebrow">{eyebrow}</span>
          {chip && <Badge tone={tone}>{chip}</Badge>}
        </div>
        <h3>{title}</h3>
        {children}
      </div>
    </li>
  );
}

export function PathwayStory({ d }: { d: RecordData }) {
  const { state, catalog, go } = useApp();
  const rels: RecordData[] = state.twin.relationships.filter(
    (r: RecordData) => r.domain === d.id,
  );
  const signal = topSignal(d) || d.signals[0];
  const hallmarks = Array.from(
    new Set(rels.map((r) => r.hallmark_id).filter(Boolean)),
  )
    .map((id) => catalog.hallmarks.find((h: RecordData) => h.id === id)?.name)
    .filter(Boolean) as string[];
  const matches = state.recommendations.filter((r: RecordData) =>
    [r.domain, ...(r.also || [])].includes(d.id),
  );
  const rec =
    matches.find((r: RecordData) => r.eligible && !r.blocked_reasons.length) ||
    matches[0];
  return (
    <section className="m-story" aria-label="From your data to what can help">
      <p className="m-story-intro">
        From your data to what can move it · 5 steps
      </p>
      <ol>
        <Step
          n={1}
          eyebrow="Signal · measured"
          chip={signal ? "Measured" : "Not measured"}
          tone={signal ? "green" : ""}
          title={
            signal
              ? signal.baseline != null
                ? `${signal.label} ${signal.baseline} → ${signal.current} ${signal.unit}`
                : `${signal.label} ${signal.current} ${signal.unit}`
              : "No direct measurements yet"
          }
        >
          <p>
            {signal
              ? signal.personal_change_pct != null
                ? `${signal.personal_change_pct > 0 ? "+" : ""}${signal.personal_change_pct}% vs your personal baseline · measured ${date(signal.latest_date)}.`
                : `${signal.reference_status}. Measured ${date(signal.latest_date)}.`
              : "Missing data is not interpreted as healthy or unhealthy."}
          </p>
        </Step>
        <Step
          n={2}
          eyebrow="What it suggests"
          chip={`${d.confidence} confidence`}
          tone={d.phenotype ? "purple" : "green"}
          title={d.phenotype || "No concerning pattern established"}
        >
          <p>
            {d.state}.{" "}
            {d.concordance != null
              ? `${Math.round(d.concordance * 100)}% of available signals agree.`
              : ""}
          </p>
        </Step>
        <Step
          n={3}
          eyebrow="Biological process"
          chip={rels.length ? rels[0].level : "Not inferred"}
          tone={
            rels.length
              ? rels[0].level === "Hypothesis"
                ? "amber"
                : "green"
              : ""
          }
          title={
            rels.length
              ? rels.map((r) => r.process).join(" · ")
              : "No biological process inferred"
          }
        >
          <p>
            {rels.length
              ? Array.from(
                  new Set(rels.map((r) => r.pathway).filter(Boolean)),
                ).join(" · ") ||
                "An evidence-classified interpretation, not a measured cause."
              : "A single cross-sectional panel cannot establish an active mechanism."}
          </p>
        </Step>
        <Step
          n={4}
          eyebrow="Aging hallmark"
          chip={hallmarks.length ? "Not directly measured" : "No mapping"}
          tone={hallmarks.length ? "purple" : ""}
          title={
            hallmarks.length
              ? hallmarks.join(" · ")
              : "No individual hallmark mapping"
          }
        >
          <p>
            {hallmarks.length
              ? "Linked to this pattern in the Hallmarks of Aging framework. Linked, not proven as the cause."
              : "The framework stays visible without claiming it was measured."}
          </p>
          <button className="m-link" onClick={() => go("biology/" + d.id)}>
            Explore the biology <ChevronRight size={16} />
          </button>
        </Step>
        <Step
          n={5}
          eyebrow="What can move it"
          chip={rec ? `${rec.level} evidence` : undefined}
          tone="green"
          title={rec ? rec.name : "No matching option yet"}
          last
        >
          <p>
            {rec
              ? rec.expected_effect
              : "Add verified baseline measurements to unlock measurable next steps."}
          </p>
          {rec?.review_required && (
            <Badge tone="amber">Professional review</Badge>
          )}
          <Button
            className="m-block"
            onClick={() =>
              go(
                !rec
                  ? "interventions"
                  : rec.already_active
                    ? "interventions/active"
                    : "interventions/plan/" + rec.id,
              )
            }
          >
            {!rec
              ? "Explore measurable next steps"
              : rec.already_active
                ? "View your active experiment"
                : "Explore this plan"}
            <ArrowRight size={18} />
          </Button>
        </Step>
      </ol>
    </section>
  );
}

function ProgressRing({ value, total }: { value: number; total: number }) {
  const r = 34,
    c = 2 * Math.PI * r,
    pct = total ? Math.min(1, value / total) : 0;
  return (
    <svg className="m-ring" viewBox="0 0 84 84" aria-hidden="true">
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke="#edf0ec"
        strokeWidth="8"
      />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke="#5a7863"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="42" textAnchor="middle" className="m-ring-value">
        {value}/{total}
      </text>
      <text x="42" y="58" textAnchor="middle" className="m-ring-label">
        weeks
      </text>
    </svg>
  );
}

export function ExperimentProgressCard({
  e,
  onCheckIn,
  onOpen,
  compact = false,
}: {
  e: RecordData;
  onCheckIn: () => void;
  onOpen: () => void;
  compact?: boolean;
}) {
  const week = experimentWeek(e);
  const targets = Object.entries(e.baseline || {}) as [string, RecordData][];
  return (
    <article className="m-card m-experiment">
      <div className="m-row">
        <ProgressRing value={week} total={e.planned_duration_weeks} />
        <div className="m-experiment-copy">
          <span className="m-eyebrow">Active experiment</span>
          <h3>{e.name}</h3>
          <Badge tone="purple">{e.status}</Badge>
        </div>
      </div>
      <div className="m-row between m-adherence">
        <span>Reported adherence</span>
        <strong>{e.adherence}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: e.adherence + "%" }} />
      </div>
      {!compact && targets.length > 0 && (
        <>
          <span className="m-label">Frozen baseline</span>
          <div className="m-metrics">
            {targets.slice(0, 3).map(([k, v]) => (
              <div key={k}>
                <small>{k.replace("VO2MAX", "VO₂ max")}</small>
                <strong>{v.value}</strong>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="m-body m-muted">Evaluation date · {date(e.due_date)}</p>
      <Button className="m-block" onClick={onCheckIn}>
        Check in <Check size={18} />
      </Button>
      <Button variant="secondary" className="m-block" onClick={onOpen}>
        Open experiment <ArrowRight size={18} />
      </Button>
    </article>
  );
}

const adherenceOptions = [100, 90, 75, 50, 25, 0];
const changeOptions = [
  "Illness",
  "Travel",
  "Alcohol",
  "High stress",
  "Poor sleep",
  "Medication change",
];

function mergeChanges(selected: string[], note: string) {
  const seen = new Set<string>();
  return [...selected, ...note.split(/;\s*/)]
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.toLowerCase();
      if (!part || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("; ");
}

export function CheckInSheet({
  e,
  onClose,
}: {
  e: RecordData;
  onClose: () => void;
}) {
  const { run, busy } = useApp();
  const [adherence, setAdherence] = useState<number>(
    Number(e.adherence ?? 100),
  );
  const [changes, setChanges] = useState<string[]>([]);
  const [note, setNote] = useState<string>(e.concurrent_changes || "");
  const [adverse, setAdverse] = useState<string>(e.adverse_effects || "");
  const options = adherenceOptions.includes(adherence)
    ? adherenceOptions
    : [...adherenceOptions, adherence].sort((a, b) => b - a);
  return (
    <Modal title="Check in" onClose={onClose}>
      <form
        className="m-checkin"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await run(
            () =>
              api("/experiments/" + e.id, {
                method: "PATCH",
                body: JSON.stringify({
                  adherence,
                  adverse_effects: adverse,
                  concurrent_changes: mergeChanges(changes, note),
                }),
              }),
            "Check-in saved",
          );
          if (result) onClose();
        }}
      >
        <p className="m-eyebrow">
          Week {experimentWeek(e)} of {e.planned_duration_weeks} · {e.name}
        </p>
        <fieldset>
          <legend>How closely have you followed the protocol so far?</legend>
          <div className="m-options">
            {options.map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={adherence === value}
                className={
                  "m-option " + (adherence === value ? "selected" : "")
                }
                onClick={() => setAdherence(value)}
              >
                {value}%
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Anything that could affect results?</legend>
          <p className="m-hint">
            Helps separate the experiment from everyday noise.
          </p>
          <div className="m-options wrap">
            {changeOptions.map((option) => {
              const selected = changes.includes(option);
              return (
                <button
                  type="button"
                  key={option}
                  aria-pressed={selected}
                  className={"m-option pill " + (selected ? "selected" : "")}
                  onClick={() =>
                    setChanges((current) =>
                      selected
                        ? current.filter((c) => c !== option)
                        : [...current, option],
                    )
                  }
                >
                  {option}
                </button>
              );
            })}
          </div>
          <label>
            Other changes (optional)
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Medication changes, illness, travel or another intervention"
            />
          </label>
        </fieldset>
        <label>
          Side effects or new symptoms (optional)
          <textarea
            value={adverse}
            onChange={(event) => setAdverse(event.target.value)}
            placeholder="Record anything unexpected. Leave blank if none."
          />
        </label>
        <Button type="submit" className="m-block" disabled={busy}>
          Save check-in <Check size={18} />
        </Button>
      </form>
    </Modal>
  );
}

function rangeStatus(row: RecordData) {
  const value = Number(row.value);
  const low = row.reference_range?.low,
    high = row.reference_range?.high;
  if (row.value === "" || !Number.isFinite(value)) return null;
  if (high != null && value > high) return ["Above range", "amber"];
  if (low != null && value < low) return ["Below range", "amber"];
  if (low != null || high != null) return ["Within range", "green"];
  return null;
}

function RangeBar({ row }: { row: RecordData }) {
  const low = row.reference_range?.low,
    high = row.reference_range?.high,
    value = Number(row.value);
  if (low == null || high == null || !Number.isFinite(value) || high <= low)
    return null;
  const span = high - low;
  const min = Math.min(low - span * 0.4, value),
    max = Math.max(high + span * 0.4, value);
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="m-range" aria-hidden="true">
      <span
        className="m-range-normal"
        style={{ left: pos(low) + "%", width: pos(high) - pos(low) + "%" }}
      />
      <span className="m-range-marker" style={{ left: pos(value) + "%" }} />
    </div>
  );
}

export function MobileReview({
  rows,
  cursor,
  setCursor,
  update,
  remove,
}: {
  rows: RecordData[];
  cursor: number;
  setCursor: (value: number) => void;
  update: (i: number, key: string, value: any) => void;
  remove: (i: number) => void;
}) {
  const { catalog } = useApp();
  const [editing, setEditing] = useState(false);
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const row = rows[cursor];
  const concept = row
    ? catalog.concepts.find((c: RecordData) => c.id === row.concept_id)
    : null;
  const status = row ? rangeStatus(row) : null;
  const confirm = () => {
    setEditing(false);
    setCursor(cursor + 1);
  };
  const exclude = () => {
    setEditing(false);
    remove(cursor);
  };
  const release = () => {
    if (dx > 90) confirm();
    else if (dx < -90) exclude();
    start.current = null;
    setDx(0);
  };
  const reviewed = Math.min(cursor, rows.length);
  return (
    <div className="m-review">
      <div className="m-row between m-review-progress">
        <span>
          {reviewed} of {rows.length} reviewed
        </span>
        {cursor > 0 && (
          <button
            className="m-link"
            onClick={() => {
              setEditing(false);
              setCursor(cursor - 1);
            }}
          >
            <ChevronLeft size={16} /> Previous
          </button>
        )}
      </div>
      <div className="progress-track">
        <span
          style={{
            width: rows.length ? (reviewed / rows.length) * 100 + "%" : "0%",
          }}
        />
      </div>
      {row ? (
        <>
          <article
            className="m-card m-review-card"
            style={
              dx
                ? { transform: `translateX(${dx}px) rotate(${dx / 30}deg)` }
                : undefined
            }
            onPointerDown={(e: ReactPointerEvent) => {
              if (
                editing ||
                (e.target as HTMLElement).closest(
                  "input,select,textarea,button",
                )
              )
                return;
              start.current = e.clientX;
            }}
            onPointerMove={(e: ReactPointerEvent) => {
              if (start.current != null) setDx(e.clientX - start.current);
            }}
            onPointerUp={release}
            onPointerCancel={() => {
              start.current = null;
              setDx(0);
            }}
          >
            <div className="m-row between">
              <span className="m-eyebrow">Result {cursor + 1}</span>
              {status && <Badge tone={status[1]}>{status[0]}</Badge>}
            </div>
            {editing ? (
              <div className="m-review-edit">
                <label>
                  Biomarker
                  <select
                    value={row.concept_id}
                    onChange={(e) => {
                      update(cursor, "concept_id", e.target.value);
                      update(
                        cursor,
                        "unit",
                        catalog.concepts.find(
                          (c: RecordData) => c.id === e.target.value,
                        )?.unit,
                      );
                    }}
                  >
                    {catalog.concepts.map((c: RecordData) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="m-edit-grid">
                  <label>
                    Value
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={row.value}
                      onChange={(e) => update(cursor, "value", e.target.value)}
                    />
                  </label>
                  <label>
                    Unit
                    <input
                      value={row.unit}
                      onChange={(e) => update(cursor, "unit", e.target.value)}
                    />
                  </label>
                  <label>
                    Reference low
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={row.reference_range?.low ?? ""}
                      onChange={(e) =>
                        update(cursor, "reference_range", {
                          ...row.reference_range,
                          low:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Reference high
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={row.reference_range?.high ?? ""}
                      onChange={(e) =>
                        update(cursor, "reference_range", {
                          ...row.reference_range,
                          high:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Date
                  <input
                    type="date"
                    value={row.effective_time?.slice(0, 10) || ""}
                    onChange={(e) =>
                      update(cursor, "effective_time", e.target.value)
                    }
                  />
                </label>
              </div>
            ) : (
              <>
                <h3>{concept?.name || row.label || row.concept_id}</h3>
                <p className="m-review-value">
                  <strong>{row.value === "" ? "—" : row.value}</strong>
                  <span>{row.unit}</span>
                </p>
                <RangeBar row={row} />
                <div className="m-row between m-review-meta">
                  <span>
                    {row.reference_range?.low != null ||
                    row.reference_range?.high != null
                      ? `Lab range ${row.reference_range?.low ?? "—"} – ${row.reference_range?.high ?? "—"}`
                      : "No reference range"}
                  </span>
                  <span>
                    {row.effective_time
                      ? date(row.effective_time)
                      : "Date missing"}
                  </span>
                </div>
              </>
            )}
          </article>
          <div className="m-review-actions">
            <button
              type="button"
              onClick={exclude}
              aria-label="Exclude this result"
            >
              <span className="m-round danger">
                <X size={24} />
              </span>
              Exclude
            </button>
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              aria-pressed={editing}
            >
              <span className="m-round">
                <Pencil size={22} />
              </span>
              {editing ? "Done" : "Edit"}
            </button>
            <button
              type="button"
              onClick={confirm}
              aria-label="Confirm this result"
            >
              <span className="m-round primary">
                <Check size={26} />
              </span>
              Confirm
            </button>
          </div>
          <p className="m-hint center">
            Swipe right to confirm · left to exclude
          </p>
        </>
      ) : (
        <div className="m-card m-review-done">
          <span className="m-round primary">
            <Check size={26} />
          </span>
          <h3>
            {rows.length
              ? `All ${rows.length} results reviewed`
              : "No results left to add"}
          </h3>
          {rows.length > 0 && (
            <button className="m-link" onClick={() => setCursor(0)}>
              Review again <ChevronRight size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SourceRow({
  icon,
  tone,
  title,
  detail,
  done,
  onClick,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  detail: string;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button className="m-card m-source" onClick={onClick}>
      <span className={"m-source-icon " + tone}>{icon}</span>
      <span className="m-source-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {done ? (
        <span className="m-done" aria-label="Added">
          <Check size={16} />
        </span>
      ) : (
        <Plus size={18} />
      )}
    </button>
  );
}

export function YouPage() {
  const { state, me, go, setModal } = useApp();
  const t = state.twin;
  const wearables = state.observations.filter((o: RecordData) =>
    isWearable(o.source),
  );
  const labs = state.observations.filter(
    (o: RecordData) => !isWearable(o.source),
  );
  const labDocuments = state.artifacts.filter((a: RecordData) =>
    ["labs", "history"].includes(a.kind),
  ).length;
  const dna =
    me.consents.genomics &&
    state.artifacts.some((a: RecordData) => a.kind === "genomics");
  const coverage = Math.max(0, Math.min(100, Number(t.coverage) || 0));
  const missing = !wearables.length
    ? "Add wearable data to follow recovery and see whether experiments work."
    : !labs.length
      ? "Add lab results to establish your biomarker baselines."
      : !dna
        ? "DNA adds optional medication context."
        : "Keep measurements current so trends stay reliable.";
  const r = 34,
    c = 2 * Math.PI * r;
  return (
    <div className="m-you">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR DATA AND CONTROLS</span>
          <h1>You</h1>
        </div>
      </div>
      <section className="m-card m-profile">
        <span className="avatar">
          {me.profile.name
            ?.split(" ")
            .map((s: string) => s[0])
            .slice(0, 2)
            .join("")}
        </span>
        <span>
          <strong>{me.profile.name}</strong>
          <small>
            {me.profile.demo ? "Demo workspace" : "Personal workspace"} · Goal:{" "}
            {me.profile.goal}
          </small>
        </span>
      </section>
      <section className="m-card m-coverage">
        <svg className="m-ring" viewBox="0 0 84 84" aria-hidden="true">
          <circle
            cx="42"
            cy="42"
            r={r}
            fill="none"
            stroke="#e6ece2"
            strokeWidth="8"
          />
          <circle
            cx="42"
            cy="42"
            r={r}
            fill="none"
            stroke="#5a7863"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - coverage / 100)}
            transform="rotate(-90 42 42)"
          />
          <text x="42" y="48" textAnchor="middle" className="m-ring-value">
            {coverage}%
          </text>
        </svg>
        <div>
          <h2>Core measurement coverage</h2>
          <p>{missing}</p>
        </div>
      </section>
      <div className="m-section-head">
        <h2>Your sources</h2>
      </div>
      <SourceRow
        icon={<Dna size={22} />}
        tone="purple"
        title="DNA"
        detail={
          !me.consents.genomics
            ? "Separate permission required"
            : dna
              ? plural(state.genomic_findings.length, "contextual finding")
              : "No genotype file added"
        }
        done={Boolean(dna)}
        onClick={() =>
          me.consents.genomics
            ? setModal({ type: "upload", kind: "genomics" })
            : go("settings")
        }
      />
      <SourceRow
        icon={<FileText size={22} />}
        tone="green"
        title="Lab results"
        detail={
          labs.length
            ? `${plural(labDocuments, "source document")} · latest ${date(latest(labs)!)}`
            : "Upload a PDF or CSV lab report"
        }
        done={labs.length > 0}
        onClick={() => setModal({ type: "upload", kind: "labs" })}
      />
      <SourceRow
        icon={<Watch size={22} />}
        tone="amber"
        title="Wearables"
        detail={
          wearables.length
            ? `Latest data ${relativeDays(latest(wearables))}`
            : "Connect a wearable or import an export"
        }
        done={wearables.length > 0}
        onClick={() => go("data")}
      />
      <Button
        className="m-block"
        onClick={() => setModal({ type: "upload", kind: "labs" })}
      >
        <Upload size={18} />
        Add a lab report
      </Button>
      <div className="m-section-head">
        <h2>More</h2>
      </div>
      <nav className="m-card m-menu" aria-label="More">
        {[
          ["data", "My data", "Every measurement and source", Database],
          ["biology", "Biology", "Pathways and the 12 hallmarks", Layers],
          [
            "settings",
            "Settings & privacy",
            "Consent, goals, export and deletion",
            Settings,
          ],
        ].map(([id, label, detail, Icon]: any) => (
          <button key={id} onClick={() => go(id)}>
            <Icon size={20} />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
        <button onClick={() => setModal({ type: "evidence" })}>
          <BookOpen size={20} />
          <span>
            <strong>Evidence library</strong>
            <small>Sources, populations and limitations</small>
          </span>
          <ChevronRight size={18} />
        </button>
      </nav>
    </div>
  );
}
