import React from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  FlaskConical,
  Info,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { shortDate, RecordData } from "../api";
import {
  Badge,
  Trend,
  Button,
  Empty,
  SectionTitle,
  Sparkline,
  TwinOrb,
} from "../components";
import { useApp } from "../context";
import { domainIcons } from "../config";
import { MobileToday, useIsMobile } from "../mobile";
import { attentionDomains } from "../priorities";
export function HomePage() {
  const mobile = useIsMobile();
  return mobile ? <MobileToday /> : <DesktopHome />;
}
function DesktopHome() {
  const { state, go, setModal, me } = useApp();
  const t = state.twin;
  const priorities = t.priorities.map((id: string) =>
    t.domains.find((d: RecordData) => d.id === id),
  );
  const alsoWatching = attentionDomains(t).filter(
    (d) => !t.priorities.includes(d.id),
  );
  const focus = t.domains.filter((d: RecordData) => d.coverage > 0).slice(0, 6);
  const experiments = state.experiments.filter(
    (e: RecordData) => !["Stopped", "Evaluated"].includes(e.status),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </div>
          <h1>Your biology, in perspective.</h1>
          <p>
            Welcome back, {me.profile.name.split(" ")[0]}. Here’s what matters
            right now.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setModal({ type: "upload" })}
        >
          <Plus size={16} />
          Add health data
        </Button>
      </div>
      <section className="twin-hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="status-dot" />
            YOUR BIOLOGICAL TWIN <span>v{t.version}</span>
          </div>
          <h2>
            A clearer picture.
            <br />
            <em>A healthier path forward.</em>
          </h2>
          <p>
            {t.observation_count
              ? `Your biology tells a nuanced story. ${t.domains.filter((d: RecordData) => d.trend === "Improving").length} domains are improving${t.domains.some((d: RecordData) => d.trend === "Worsening") ? ", with a few areas worth your attention." : ". Explore what your latest measurements reveal."}`
              : "Every measurement adds to the picture. Bring your bloodwork, wearable data and personal context together."}
          </p>
          <div className="hero-meta">
            <div>
              <span className="mini-label">OVERALL TRAJECTORY</span>
              <span className="hero-trajectory">
                <Activity size={18} />
                {t.overall_trajectory}
              </span>
            </div>
            <span className="vertical-rule" />
            <div>
              <span className="mini-label">LAST UPDATED</span>
              <strong>{shortDate(t.generated_at)}</strong>
            </div>
          </div>
          <Button onClick={() => go("twin")}>
            Explore my Twin <ArrowUpRight size={17} />
          </Button>
        </div>
        <TwinOrb />
        <div className="hero-confidence">
          <ShieldCheck size={14} />
          Built on evidence. Open about uncertainty.
        </div>
      </section>
      <section className="section">
        <SectionTitle
          eyebrow="THE SIGNAL, NOT THE NOISE"
          title={
            priorities.length === 1
              ? "One thing worth knowing"
              : priorities.length === 2
                ? "Two things worth knowing"
                : "Three things worth knowing"
          }
          action={
            <button className="text-button" onClick={() => go("twin")}>
              See the full picture <ArrowRight size={15} />
            </button>
          }
        />
        {priorities.length ? (
          <div className="insight-grid">
            {priorities.map((d: RecordData, i: number) => {
              const matching = d.signals.filter(
                (s: RecordData) =>
                  s.trend === d.trend && s.personal_change_pct != null,
              );
              const f = [...(matching.length ? matching : d.signals)]
                .filter((s: RecordData) => s.personal_change_pct != null)
                .sort(
                  (a: RecordData, b: RecordData) =>
                    Math.abs(b.personal_change_pct) -
                    Math.abs(a.personal_change_pct),
                )[0];
              const Icon = domainIcons[d.id];
              return (
                <button
                  className={"insight-card card tone-" + i}
                  key={d.id}
                  onClick={() => go("twin/" + d.id)}
                >
                  <div className="row between">
                    <span className={"domain-icon domain-" + d.id}>
                      <Icon size={20} />
                    </span>
                    <Badge
                      tone={
                        d.trend === "Improving"
                          ? "green"
                          : d.trend === "Worsening"
                            ? "amber"
                            : "purple"
                      }
                    >
                      {d.trend}
                    </Badge>
                  </div>
                  <h3>{d.name}</h3>
                  <p>
                    {f
                      ? `${f.label} ${f.personal_change_pct > 0 ? "increased" : "decreased"} ${Math.abs(f.personal_change_pct)}% from your personal baseline.`
                      : d.subtitle}
                  </p>
                  <div className="insight-foot">
                    <span>{d.confidence} confidence</span>
                    <ArrowUpRight size={17} />
                  </div>
                </button>
              );
            })}
          </div>
        ) : state.observations.length ? (
          <Empty
            title="Nothing needs attention right now"
            action={
              <Button variant="secondary" onClick={() => go("twin")}>
                Explore your Twin <ArrowRight size={16} />
              </Button>
            }
          >
            Your measured systems are within source intervals or your personal
            baseline. Keep measurements current so new changes are caught early.
          </Empty>
        ) : (
          <Empty
            title="Let your data tell the story"
            action={
              <Button onClick={() => setModal({ type: "upload" })}>
                <Upload size={16} />
                Add your first report
              </Button>
            }
          >
            Your priorities appear when there is enough verified information.
            Start with historical and current bloodwork.
          </Empty>
        )}
        {alsoWatching.length > 0 && (
          <div className="attention-more">
            <Info size={15} />
            <span>Also worth watching:</span>
            {alsoWatching.map((d) => (
              <button
                key={d.id}
                className="text-button"
                onClick={() => go("twin/" + d.id)}
              >
                {d.name} · {d.trend} <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        )}
      </section>
      <div className="overview-split">
        <section className="card domains-panel">
          <SectionTitle
            title="Your health, across systems"
            action={
              <button className="text-button" onClick={() => go("twin")}>
                View Twin <ArrowUpRight size={15} />
              </button>
            }
          />
          <div className="domain-list">
            {(focus.length ? focus : t.domains.slice(0, 6)).map(
              (d: RecordData) => {
                const Icon = domainIcons[d.id];
                return (
                  <button
                    className="domain-row"
                    key={d.id}
                    onClick={() => go("twin/" + d.id)}
                  >
                    <span className={"domain-icon small domain-" + d.id}>
                      <Icon size={17} />
                    </span>
                    <span className="domain-name">
                      {d.name}
                      <small>{d.state}</small>
                    </span>
                    <Sparkline
                      values={
                        d.signals[0]?.history?.map(
                          (h: RecordData) => h.value,
                        ) || []
                      }
                      color={d.trend === "Worsening" ? "#c49a72" : "#829782"}
                    />
                    <Trend trend={d.trend} />
                    <ChevronRight size={16} />
                  </button>
                );
              },
            )}
          </div>
          <div className="panel-foot">
            <Info size={14} />
            Each domain has its own trajectory. No single age score.
          </div>
        </section>
        <section className="card experiment-preview">
          <div className="row between">
            <span className="eyebrow">YOUR ACTIVE EXPERIMENT</span>
            <FlaskConical size={19} />
          </div>
          {experiments.length ? (
            <>
              <div className="experiment-illustration">
                <span />
                <FlaskConical size={40} />
                <i />
                <i />
              </div>
              <Badge tone="purple">{experiments[0].status}</Badge>
              <h2>{experiments[0].name}</h2>
              <p>A measured approach to discovering what works for you.</p>
              <div className="row between text-small">
                <strong>
                  Week{" "}
                  {Math.min(
                    experiments[0].planned_duration_weeks,
                    Math.max(
                      1,
                      Math.ceil(
                        (Date.now() -
                          new Date(experiments[0].start_date).getTime()) /
                          604800000,
                      ),
                    ),
                  )}{" "}
                  of {experiments[0].planned_duration_weeks}
                </strong>
                <span className="muted">
                  {experiments[0].adherence}% adherence
                </span>
              </div>
              <div className="progress-track">
                <span
                  style={{
                    width:
                      Math.min(
                        100,
                        ((Date.now() -
                          new Date(experiments[0].start_date).getTime()) /
                          (experiments[0].planned_duration_weeks * 604800000)) *
                          100,
                      ) + "%",
                  }}
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => go("interventions/active")}
              >
                View experiment <ArrowRight size={16} />
              </Button>
            </>
          ) : (
            <Empty
              title="Make your next step measurable"
              action={
                <Button variant="secondary" onClick={() => go("interventions")}>
                  Explore your options <ArrowRight size={16} />
                </Button>
              }
            >
              Turn a personal priority into a thoughtful experiment.
            </Empty>
          )}
        </section>
      </div>
      <section className="story-strip">
        <span className="story-icon">
          <Sparkles size={22} />
        </span>
        <div>
          <h3>Your biological story, connected.</h3>
          <p>{t.narrative}</p>
        </div>
        <button className="text-button" onClick={() => go("ai")}>
          Let’s explore <ArrowRight size={16} />
        </button>
      </section>
    </>
  );
}
