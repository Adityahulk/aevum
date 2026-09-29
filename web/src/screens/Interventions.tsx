import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FlaskConical,
  Info,
  ShieldCheck,
  Target,
  Upload,
  SlidersHorizontal,
} from "lucide-react";
import { api, post, date, RecordData, trackProductEvent } from "../api";
import { Badge, Button, Empty, Modal } from "../components";
import { useApp } from "../context";
import { CheckInSheet, ExperimentProgressCard, useIsMobile } from "../mobile";
export function InterventionsPage() {
  const { state, me, route, go, run, busy, setModal, catalog } = useApp();
  const mobile = useIsMobile();
  const [, segment, targetId] = route.split("/");
  const routedExperiment =
    segment === "experiment"
      ? state.experiments.find((e: RecordData) => e.id === targetId)
      : null;
  const tab =
    segment === "plan"
      ? "recommended"
      : segment === "experiment"
        ? routedExperiment &&
          ["Evaluated", "Stopped"].includes(routedExperiment.status)
          ? "history"
          : "active"
        : segment ||
          (mobile &&
          state.experiments.some(
            (e: RecordData) => !["Evaluated", "Stopped"].includes(e.status),
          )
            ? "active"
            : "recommended");
  const [selected, setSelected] = useState<RecordData | null>(() =>
      segment === "plan"
        ? state.recommendations.find((r: RecordData) => r.id === targetId) ||
          null
        : null,
    ),
    [experiment, setExperiment] = useState<RecordData | null>(
      () => routedExperiment || null,
    ),
    [checkIn, setCheckIn] = useState<RecordData | null>(null);
  useEffect(() => {
    setSelected(
      segment === "plan"
        ? state.recommendations.find((r: RecordData) => r.id === targetId) ||
            null
        : null,
    );
    setExperiment(
      segment === "experiment"
        ? state.experiments.find((e: RecordData) => e.id === targetId) || null
        : null,
    );
  }, [segment, targetId]);
  const active = state.experiments.filter(
    (e: RecordData) => !["Evaluated", "Stopped"].includes(e.status),
  );
  const history = state.experiments.filter((e: RecordData) =>
    ["Evaluated", "Stopped"].includes(e.status),
  );
  const prefs = me.profile.preferences || {};
  const suggestions = mobile
    ? state.recommendations.filter((r: RecordData) => !r.already_active)
    : state.recommendations;
  return (
    <div className={mobile ? "m-plan-page" : undefined}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {mobile
              ? "ONE CHANGE. MEASURABLE PROGRESS."
              : "PERSONALIZED. MEASURABLE. ADAPTABLE."}
          </span>
          <h1>{mobile ? "Your plan" : "Discover what works for you."}</h1>
          <p>
            {mobile
              ? "Choose a meaningful next step. Learn from your response."
              : "Thoughtful next steps, shaped by your biology and backed by evidence."}
          </p>
        </div>
        <Button variant="secondary" onClick={() => go("settings")}>
          <SlidersHorizontal size={16} />
          Your preferences
        </Button>
      </div>
      <div className="intervention-goal">
        <span className="goal-icon">
          <Target size={21} />
        </span>
        <div>
          <span className="eyebrow">OPTIMIZING FOR</span>
          <strong>{me.profile.goal}</strong>
        </div>
        <span className="goal-secondary">
          {me.profile.secondary_goal || "Your priorities, your direction."}
        </span>
        <button className="text-button" onClick={() => go("settings")}>
          Adjust goal <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="tabs">
        <button
          className={tab === "recommended" ? "active" : ""}
          onClick={() => go("interventions/recommended")}
        >
          {mobile ? "Suggested" : "Recommended"}{" "}
          <span>{suggestions.length}</span>
        </button>
        <button
          className={tab === "active" ? "active" : ""}
          onClick={() => go("interventions/active")}
        >
          {mobile ? "Active" : "Active experiments"}{" "}
          <span>{active.length}</span>
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => go("interventions/history")}
        >
          History <span>{history.length}</span>
        </button>
      </div>
      {tab === "recommended" ? (
        <>
          <details
            className="recommendation-controls"
            open={mobile ? undefined : true}
          >
            <summary>Evidence preferences</summary>
            <p>
              Ranked by evidence, personal relevance, safety and measurability.
            </p>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={prefs.strong_only || false}
                onChange={(e) =>
                  run(() =>
                    post("/profile", {
                      preferences: { ...prefs, strong_only: e.target.checked },
                    }),
                  )
                }
              />
              Strong human evidence only
            </label>
          </details>
          {(() => {
            const cards = suggestions.map((r: RecordData, i: number) => (
              <article
                className={
                  "card recommendation " + (i === 0 ? "top-recommendation" : "")
                }
                key={r.id}
              >
                {!mobile && (
                  <div className="recommendation-rank">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                )}
                <div className="recommendation-main">
                  <div className="row wrap">
                    <span className="eyebrow">{r.category}</span>
                    {mobile && (
                      <Badge
                        tone={
                          r.recommendation_basis === "Measured priority"
                            ? "green"
                            : "purple"
                        }
                      >
                        {r.recommendation_basis || "General option"}
                      </Badge>
                    )}
                    {!mobile &&
                      i === 0 &&
                      r.recommendation_basis === "Measured priority" && (
                        <Badge tone="green">Highest personal relevance</Badge>
                      )}
                    {r.already_active && (
                      <Badge tone="purple">Already active</Badge>
                    )}
                    {r.review_required && (
                      <Badge tone="amber">Professional review</Badge>
                    )}
                    {r.blocked_reasons.length > 0 && (
                      <Badge tone="red">Not eligible</Badge>
                    )}
                  </div>
                  <h2>{r.name}</h2>
                  <p>{r.expected_effect}</p>
                  {mobile && (
                    <p className="m-plan-reason">{r.personal_reason}</p>
                  )}
                  <div className="recommendation-meta">
                    <span>
                      <ShieldCheck size={15} />
                      {r.level} evidence
                    </span>
                    {!mobile && (
                      <span>
                        <Target size={15} />
                        {r.personal_relevance} relevance
                      </span>
                    )}
                    <span>
                      <Clock size={15} />
                      {r.weeks} weeks
                    </span>
                  </div>
                  {mobile && (
                    <div className="m-plan-measure">
                      <span>Track your response</span>
                      <strong>
                        {r.targets
                          .map(
                            (c: string) =>
                              catalog.concepts.find(
                                (x: RecordData) => x.id === c,
                              )?.name || c,
                          )
                          .join(" · ")}
                      </strong>
                    </div>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setSelected(r)}
                  >
                    {mobile ? "Why this option" : `Why this ranked #${i + 1}`}{" "}
                    <ChevronRight size={15} />
                  </button>
                </div>
                <div className="recommendation-action">
                  <Button
                    variant={i === 0 ? "" : "secondary"}
                    onClick={() =>
                      r.already_active
                        ? go("interventions/active")
                        : setSelected(r)
                    }
                  >
                    {mobile
                      ? r.already_active
                        ? "View active plan"
                        : r.blocked_reasons.length
                          ? "Review considerations"
                          : r.review_required
                            ? "Review with your clinician"
                            : r.eligible
                              ? "Review and start"
                              : "Add starting measurement"
                      : "Explore plan"}{" "}
                    <ArrowUpRight size={16} />
                  </Button>
                  {!mobile && (
                    <span>
                      {r.already_active
                        ? "Running now as your active experiment."
                        : r.eligible
                          ? "Let’s test this, thoughtfully."
                          : r.blocked_reasons.length
                            ? "Resolve safety considerations"
                            : r.review_required
                              ? "Review before starting"
                              : "Add baseline measurements"}
                    </span>
                  )}
                </div>
              </article>
            ));
            return (
              <>
                <div className="recommendation-list">
                  {mobile ? cards.slice(0, 1) : cards}
                </div>
                {mobile && cards.length > 1 && (
                  <details className="m-alternative-options">
                    <summary>Explore {cards.length - 1} other options</summary>
                    <div className="recommendation-list">{cards.slice(1)}</div>
                  </details>
                )}
              </>
            );
          })()}
          {!suggestions.length && (
            <Empty title="No options match your filters">
              Adjust your evidence and supplement preferences, or add more data.
            </Empty>
          )}
          {!mobile && (
            <section className="knowledge-strip">
              <BookOpen size={22} />
              <div>
                <h3>A place for emerging science, too.</h3>
                <p>
                  Senolytics and other investigational gerotherapeutics are
                  research knowledge only. They are excluded from self-directed
                  experiments.
                </p>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  setModal({ type: "evidence", ids: ["e-hallmarks"] })
                }
              >
                Explore the framework <ArrowUpRight size={15} />
              </button>
            </section>
          )}
        </>
      ) : (
        <div className="experiment-grid">
          {(tab === "active" ? active : history).map((e: RecordData) =>
            mobile && tab === "active" ? (
              <ExperimentProgressCard
                key={e.id}
                e={e}
                onCheckIn={() => setCheckIn(e)}
                onOpen={() => setExperiment(e)}
                onEvaluated={setExperiment}
              />
            ) : (
              <article className="card experiment-card" key={e.id}>
                <div className="row between">
                  <span className="domain-icon">
                    <FlaskConical size={22} />
                  </span>
                  <Badge
                    tone={
                      e.response?.outcome === "Favorable" ? "green" : "purple"
                    }
                  >
                    {e.response?.outcome || e.status}
                  </Badge>
                </div>
                <h2>{e.name}</h2>
                <p>
                  {e.planned_duration_weeks}-week experiment · Started{" "}
                  {date(e.start_date)}
                </p>
                <div className="row between text-small">
                  <span>Reported adherence</span>
                  <strong>{e.adherence}%</strong>
                </div>
                <div className="progress-track">
                  <span style={{ width: e.adherence + "%" }} />
                </div>
                <div className="experiment-targets">
                  {Object.keys(e.baseline).map((c: string) => (
                    <span key={c}>
                      {c.replace("VO2MAX", "VO₂ max")}
                      <strong>{e.baseline[c].value}</strong>
                      <small>baseline</small>
                    </span>
                  ))}
                </div>
                {e.response && (
                  <p className="response-summary">
                    {e.response.interpretation}
                  </p>
                )}
                <Button variant="secondary" onClick={() => setExperiment(e)}>
                  {e.response ? "Review response" : "Open experiment"}
                  <ArrowRight size={16} />
                </Button>
              </article>
            ),
          )}
          {!(tab === "active" ? active : history).length && (
            <Empty
              title={
                tab === "active"
                  ? "Your next experiment awaits."
                  : "Your learning history starts here."
              }
              action={
                <Button
                  variant="secondary"
                  onClick={() => go("interventions/recommended")}
                >
                  Explore recommendations
                </Button>
              }
            >
              {tab === "active"
                ? "Choose a recommendation, define a protocol and freeze your baseline."
                : "Evaluated experiments will stay here, so every outcome teaches you something."}
            </Empty>
          )}
        </div>
      )}
      {selected && (
        <Modal title={selected.name} wide onClose={() => setSelected(null)}>
          <div className="row wrap">
            <Badge tone="purple">{selected.category}</Badge>
            <Badge tone="green">{selected.level} evidence</Badge>
            <Badge>{selected.weeks}-week measurement window</Badge>
          </div>
          {mobile && <p className="modal-intro">{selected.personal_reason}</p>}
          <h3>Why this is relevant to you</h3>
          <ul className="check-list">
            {selected.why.map((w: string) => (
              <li key={w}>
                <CheckCircle2 size={16} />
                {w}
              </li>
            ))}
          </ul>
          <div className="two-columns">
            <div className="inset-card">
              <span className="eyebrow">WHAT WE’LL MEASURE</span>
              <h3>{selected.targets.join(" · ")}</h3>
              <p>{selected.measurement_plan.success_criteria}</p>
            </div>
            <div className="inset-card">
              <span className="eyebrow">SAFETY & CONSIDERATIONS</span>
              <p>{selected.risk}</p>
              {selected.interaction_flags.length > 0 && (
                <p>
                  Potential interactions:{" "}
                  {selected.interaction_flags.join(", ")}
                </p>
              )}
            </div>
          </div>
          {mobile && selected.implementation_options?.length > 0 && (
            <section className="m-plan-steps">
              <h3>What you’ll do</h3>
              <ul>
                {selected.implementation_options.map((step: string) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </section>
          )}
          {mobile &&
            !selected.eligible &&
            !selected.already_active &&
            !selected.review_required &&
            !selected.blocked_reasons.length && (
              <div className="info-note">
                <div>
                  <strong>Add a starting measurement</strong>
                  <p>
                    Use a recent{" "}
                    {selected.targets
                      .map(
                        (c: string) =>
                          catalog.concepts.find((x: RecordData) => x.id === c)
                            ?.name || c,
                      )
                      .join(", ")}{" "}
                    measurement to track your response.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelected(null);
                      go("data");
                    }}
                  >
                    Add or review measurements <ArrowRight size={16} />
                  </Button>
                </div>
              </div>
            )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const result = await run(
                () =>
                  post("/experiments", {
                    intervention_id: selected.id,
                    protocol: form.get("protocol"),
                  }),
                "Your experiment has started. Baseline saved.",
              );
              if (result) {
                void trackProductEvent("experiment_started");
                setSelected(null);
                go("interventions/active");
              }
            }}
          >
            <label>
              Your planned protocol
              <textarea
                name="protocol"
                defaultValue={selected.protocol}
                required
                minLength={10}
                rows={4}
              />
            </label>
            <div className="info-note">
              <Info size={16} />
              <span>
                Your baseline and success criteria are saved at the start.
                Follow-up measurements must be comparable and fall within the
                measurement window.
              </span>
            </div>
            <div className="row between">
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setModal({ type: "evidence", ids: selected.evidence_ids })
                }
              >
                Read the evidence <BookOpen size={15} />
              </button>
              <Button type="submit" disabled={!selected.eligible || busy}>
                {selected.already_active
                  ? "Already active — review progress"
                  : selected.eligible
                    ? "Start this experiment"
                    : selected.review_required
                      ? "Professional review required"
                      : "Baseline or safety review needed"}
                <ArrowRight size={16} />
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {experiment && (
        <ExperimentModal
          experiment={
            state.experiments.find((e: RecordData) => e.id === experiment.id) ||
            experiment
          }
          onClose={() => setExperiment(null)}
        />
      )}
      {checkIn && (
        <CheckInSheet
          e={
            state.experiments.find((e: RecordData) => e.id === checkIn.id) ||
            checkIn
          }
          onClose={() => setCheckIn(null)}
        />
      )}
    </div>
  );
}

