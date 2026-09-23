import React from "react";
import { RecordData, date } from "./api";
import { useApp } from "./context";
import { Badge } from "./components";

export function DomainEvidence({ domain: d }: { domain: RecordData }) {
  const { go } = useApp();
  const context = d.context_signals || [];
  const lifestyle = d.lifestyle_context || [];
  const genes = d.genomic_context || [];
  const genomic = d.genomic_status || {};
  return <section className="card domain-evidence">
    <h2>Your data in this domain</h2>
    <p className="muted">Direct measurements establish the domain picture. Supporting lab results, reported habits and DNA add context.</p>
    <div className="domain-evidence-grid">
      <div><h3>Direct measurements</h3>
        <p>{d.signals.length} measured signals · {d.available_group_count ?? d.available_marker_count} of {d.configured_group_count ?? d.configured_marker_count} core groups available</p>
        {(d.coverage_groups || []).map((group: RecordData) => <div className="evidence-group" key={group.name}>
          <strong>{group.name}</strong><Badge tone={group.covered ? "green" : "amber"}>{group.covered ? "Available" : "Missing / outdated"}</Badge>
          <small>{group.expected.join(" / ")}</small>
        </div>)}
        {d.signals.length > 0 && <details><summary>View all {d.signals.length} measured signals</summary>
          {d.signals.map((s: RecordData) => <div className="evidence-group" key={s.concept_id}>
            <button className="text-button" onClick={() => go("data/" + s.concept_id)}>{s.label}: {s.current} {s.unit}</button>
            <small>{date(s.latest_date)} · {s.source}{s.device_name ? ` · ${s.device_name}` : ""}{s.measurement_method ? ` · ${s.measurement_method}` : ""}{s.stale ? " · Outdated" : ""}</small>
          </div>)}
        </details>}
        <small className="muted">Related tests share one group. This describes data coverage, not health or certainty.</small>
      </div>
      <div><h3>Supporting lab context</h3>
        {!context.length && <p className="muted">No mapped supporting lab results available.</p>}
        {context.map((s: RecordData) => <div className="evidence-group" key={s.concept_id}>
          <button className="text-button" onClick={() => go("data/" + s.concept_id)}>{s.label}: {s.current} {s.unit}</button>
          <small>{date(s.latest_date)} · {s.reference_status}{s.stale ? " · Outdated" : ""}</small>
          <small>{s.context_reason}</small>
          {s.citation && <a href={s.citation} target="_blank" rel="noreferrer">Supporting reference</a>}
        </div>)}
      </div>
      <div><h3>Lifestyle & reported context</h3>
        {!lifestyle.length && <p className="muted">No relevant questionnaire answers available.</p>}
        {lifestyle.length > 0 && <details><summary>{lifestyle.length} relevant answers · view source context</summary>
          {lifestyle.map((fact: RecordData, i: number) => <div className="evidence-group" key={i}>
            <strong>{fact.label}</strong><span>{typeof fact.value === "object" ? JSON.stringify(fact.value) : String(fact.value)}</span>
            <small>{fact.source} · {fact.date ? date(fact.date) : "Date not recorded"} · Self-reported</small>
          </div>)}
        </details>}
        <small className="muted">Historical answers retain their original date and do not count as current device or lab measurements.</small>
      </div>
      <div><h3>DNA context</h3>
        {genes.map((g: RecordData, i: number) => <div className="evidence-group" key={g.id || i}>
          <strong>{g.gene} · {g.rsid}</strong><span>{g.interpretation}</span>
          <small>{g.confidence} confidence · Medication context · Clinical confirmation required</small>
          {g.citation && <a href={g.citation} target="_blank" rel="noreferrer">Supporting reference</a>}
        </div>)}
        {!genes.length && <p className="muted">{!genomic.enabled ? "Genomic processing is not enabled." : genomic.sample_count ? "DNA is imported; no supported finding is mapped to this domain." : "No confirmed DNA import available."}</p>}
        <small className="muted">Current interpretation covers a curated SLCO1B1 medication locus only. DNA does not fill measurement gaps or establish current biological state.</small>
      </div>
    </div>
  </section>;
}
