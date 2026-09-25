import React, { useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Layers,
  Plus,
  Sparkles,
} from "lucide-react";
import { api, post, date, shortDate, RecordData } from "../api";
import {
  Badge,
  Trend,
  Button,
  Empty,
  SectionTitle,
  HistoryChart,
} from "../components";
import { useApp } from "../context";
import { DomainEvidence } from "../DomainEvidence";
import { domainIcons } from "../config";
import { PathwayStory, useIsMobile } from "../mobile";
export function TwinPage() {
  const { state, route, go, setModal, run, busy } = useApp();
  const [historical, setHistorical] = useState<any>(null);
  const t = historical || state.twin;
  const id = route.split("/")[1],
    d = t.domains.find((x: RecordData) => x.id === id);
  if (d) return <DomainDetail d={d} twin={t} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LIVING MODEL OF YOU</span>
          <h1>Your Biological Twin</h1>
          <p>A whole-person view. Every domain, its own story.</p>
        </div>
        <div className="row">
          <select
            aria-label="Twin version"
            value={historical?.id || ""}
            onChange={async (e) => {
              try {
                setHistorical(
                  e.target.value ? await api("/twins/" + e.target.value) : null,
                );
              } catch {}
            }}
          >
            <option value="">Current · v{state.twin.version}</option>
            {[...state.versions].reverse().map((v: RecordData) => (
              <option key={v.id} value={v.id}>
                v{v.version} · {shortDate(v.generated_at)}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(() => post("/recompute"), "Your Twin has been refreshed")
            }
          >
            Refresh <Activity size={16} />
          </Button>
        </div>
      </div>
      <div className="twin-summary card">
        <div>
          <span className="eyebrow">OVERALL TRAJECTORY</span>
          <h2>
            <Activity size={25} />
            {t.overall_trajectory}
          </h2>
        </div>
        <div>
          <span className="eyebrow">VERIFIED MEASUREMENTS</span>
          <strong>{t.observation_count}</strong>
        </div>
        <div>
          <span className="eyebrow">CORE DOMAIN COVERAGE</span>
          <strong>
            {t.coverage}
            <small>%</small>
          </strong>
        </div>
        <div>
          <span className="eyebrow">MODEL VERSION</span>
          <strong className="version-text">v{t.version}</strong>
          <small>{date(t.generated_at)}</small>
        </div>
      </div>
      <div className="twin-domain-grid">
        {t.domains.map((d: RecordData) => {
          const Icon = domainIcons[d.id];
          return (
            <button
              className={
                "card twin-domain " + (!d.coverage ? "unmeasured" : "")
              }
              key={d.id}
              onClick={() => go("twin/" + d.id)}
            >
              <div className="row between">
                <span className={"domain-icon domain-" + d.id}>
                  <Icon size={21} />
                </span>
                <ArrowUpRight size={18} />
              </div>
              <h2>{d.name}</h2>
              <p>{d.subtitle}</p>
              <div className="row between">
                <strong>{d.state}</strong>
                <Trend trend={d.trend} />
              </div>
              <div className="coverage">
                <div>
                  <span>Measurement coverage</span>
                  <span>
                    {d.available_group_count ?? d.available_marker_count} of {d.configured_group_count ?? d.configured_marker_count} groups
                  </span>
                </div>
                <div
                  className="progress-track"
                  title="Availability of configured markers, not a health score"
                >
                  <span style={{ width: d.coverage + "%" }} />
                </div>
                <small className="coverage-note">Core measurement groups · not a health score</small>
              </div>
              <div className="row between text-small muted">
                <span>{d.confidence} confidence</span>
                <span>{d.signals.length} direct · {d.context_count || 0} context</span>
              </div>
            </button>
          );
        })}
      </div>
      <section className="card timeline-section">
        <SectionTitle
          eyebrow="YOUR LONGITUDINAL RECORD"
          title="A story that keeps evolving"
        />
        <div className="timeline">
          {[...state.versions]
            .reverse()
            .slice(0, 12)
            .map((v: RecordData) => (
              <button
                key={v.id}
                onClick={async () => setHistorical(await api("/twins/" + v.id))}
              >
                <span className="timeline-dot" />
                <time>{date(v.generated_at)}</time>
                <div>
                  <strong>{v.reason}</strong>
                  <p>
                    Twin v{v.version} · {v.overall_trajectory}
                  </p>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
        </div>
      </section>
    </>
  );
}

export function DomainDetail({ d, twin }: { d: RecordData; twin: RecordData }) {
  const { go, setModal, state } = useApp();
  const mobile = useIsMobile();
  const Icon = domainIcons[d.id];
  const [signal, setSignal] = useState(d.signals[0]?.concept_id || "");
  const selected = d.signals.find((s: RecordData) => s.concept_id === signal);
  return (
    <>
      <button
        className="text-button subtle back-link"
        onClick={() => go("twin")}
      >
        ← Back to My Twin
      </button>
      <div className="page-heading">
        <div>
          <div className="row">
            <span className={"domain-icon domain-" + d.id}>
              <Icon size={22} />
            </span>
            <span className="eyebrow">YOUR BIOLOGICAL TWIN · DOMAIN</span>
          </div>
          <h1>{d.name}</h1>
          <p>{d.subtitle}</p>
        </div>
        <Button variant="secondary" onClick={() => go("ai/" + d.id)}>
          <Sparkles size={16} />
          Ask why
        </Button>
      </div>
      {mobile && twin === state.twin && <PathwayStory d={d} />}
      <div className="domain-metrics card">
        {[
          ["Current state", d.state],
          ["Trajectory", d.trend],
          ["Confidence", d.confidence],
          [
            "Measurement coverage",
            `${d.available_group_count ?? d.available_marker_count} of ${d.configured_group_count ?? d.configured_marker_count} groups`,
          ],
        ].map(([l, v]) => (
          <div key={l}>
            <span className="eyebrow">{l}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <DomainEvidence domain={d} />
      {!d.signals.length ? (
        <Empty
          title="We don’t have the full picture yet"
          action={
            <Button onClick={() => setModal({ type: "upload" })}>
              Add health data <Plus size={16} />
            </Button>
          }
        >
          This domain remains unmeasured until sufficient validated data is
          available. Missing data is not interpreted as healthy or unhealthy.
        </Empty>
      ) : (
        <>
          <section className="card chart-panel">
            <SectionTitle
              title="Your trajectory"
              action={
                <select
                  aria-label="Select biomarker"
                  value={signal}
                  onChange={(e) => setSignal(e.target.value)}
                >
                  {d.signals.map((s: RecordData) => (
                    <option key={s.concept_id} value={s.concept_id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              }
            />
            {selected && (
              <div className="chart-current">
                <strong>
                  {selected.current}
                  <small>{selected.unit}</small>
                </strong>
                <div className="signal-status-stack">
                  <Badge tone={selected.abnormal ? "amber" : "green"}>
                    {selected.reference_status}
                  </Badge>
                  <span className="muted">
                    Longitudinal trend: {selected.trend}. {selected.longitudinal_status}.
                  </span>
                </div>
              </div>
            )}
            <HistoryChart signals={selected ? [selected] : d.signals} large />
          </section>
          <section className="card evidence-table-panel">
            <SectionTitle title="What supports this" />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Measurement</th>
                    <th>Current</th>
                    <th>Personal baseline</th>
                    <th>Change</th>
                    <th>Measured</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {d.signals.map((s: RecordData) => (
                    <tr key={s.concept_id}>
                      <td>
                        <strong>{s.label}</strong>
                        {s.stale && <Badge tone="amber">Stale</Badge>}
                      </td>
                      <td>
                        {s.current} <span className="muted">{s.unit}</span>
                      </td>
                      <td>{s.baseline ?? "—"}</td>
                      <td>
                        {s.personal_change_pct != null
                          ? `${s.personal_change_pct > 0 ? "+" : ""}${s.personal_change_pct}%`
                          : "—"}
                      </td>
                      <td>{shortDate(s.latest_date)}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => go("data/" + s.concept_id)}
                        >
                          View data <ArrowUpRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="two-columns">
            <section className="card interpretation-card">
              <span className="eyebrow">WHAT THE PATTERN SUGGESTS</span>
              <h2>{d.phenotype || "Your current pattern"}</h2>
              <p>
                {d.state}.{" "}
                {d.persistence_days > 0
                  ? `An abnormal measurement pattern has persisted for up to ${d.persistence_days} days.`
                  : "Persistence is not established from the current data."}
              </p>
              <dl>
                <div>
                  <dt>Cross-signal agreement</dt>
                  <dd>
                    {Math.round(d.concordance * 100)}% of available signals
                  </dd>
                </div>
                <div>
                  <dt>Functional relevance</dt>
                  <dd>{d.functional_relevance}</dd>
                </div>
              </dl>
              <Button variant="secondary" onClick={() => go("biology/" + d.id)}>
                Explore the biology <Layers size={16} />
              </Button>
            </section>
            <section className="card interpretation-card">
              <span className="eyebrow">WHAT REMAINS UNCERTAIN</span>
              <h2>Context matters.</h2>
              {d.context_limitations.map((l: string) => (
                <p key={l}>{l}</p>
              ))}
              <p>{d.clinical_significance}.</p>
              <Button variant="secondary" onClick={() => go("interventions")}>
                Explore measurable next steps <ArrowRight size={16} />
              </Button>
            </section>
          </div>
        </>
      )}
    </>
  );
}