export function ExperimentModal({
  experiment: e,
  onClose,
}: {
  experiment: RecordData;
  onClose: () => void;
}) {
  const { run, busy, setModal, go } = useApp();
  return (
    <Modal title={e.name} wide onClose={onClose}>
      <div className="row wrap">
        <Badge tone="purple">{e.status}</Badge>
        <span className="muted">Evaluation date · {date(e.due_date)}</span>
      </div>
      <p className="modal-intro">{e.protocol}</p>
      {!["Stopped", "Evaluated"].includes(e.status) && (
        <p className="text-small">
          Follow-up measurements are reviewed against your saved starting point.{" "}
          <button
            className="text-button"
            onClick={() => {
              onClose();
              go("data");
            }}
          >
            Add follow-up data <Upload size={15} />
          </button>
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Target</th>
              <th>Frozen baseline</th>
              <th>Prior trend</th>
              <th>Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(e.baseline).map(([k, v]: [string, any]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v.value}</td>
                <td>{v.prior_trend}</td>
                <td>
                  {e.response?.changes?.find(
                    (c: RecordData) => c.concept_id === k,
                  )?.follow_up ?? "Awaiting evaluation"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-small muted">
        Success criteria: at least {e.success_threshold_pct}% favorable change
        beyond recorded baseline variation. This threshold is a research
        heuristic.
      </p>
      {!["Evaluated", "Stopped"].includes(e.status) && (
        <form
          onSubmit={(e2) => {
            e2.preventDefault();
            const f = Object.fromEntries(new FormData(e2.currentTarget));
            run(
              () =>
                api("/experiments/" + e.id, {
                  method: "PATCH",
                  body: JSON.stringify(f),
                }),
              "Check-in saved",
            );
          }}
        >
          <h3>How has the experiment been going?</h3>
          <label>
            Adherence (%)
            <input
              type="number"
              min="0"
              max="100"
              name="adherence"
              defaultValue={e.adherence}
              required
            />
          </label>
          <label>
            Adverse effects or new symptoms
            <textarea
              name="adverse_effects"
              defaultValue={e.adverse_effects}
              placeholder="Record anything unexpected. Leave blank if none."
            />
          </label>
          <label>
            Other changes during this period
            <textarea
              name="concurrent_changes"
              defaultValue={e.concurrent_changes}
              placeholder="Medication changes, illness, travel or another intervention"
            />
          </label>
          <div className="row between">
            <Button type="submit" disabled={busy} variant="secondary">
              Save check-in <Check size={16} />
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const result = await run(
                  () => post("/experiments/" + e.id + "/evaluate"),
                  "Response evaluated; your Twin has been updated",
                );
                if (result) void trackProductEvent("follow_up_completed");
              }}
            >
              Evaluate response <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
      {e.response && (
        <section
          className={
            "response-panel " +
            (e.response.outcome === "Favorable" ? "favorable" : "")
          }
        >
          <span className="eyebrow">DID IT WORK?</span>
          <h2>{e.response.outcome}</h2>
          <Badge>{e.response.confidence} confidence</Badge>
          <p>{e.response.interpretation}</p>
          {e.response.outcome === "Inconclusive" && (
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                go("data");
              }}
            >
              Review or add follow-up data <ArrowRight size={16} />
            </Button>
          )}
          <div className="response-changes">
            {e.response.changes.map((c: RecordData) => (
              <div key={c.concept_id}>
                <strong>{c.label}</strong>
                <span>
                  {c.baseline} → {c.follow_up}
                </span>
                <Badge tone={c.favorable_change_pct > 0 ? "green" : "amber"}>
                  {c.change_pct > 0 ? "+" : ""}
                  {c.change_pct}%
                </Badge>
              </div>
            ))}
          </div>
          {e.response.confounders.map((c: string) => (
            <p key={c} className="text-small">
              {c}
            </p>
          ))}
          <form
            onSubmit={(e2) => {
              e2.preventDefault();
              run(
                () =>
                  api("/experiments/" + e.id, {
                    method: "PATCH",
                    body: JSON.stringify(
                      Object.fromEntries(new FormData(e2.currentTarget)),
                    ),
                  }),
                "Decision saved",
              );
            }}
          >
            <label>
              What happens next?
              <select name="decision" defaultValue={e.decision || "Continue"}>
                <option>Continue</option>
                <option>Modify</option>
                <option>Stop</option>
              </select>
            </label>
            <label>
              Decision notes
              <input
                name="decision_note"
                defaultValue={e.decision_note || ""}
                placeholder="For modifications, describe the next plan"
              />
            </label>
            <Button type="submit" variant="secondary" disabled={busy}>
              Save decision <Check size={16} />
            </Button>
          </form>
        </section>
      )}
      <button
        className="text-button"
        onClick={() => setModal({ type: "upload" })}
      >
        Add follow-up measurements <Upload size={15} />
      </button>
    </Modal>
  );
}
