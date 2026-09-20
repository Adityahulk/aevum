import React, { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Database,
  Dna,
  Info,
  Layers,
  Sparkles,
  X,
} from "lucide-react";
import { date, RecordData } from "../api";
import { Badge, Button, Empty, SectionTitle } from "../components";
import { useApp } from "../context";
export function BiologyPage() {
  const { state, catalog, route, go, setModal } = useApp();
  const measuredDomains = state.twin.domains.filter(
    (domain: RecordData) => domain.signals.length > 0,
  );
  const requested = route.split("/")[1];
  const selected = measuredDomains.some((domain: RecordData) => domain.id === requested)
    ? requested
    : state.twin.priorities.find((id: string) =>
        measuredDomains.some((domain: RecordData) => domain.id === id),
      ) || measuredDomains[0]?.id || requested || "metabolic";
  const d = state.twin.domains.find((d: RecordData) => d.id === selected);
  const rels = state.twin.relationships.filter(
    (r: RecordData) => r.domain === selected,
  );
  const [node, setNode] = useState<RecordData | null>(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">FROM SIGNALS TO UNDERSTANDING</span>
          <h1>The biology behind your Twin</h1>
          <p>
            Follow the evidence. See what’s observed, and what’s still a
            hypothesis.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setModal({ type: "evidence" })}
        >
          <BookOpen size={16} />
          Evidence library
        </Button>
      </div>
      <div className="tabs scroll-tabs">
        {measuredDomains.map((d: RecordData) => (
            <button
              className={selected === d.id ? "active" : ""}
              key={d.id}
              onClick={() => {
                go("biology/" + d.id);
                setNode(null);
              }}
            >
              {d.name}
            </button>
          ))}
      </div>
      <section className="biology-map card">
        <div className="row between">
          <div>
            <Badge tone={d?.phenotype ? "purple" : "green"}>
              {d?.phenotype
                ? "An evidence-weighted interpretation"
                : "Measured domain · interpretation limited"}
            </Badge>
            <h2>{d?.name}</h2>
          </div>
          <button className="text-button" onClick={() => go("ai/" + selected)}>
            <Sparkles size={15} />
            Explain this map
          </button>
        </div>
        {d?.signals?.length ? (
          <>
            <div className="graph-layers">
              <div className="graph-column">
                <span className="graph-label">01 · OBSERVED</span>
                {[...d.signals]
                  .sort(
                    (a: RecordData, b: RecordData) =>
                      Number(b.abnormal) - Number(a.abnormal),
                  )
                  .slice(0, 5)
                  .map((s: RecordData) => (
                    <button
                      key={s.concept_id}
                      className="graph-node observation-node"
                      onClick={() =>
                        setNode({
                          title: s.label,
                          type: "Observed measurement",
                          text: `${s.current} ${s.unit}, measured ${date(s.latest_date)}. ${s.reference_status}. ${s.longitudinal_status}.`,
                          ...s,
                        })
                      }
                    >
                      <span>{s.label}</span>
                      <strong>
                        {s.current}
                        <small>{s.unit}</small>
                      </strong>
                      <span className="text-small muted">
                        Source measurement <ChevronRight size={13} />
                      </span>
                    </button>
                  ))}
              </div>
              <div className="graph-connector">
                <ArrowRight />
              </div>
              <div className="graph-column">
                <span className="graph-label">02 · PHENOTYPE</span>
                <button
                  className="graph-node phenotype-node"
                  onClick={() =>
                    setNode({
                      title: d.phenotype || "No concerning phenotype established",
                      type: "Phenotype inference",
                      text: d.phenotype
                        ? `${d.state}, ${d.confidence.toLowerCase()} confidence. Multiple signals are interpreted together. This is not a diagnosis.`
                        : `${d.state}. Current measurements do not establish a concerning domain phenotype. Repeat measurements are needed for trajectory.`,
                    })
                  }
                >
                  <Layers size={22} />
                  <strong>{d.phenotype || "No concerning phenotype established"}</strong>
                  <Badge tone={d.phenotype ? "purple" : "green"}>
                    {d.confidence} confidence
                  </Badge>
                </button>
              </div>
              <div className="graph-connector branching">
                <svg viewBox="0 0 50 240" preserveAspectRatio="none">
                  <path
                    d="M0 120 C30 120 20 55 48 55 M0 120 C30 120 20 185 48 185"
                    fill="none"
                    stroke="#c8ced5"
                    strokeDasharray="4 4"
                  />
                </svg>
              </div>
              <div className="graph-column">
                <span className="graph-label">03 · POSSIBLE PROCESSES</span>
                {rels.map((r: RecordData) => (
                  <button
                    className="graph-node process-node"
                    key={r.id}
                    onClick={() =>
                      setNode({
                        title: r.process,
                        type: "Biological interpretation",
                        text: r.limitations,
                        ...r,
                      })
                    }
                  >
                    <Badge tone={r.level === "Hypothesis" ? "amber" : "green"}>
                      {r.level}
                    </Badge>
                    <strong>{r.process}</strong>
                    <span className="text-small muted">
                      {r.confidence} confidence · {r.pathway}
                    </span>
                  </button>
                ))}
                {!rels.length && (
                  <div className="graph-node process-node graph-neutral-node">
                    <Badge>Not inferred</Badge>
                    <strong>No biological process inferred</strong>
                    <span className="text-small muted">
                      A single cross-sectional panel cannot establish an active mechanism.
                    </span>
                  </div>
                )}
              </div>
              <div className="graph-connector">
                <ArrowRight />
              </div>
              <div className="graph-column">
                <span className="graph-label">04 · AGING RELEVANCE</span>
                {rels.map((r: RecordData) => (
                  <button
                    key={r.id}
                    className="graph-node hallmark-node"
                    onClick={() =>
                      setNode({
                        title: catalog.hallmarks.find(
                          (h: RecordData) => h.id === r.hallmark_id,
                        )?.name,
                        type: "Aging framework",
                        text: "A recognized component of the Hallmarks framework. Its relevance here does not mean this hallmark has been directly measured.",
                        evidence_ids: r.evidence_ids,
                      })
                    }
                  >
                    <Dna size={22} />
                    <strong>
                      {
                        catalog.hallmarks.find(
                          (h: RecordData) => h.id === r.hallmark_id,
                        )?.name
                      }
                    </strong>
                    <span className="text-small muted">
                      Not directly measured
                    </span>
                  </button>
                ))}
                {!rels.length && (
                  <div className="graph-node hallmark-node graph-neutral-node">
                    <Dna size={22} />
                    <strong>No individual hallmark mapping</strong>
                    <span className="text-small muted">
                      The framework remains visible without claiming it was measured.
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="graph-legend">
              <span>
                <i className="solid-line" />
                Observed / inferred pattern
              </span>
              <span>
                <i className="dashed-line" />
                Possible biological relationship
              </span>
              <span>Click any node to explore</span>
            </div>
          </>
        ) : (
          <Empty title="No measured domain yet">
            Add validated measurements to build an evidence-linked biology map.
          </Empty>
        )}
      </section>
      {node && (
        <section className="card node-detail">
          <div className="row between">
            <span className="eyebrow">{node.type}</span>
            <button
              className="icon-button"
              aria-label="Close node details"
              onClick={() => setNode(null)}
            >
              <X size={18} />
            </button>
          </div>
          <h2>{node.title}</h2>
          <p>{node.text}</p>
          {node.evidence_ids && (
            <Button
              variant="secondary"
              onClick={() =>
                setModal({ type: "evidence", ids: node.evidence_ids })
              }
            >
              Inspect supporting evidence <BookOpen size={16} />
            </Button>
          )}
          {node.observation_ids && (
            <Button
              variant="secondary"
              onClick={() => go("data/" + node.concept_id)}
            >
              Inspect source measurements <Database size={16} />
            </Button>
          )}
        </section>
      )}
      <div className="info-note biology-note">
        <Info size={18} />
        <span>
          <strong>A map of possibilities, not a claim of cause.</strong>{" "}
          Observations, phenotypes and mechanisms are distinct. A plausible
          biological relationship does not establish that a pathway is active in
          you.
        </span>
      </div>
      <section className="section">
        <SectionTitle
          eyebrow="THE SCIENTIFIC FRAMEWORK"
          title="12 interconnected hallmarks"
        />
        <p className="section-intro">
          A broad framework for aging biology. Your Twin only maps signals where
          evidence supports an interpretation.
        </p>
        <div className="hallmark-grid">
          {catalog.hallmarks.map((h: RecordData, i: number) => {
            const related = state.twin.relationships.some(
              (r: RecordData) => r.hallmark_id === h.id,
            );
            return (
              <button
                key={h.id}
                className={"hallmark-card " + (related ? "mapped" : "")}
                onClick={() =>
                  setNode({
                    title: h.name,
                    type: h.group + " hallmark",
                    text: related
                      ? "This hallmark has an evidence-classified relationship to an observed phenotype. It is not directly measured."
                      : "This hallmark is in the ontology, but your current data does not support an individual mapping.",
                    evidence_ids: ["e-hallmarks"],
                  })
                }
              >
                <span className="hallmark-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{h.name}</h3>
                <small>
                  {h.group} ·{" "}
                  {related ? "Related interpretation" : "Not measured"}
                </small>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
