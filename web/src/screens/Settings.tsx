import React, { useState, useEffect } from "react";
import { Check, Download, LogOut, Plus, ShieldCheck, X } from "lucide-react";
import { api, post, date, RecordData } from "../api";
import { Button, SectionTitle, Modal } from "../components";
import { useApp } from "../context";
import { goals } from "../config";
export function SettingsPage() {
  const { me, state, run, busy, setError, refresh } = useApp();
  const [tab, setTab] = useState("Your context"),
    [family, setFamily] = useState<RecordData[]>(
      me.profile.family_history || [],
    ),
    [deleteOpen, setDeleteOpen] = useState(false),
    [audit, setAudit] = useState<RecordData[]>([]);
  useEffect(() => {
    if (tab === "Privacy & data")
      api("/audit")
        .then(setAudit)
        .catch(() => {});
  }, [tab, me]);
  const p = me.profile;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">BUILT AROUND YOU</span>
          <h1>Your preferences. Your control.</h1>
          <p>
            Keep your context current and choose how your information is used.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            await post("/logout");
            location.reload();
          }}
        >
          <LogOut size={16} />
          Sign out
        </Button>
      </div>
      <div className="tabs">
        {["Your context", "Goals & preferences", "Privacy & data"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Your context" && (
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            run(
              () => post("/profile", { ...data, family_history: family }),
              "Your personal context has been updated",
            );
          }}
        >
          <section className="card settings-section">
            <SectionTitle title="Personal & medical context" />
            <div className="form-grid">
              <label>
                Name
                <input
                  name="name"
                  defaultValue={p.name}
                  required
                  maxLength={80}
                />
              </label>
              <label>
                Age
                <input
                  type="number"
                  name="age"
                  defaultValue={p.age}
                  min="18"
                  max="120"
                  required
                />
              </label>
              <label>
                Sex for clinical context
                <select name="sex" defaultValue={p.sex}>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Intersex</option>
                  <option>Prefer not to say</option>
                </select>
              </label>
              <label>
                Medical conditions
                <input
                  name="conditions"
                  defaultValue={p.conditions}
                  placeholder="Known conditions, if any"
                />
              </label>
              <label>
                Medications
                <input name="medications" defaultValue={p.medications} />
              </label>
              <label>
                Allergies
                <input name="allergies" defaultValue={p.allergies} />
              </label>
              <label>
                Symptoms
                <input name="symptoms" defaultValue={p.symptoms} />
              </label>
              <label>
                Major procedures / history
                <input name="procedures" defaultValue={p.procedures} />
              </label>
            </div>
          </section>
          <section className="card settings-section">
            <SectionTitle title="Lifestyle, as it is today" />
            <div className="form-grid">
              <label>
                Exercise sessions per week
                <input
                  name="exercise_frequency"
                  type="number"
                  min="0"
                  max="28"
                  defaultValue={p.exercise_frequency}
                />
              </label>
              <label>
                Exercise type
                <input name="exercise_type" defaultValue={p.exercise_type} />
              </label>
              <label>
                Typical sleep duration (hours)
                <input
                  name="sleep_duration"
                  type="number"
                  step=".1"
                  min="0"
                  max="24"
                  defaultValue={p.sleep_duration}
                />
              </label>
              <label>
                Typical sleep schedule
                <input name="sleep_schedule" defaultValue={p.sleep_schedule} />
              </label>
              <label>
                Dietary pattern
                <input name="diet" defaultValue={p.diet} />
              </label>
              <label>
                Alcohol use
                <input name="alcohol" defaultValue={p.alcohol} />
              </label>
              <label>
                Smoking
                <select
                  name="smoking"
                  defaultValue={p.smoking || "Not provided"}
                >
                  <option>Not provided</option>
                  <option>Never</option>
                  <option>Former</option>
                  <option>Current</option>
                </select>
              </label>
              <label>
                Stress
                <select name="stress" defaultValue={p.stress || "Not provided"}>
                  <option>Not provided</option>
                  <option>Low</option>
                  <option>Moderate</option>
                  <option>High</option>
                </select>
              </label>
              <label>
                Supplements
                <input name="supplements" defaultValue={p.supplements} />
              </label>
              <label>
                Occupation / activity profile
                <input name="occupation" defaultValue={p.occupation} />
              </label>
              <label>
                Relevant exposures
                <input name="exposures" defaultValue={p.exposures} />
              </label>
            </div>
          </section>
          <section className="card settings-section">
            <SectionTitle
              title="Family history"
              action={
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setFamily((fs) => [
                      ...fs,
                      {
                        relation: "Parent",
                        condition: "",
                        onset_age: "",
                        confidence: "Reported",
                      },
                    ])
                  }
                >
                  <Plus size={15} />
                  Add family member
                </button>
              }
            />
            {family.map((f, i) => (
              <div className="family-edit" key={i}>
                <label>
                  Relationship
                  <select
                    value={f.relation}
                    onChange={(e) =>
                      setFamily((fs) =>
                        fs.map((x, j) =>
                          i === j ? { ...x, relation: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    {[
                      "Parent",
                      "Mother",
                      "Father",
                      "Sibling",
                      "Grandparent",
                    ].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Condition
                  <input
                    required
                    value={f.condition}
                    onChange={(e) =>
                      setFamily((fs) =>
                        fs.map((x, j) =>
                          i === j ? { ...x, condition: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Age of onset
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={f.onset_age}
                    onChange={(e) =>
                      setFamily((fs) =>
                        fs.map((x, j) =>
                          i === j ? { ...x, onset_age: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Certainty
                  <select
                    value={f.confidence}
                    onChange={(e) =>
                      setFamily((fs) =>
                        fs.map((x, j) =>
                          i === j ? { ...x, confidence: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    <option>Reported</option>
                    <option>Confirmed</option>
                    <option>Uncertain</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remove family history"
                  onClick={() =>
                    setFamily((fs) => fs.filter((_, j) => i !== j))
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <p className="text-small muted">
              Unknown details can stay empty. Family history is monitoring
              context, not a diagnosis.
            </p>
          </section>
          <Button type="submit" disabled={busy || !me.consents.health}>
            Save personal context <Check size={16} />
          </Button>
        </form>
      )}
      {tab === "Goals & preferences" && (
        <form
          className="card settings-section"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                post("/profile", {
                  goal: f.get("goal"),
                  secondary_goal: f.get("secondary_goal"),
                  preferences: {
                    supplements: f.get("supplements") === "on",
                    strong_only: f.get("strong_only") === "on",
                  },
                }),
              "Your priorities have been updated",
            );
          }}
        >
          <SectionTitle title="Choose your direction" />
          <p>
            Your objective changes intervention priorities. It does not change
            the underlying measurements or domain states.
          </p>
          <label>
            Primary goal
            <select name="goal" defaultValue={p.goal}>
              {goals.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label>
            Secondary goal
            <input
              name="secondary_goal"
              defaultValue={p.secondary_goal}
              placeholder="e.g. Longevity while preserving performance"
            />
          </label>
          <label className="consent-option">
            <input
              type="checkbox"
              name="strong_only"
              defaultChecked={p.preferences?.strong_only}
            />
            <span>
              <strong>Show strong human evidence only</strong>
              <small>
                Limit recommendations to the Established evidence tier.
              </small>
            </span>
          </label>
          <label className="consent-option">
            <input
              type="checkbox"
              name="supplements"
              defaultChecked={p.preferences?.supplements}
            />
            <span>
              <strong>Include supplement knowledge</strong>
              <small>
                Eligible options still require safety and professional review
                before starting.
              </small>
            </span>
          </label>
          <Button type="submit" disabled={busy || !me.consents.health}>
            Save preferences <Check size={16} />
          </Button>
        </form>
      )}
      {tab === "Privacy & data" && (
        <>
          <section className="card settings-section">
            <SectionTitle title="Your permissions" />
            <p>
              Each decision is versioned. Turning a permission off stops access
              and future processing for that feature.
            </p>
            {[
              [
                "health",
                "Health data processing",
                "Normalize measurements and build your longitudinal Twin.",
              ],
              [
                "wearable",
                "Wearable access",
                "Import and sync wearable signals. Revocation removes stored connection tokens.",
              ],
              [
                "genomics",
                "Genomic processing",
                "Store and interpret genotype data in a separate permission boundary.",
              ],
              [
                "ai",
                "Personalized explanations",
                "Use selected structured context for grounded explanations. If configured, question text is sent to an external routing model. Raw records and genotypes stay local.",
              ],
              [
                "clinician",
                "Clinician access",
                "Reserved for future clinician workflows; no sharing integration is active.",
              ],
              [
                "research",
                "Research use",
                "Reserved for a future explicit research protocol; no data is sent to research services.",
              ],
            ].map(([scope, title, description]) => (
              <div className="privacy-row" key={scope}>
                <span>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </span>
                <button
                  className={"toggle " + (me.consents[scope] ? "on" : "")}
                  role="switch"
                  aria-checked={!!me.consents[scope]}
                  aria-label={title}
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        post("/consent", {
                          scope,
                          granted: !me.consents[scope],
                        }),
                      "Permission updated",
                    )
                  }
                >
                  <span />
                </button>
              </div>
            ))}
          </section>
          <section className="card settings-section">
            <SectionTitle title="Your data stays yours" />
            <div className="privacy-row">
              <div>
                <strong>Export your complete structured record</strong>
                <p>
                  Download context, observations, consent history, Twins,
                  experiments and audit records as JSON. Original files remain
                  downloadable in My Data.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    const data = await api("/export");
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(data, null, 2)], {
                        type: "application/json",
                      }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "aevum-personal-record.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <Download size={16} />
                Export data
              </Button>
            </div>
            <div className="privacy-row">
              <div>
                <strong>Delete your account and data</strong>
                <p>
                  Permanently delete this workspace, health records, original
                  files and active sessions.
                </p>
              </div>
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                Delete account
              </Button>
            </div>
          </section>
          <section className="card settings-section">
            <SectionTitle title="Recent access & changes" />
            <div className="audit-list">
              {[...audit]
                .reverse()
                .slice(0, 20)
                .map((a) => (
                  <div key={a.id}>
                    <ShieldCheck size={16} />
                    <span>{a.action.replace(/([A-Z])/g, " $1").trim()}</span>
                    <time>{date(a.created_at)}</time>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}
      {deleteOpen && (
        <Modal
          title="Permanently delete this workspace?"
          onClose={() => setDeleteOpen(false)}
        >
          <p>
            This removes your account, original uploads and every version of
            your Twin. It cannot be undone.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const confirmation = new FormData(e.currentTarget).get(
                "confirmation",
              );
              try {
                await api("/account", {
                  method: "DELETE",
                  body: JSON.stringify({ confirmation }),
                });
                location.reload();
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            <label>
              Type DELETE to confirm
              <input
                name="confirmation"
                pattern="DELETE"
                required
                autoComplete="off"
              />
            </label>
            <Button type="submit" variant="danger">
              Delete everything in this workspace
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
