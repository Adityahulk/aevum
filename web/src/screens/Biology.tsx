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
  const selected =
    route.split("/")[1] || state.twin.priorities[0] || "metabolic";
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
        {state.twin.domains
          .filter((d: RecordData) => d.phenotype)
          .map((d: RecordData) => (
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
            <Badge tone="purple">An evidence-weighted interpretation</Badge>
            <h2>{d?.name}</h2>
          </div>
          <button className="text-button" onClick={() => go("ai/" + selected)}>
            <Sparkles size={15} />
            Explain this map
          </button>
        </div>
        {rels.length ? (
          <>
            <div className="graph-layers">
              <div className="graph-column">
                <span className="graph-label">01 · OBSERVED</span>
                {d.signals
                  .filter(
                    (s: RecordData) => s.abnormal || s.trend === "Worsening",
                  )
                  .slice(0, 3)
                  .map((s: RecordData) => (
                    <button
                      key={s.concept_id}
                      className="graph-node observation-node"
                      onClick={() =>
                        setNode({
                          title: s.label,
                          type: "Observed measurement",
                          text: `${s.current} ${s.unit}, measured ${date(s.latest_date)}. ${s.count} observations support the history.`,
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
                      title: d.phenotype,
                      type: "Phenotype inference",
                      text: `${d.state}, ${d.confidence.toLowerCase()} confidence. Multiple signals are interpreted together. This is not a diagnosis.`,
                    })
                  }
                >
                  <Layers size={22} />
                  <strong>{d.phenotype}</strong>
                  <Badge tone="purple">{d.confidence} confidence</Badge>
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
          <Empty title="No supported mapping yet">
            A biology map appears when sufficient data supports a phenotype. We
            don’t draw molecular conclusions from missing measurements.
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
