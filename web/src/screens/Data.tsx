import React, { useState, useEffect } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  Dna,
  Download,
  FileText,
  Heart,
  Info,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  X,
  Link as LinkIcon,
  LoaderCircle,
} from "lucide-react";
import { api, post, date, RecordData } from "../api";
import { Badge, Button, Empty, SectionTitle, Modal } from "../components";
import { useApp } from "../context";
import { isWearable, WearableProvider } from "../wearables";
import { HistoricalRecords } from "./HistoricalRecords";
export function DataPage() {
  const { state, me, route, go, setModal, run, busy, setError } = useApp();
  const [tab, setTab] = useState(
      new URLSearchParams(window.location.search).has("connected")
        ? "Wearables"
        : "Bloodwork",
    ),
    [query, setQuery] = useState(route.split("/")[1] || ""),
    [providers, setProviders] = useState<WearableProvider[]>([]),
    [providerId, setProviderId] = useState(
      new URLSearchParams(window.location.search).get("connected") || "oura",
    ),
    [draft, setDraft] = useState<any>(null);
  useEffect(() => {
    api("/wearables/providers")
      .then((result) => {
        setProviders(result.providers);
        setProviderId((selected) =>
          result.providers.some((p: WearableProvider) => p.id === selected)
            ? selected
            : result.providers[0]?.id || "oura",
        );
      })
      .catch(() =>
        setError("Wearable connections could not be loaded. Please refresh."),
      );
  }, [state]);
  const provider = providers.find((p) => p.id === providerId);
  const rows = state.observations
    .filter(
      (o: RecordData) =>
        (tab === "Wearables" ? isWearable(o.source) : !isWearable(o.source)) &&
        (!query ||
          (o.label + " " + o.concept_id)
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort((a: RecordData, b: RecordData) =>
      b.effective_time.localeCompare(a.effective_time),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVERY INSIGHT HAS A SOURCE</span>
          <h1>Your data, connected.</h1>
          <p>
            A transparent record of the information behind your Biological Twin.
          </p>
        </div>
        <Button
          onClick={() =>
            setModal({
              type: "upload",
              kind:
                tab === "Wearables"
                  ? "wearable"
                  : tab === "Genetics"
                    ? "genomics"
                    : "labs",
            })
          }
        >
          <Plus size={16} />
          Add data
        </Button>
      </div>
      <div className="source-cards">
        <button
          className="card source-card"
          onClick={() => setModal({ type: "upload", kind: "labs" })}
        >
          <span className="domain-icon">
            <FileText size={21} />
          </span>
          <div>
            <h3>Bloodwork</h3>
            <p>
              {
                state.artifacts.filter((a: RecordData) => a.kind === "labs")
                  .length
              }{" "}
              source documents
            </p>
          </div>
          <Upload size={18} />
        </button>
        <button
          className="card source-card"
          onClick={() => setTab("Wearables")}
        >
          <span className="domain-icon domain-recovery">
            <Activity size={21} />
          </span>
          <div>
            <h3>Wearables</h3>
            <p>
              {providers.some((p) => p.connected)
                ? providers.filter((p) => p.connected).length + " connected"
                : state.observations.some((o: RecordData) =>
                      isWearable(o.source),
                    )
                  ? "Imported wearable data"
                  : "Connect a wearable or import data"}
            </p>
          </div>
          <LinkIcon size={18} />
        </button>
        <button className="card source-card" onClick={() => setTab("Genetics")}>
          <span className="domain-icon domain-epigenetic">
            <Dna size={21} />
          </span>
          <div>
            <h3>Genomic context</h3>
            <p>
              {me.consents.genomics
                ? state.genomic_findings.length + " contextual findings"
                : "Separate permission required"}
            </p>
          </div>
          <ShieldCheck size={18} />
        </button>
      </div>
      <div className="tabs scroll-tabs">
        {[
          "Bloodwork",
          "Wearables",
          "Genetics",
          "Personal context",
          "Historical records",
          "Source documents",
        ].map((t) => (
          <button
            key={t}
            className={t === tab ? "active" : ""}
            onClick={() => {
              setTab(t);
              setQuery("");
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {["Bloodwork", "Wearables"].includes(tab) && (
        <>
          {tab === "Wearables" && (
            <section className="provider-banner card">
              <div>
                <h3>Your daily physiology</h3>
                <label>
                  <span className="muted text-small">
                    Choose your wearable{" "}
                  </span>
                  <select
                    aria-label="Wearable provider"
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value)}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.connected ? " · Connected" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {provider?.connected
                    ? "Your connection is active. Sync recent measurements, then review them in Source documents."
                    : provider?.detail}
                </p>
                <small className="muted">
                  {provider?.mode === "oauth" &&
                    !provider.configured &&
                    "Connection is not available yet. You can import measurements now."}
                  {provider?.last_sync?.status === "needs_attention" &&
                    "Last sync needs attention. Try syncing again or reconnect."}
                </small>
                {provider?.mode === "template" && (
                  <p>
                    <a
                      className="text-button"
                      href="/fixtures/wearable-template.csv"
                      download
                    >
                      Download wearable CSV template
                    </a>
                  </p>
                )}
              </div>
              <div className="row wrap">
                {!me.consents.wearable ? (
                  <Button variant="secondary" onClick={() => go("settings")}>
                    Manage wearable consent
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setModal({ type: "upload", kind: "wearable" })
                      }
                    >
                      Import export
                    </Button>
                    {(provider?.mode === "oauth" || provider?.connected) && (
                      <Button
                        disabled={busy || !provider.configured}
                        onClick={() =>
                          run(
                            async () => {
                              if (provider?.connected)
                                return post(`/wearables/${providerId}/sync`);
                              const result = await post(
                                `/wearables/${providerId}/connect`,
                              );
                              window.location.href = result.url;
                              return result;
                            },
                            provider?.connected
                              ? "Sync requested. Available measurements appear in Source documents for review."
                              : undefined,
                          )
                        }
                      >
                        {provider?.connected
                          ? `Sync ${provider.name}`
                          : `Connect ${provider?.name}`}
                        <LinkIcon size={16} />
                      </Button>
                    )}
                    {provider?.mode === "mobile" &&
                      !provider.connected &&
                      (provider.companion_url ? (
                        <a
                          className="text-button"
                          href={provider.companion_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Get mobile companion <ArrowUpRight size={16} />
                        </a>
                      ) : (
                        <span className="muted text-small">
                          Mobile companion distribution is not configured yet.
                          Apple Health exports can be imported now.
                        </span>
                      ))}
                    {provider?.connected && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api(`/wearables/${providerId}/disconnect`, {
                                method: "DELETE",
                              }),
                            "Wearable disconnected. Previously imported data is retained.",
                          )
                        }
                      >
                        Disconnect
                      </Button>
                    )}
                  </>
                )}
              </div>
            </section>
          )}
          <section className="card data-table">
            <div className="table-toolbar">
              <label className="search-box">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search measurements"
                  aria-label="Search measurements"
                />
              </label>
              <span className="muted text-small">
                {rows.length} verified results
              </span>
              <button
                className="text-button"
                onClick={() => setModal({ type: "manual" })}
              >
                <Plus size={15} />
                Enter a measurement
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Measurement</th>
                    <th>Result</th>
                    <th>Source interval</th>
                    <th>Date measured</th>
                    <th>Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 150).map((o: RecordData) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.label}</strong>
                        <small>{o.concept_id}</small>
                      </td>
                      <td>
                        {o.value} <span className="muted">{o.unit}</span>
                      </td>
                      <td>
                        {o.reference_range?.low ?? "—"} –{" "}
                        {o.reference_range?.high ?? "—"}
                      </td>
                      <td>{date(o.effective_time)}</td>
                      <td>
                        {o.provenance_id === "manual" ? (
                          <Badge>Manual entry</Badge>
                        ) : (
                          <a
                            className="source-link"
                            href={"/api/sources/" + o.provenance_id}
                          >
                            <FileText size={13} />
                            {isWearable(o.source)
                              ? o.source.replaceAll("_", " ") + " data"
                              : "Source report"}
                            <ArrowUpRight size={12} />
                          </a>
                        )}
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() =>
                            setModal({ type: "manual", observation: o })
                          }
                        >
                          Correct
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <Empty
                title="Your baseline begins with a measurement"
                action={
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setModal({
                        type: "upload",
                        kind: tab === "Wearables" ? "wearable" : "labs",
                      })
                    }
                  >
                    Upload your data <Upload size={16} />
                  </Button>
                }
              >
                Upload a source report, verify the extracted results and watch
                your Twin take shape.
              </Empty>
            )}
            {rows.length > 150 && (
              <p className="muted table-foot">
                Showing the latest 150 matching measurements. Export your full
                record from Settings.
              </p>
            )}
            <div className="panel-foot">
              <ShieldCheck size={14} />
              Original sources are preserved. Corrections create a new version
              and retain the audit trail.
            </div>
          </section>
        </>
      )}
      {tab === "Genetics" && (
        <>
          <section className="genomics-banner card">
            <Dna size={36} />
            <div>
              <h2>DNA is context, not destiny.</h2>
              <p>
                Genetic information may inform interpretation and monitoring. It
                never becomes a diagnosis or a direct measure of current
                biological age.
              </p>
            </div>
          </section>
          {!me.consents.genomics ? (
            <Empty
              title="Genomic data has its own permission"
              action={
                <Button onClick={() => go("settings")}>
                  Review genomic consent
                </Button>
              }
            >
              You decide whether genomic data can be processed and interpreted.
            </Empty>
          ) : (
            <>
              <div className="two-columns">
                {state.genomic_findings.map((f: RecordData) => (
                  <article className="card genomic-finding" key={f.id}>
                    <Badge tone="purple">{f.category}</Badge>
                    <h2>{f.name}</h2>
                    <p>{f.interpretation}</p>
                    <div className="info-note">
                      <Info size={17} />
                      <span>{f.impact}</span>
                    </div>
                    <div className="row between">
                      <span className="text-small muted">
                        {f.confidence} confidence · {f.gene}
                      </span>
                      <a
                        className="text-button"
                        href={f.citation}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Evidence <ArrowUpRight size={14} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
              {!state.genomic_findings.length && (
                <Empty
                  title="Your genomic context is still open"
                  action={
                    <Button
                      onClick={() =>
                        setModal({ type: "upload", kind: "genomics" })
                      }
                    >
                      Upload a genotype file
                    </Button>
                  }
                >
                  Consumer genotype TXT/CSV files are supported with an explicit
                  genome-build header. Interpretation is intentionally limited
                  to a curated medication-context locus.
                </Empty>
              )}
            </>
          )}
        </>
      )}
      {tab === "Historical records" && <HistoricalRecords />}
      {tab === "Personal context" && (
        <div className="two-columns">
          <section className="card context-card">
            <SectionTitle
              title="Lifestyle & medical context"
              action={
                <button className="text-button" onClick={() => go("settings")}>
                  Update <ArrowUpRight size={15} />
                </button>
              }
            />
            <dl>
              {[
                ["Primary goal", "goal"],
                ["Exercise", "exercise_type"],
                ["Sleep schedule", "sleep_schedule"],
                ["Dietary pattern", "diet"],
                ["Alcohol", "alcohol"],
                ["Smoking", "smoking"],
                ["Stress", "stress"],
                ["Medical conditions", "conditions"],
                ["Medications", "medications"],
                ["Allergies", "allergies"],
              ].map(([label, key]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{me.profile[key] || "Not provided"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="card context-card">
            <SectionTitle
              title="Family history"
              action={
                <button className="text-button" onClick={() => go("settings")}>
                  Update <ArrowUpRight size={15} />
                </button>
              }
            />
            {me.profile.family_history?.length ? (
              me.profile.family_history.map((f: RecordData, i: number) => (
                <div className="family-record" key={i}>
                  <Heart size={20} />
                  <div>
                    <h3>
                      {f.relation} · {f.condition}
                    </h3>
                    <p>
                      Onset: {f.onset_age || "unknown"} ·{" "}
                      {f.confidence || "Reported"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p>No family history has been recorded.</p>
            )}
            <div className="info-note">
              <Info size={17} />
              <span>
                A family-history entry can influence monitoring priorities. It
                does not mean you currently have the condition.
              </span>
            </div>
          </section>
        </div>
      )}
      {tab === "Source documents" && (
        <section className="card sources-panel">
          <SectionTitle title="The original record" />
          <p className="muted">
            Files are hashed, encrypted and preserved as uploaded.
          </p>
          {state.artifacts.map((a: RecordData) => (
            <div key={a.id} className="source-document">
              <span className="document-icon">
                <FileText size={23} />
              </span>
              <div>
                <h3>{a.filename}</h3>
                <p>
                  {date(a.created_at)} · {a.kind} ·{" "}
                  {Math.max(1, Math.round(a.size / 1024))} KB
                </p>
                <details>
                  <summary>Source fingerprint</summary>
                  <code>{a.sha256}</code>
                </details>
                {a.error && <p className="form-error">{a.error}</p>}
              </div>
              <Badge tone={a.status === "verified" ? "green" : "amber"}>
                {a.status.replaceAll("_", " ")}
              </Badge>
              {a.import_id && a.status === "review_required" && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      setDraft(await api("/imports/" + a.import_id));
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  Review
                </Button>
              )}
              <a
                className="icon-button"
                href={"/api/sources/" + a.id}
                aria-label={"Download " + a.filename}
              >
                <Download size={19} />
              </a>
            </div>
          ))}
          {!state.artifacts.length && (
            <Empty title="Your sources will live here">
              Every uploaded report stays connected to the measurements it
              supports.
            </Empty>
          )}
        </section>
      )}
      {draft && <ReviewModal draft={draft} onClose={() => setDraft(null)} />}
    </>
  );
}

export function UploadModal({
  kind: initial,
  onClose,
}: {
  kind: string;
  onClose: () => void;
}) {
  const { me, go, setError } = useApp();
  const [kind, setKind] = useState(initial),
    [file, setFile] = useState<File | null>(null),
    [loading, setLoading] = useState(false),
    [draft, setDraft] = useState<any>(null),
    [err, setErr] = useState("");
  const required =
    kind === "genomics"
      ? "genomics"
      : kind === "wearable"
        ? "wearable"
        : "health";
  async function upload() {
    if (!file) return;
    setLoading(true);
    setErr("");
    try {
      const f = new FormData();
      f.append("file", file);
      f.append("kind", kind);
      setDraft(await api("/imports", { method: "POST", body: f }));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  if (draft) return <ReviewModal draft={draft} onClose={onClose} />;
  return (
    <Modal title="Connect another piece of your story" onClose={onClose}>
      <p className="modal-intro">
        Bring your source data. We’ll organize it, and you’ll verify the results
        before they reach your Twin.
      </p>
      <div className="segmented">
        {[
          ["labs", "Bloodwork"],
          ["wearable", "Wearable"],
          ["genomics", "Genotype"],
        ].map(([id, label]) => (
          <button
            className={kind === id ? "selected" : ""}
            key={id}
            onClick={() => {
              setKind(id);
              setFile(null);
              setErr("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!me.consents[required] ? (
        <Empty
          title="Your permission comes first"
          action={
            <Button
              onClick={() => {
                onClose();
                go("settings");
              }}
            >
              Review {required} consent
            </Button>
          }
        >
          Enable {required} processing before uploading this data.
        </Empty>
      ) : (
        <>
          <label
            className="upload-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setFile(e.dataTransfer.files[0] || null);
            }}
          >
            <input
              type="file"
              accept={
                kind === "labs"
                  ? ".pdf,.csv"
                  : kind === "wearable"
                    ? ".json,.xml,.zip,.csv"
                    : ".txt,.csv"
              }
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <span className="upload-icon">
              <Upload size={25} />
            </span>
            <strong>
              {file ? file.name : "Choose a file or drop it here"}
            </strong>
            <span>
              {kind === "labs"
                ? "PDF or CSV lab report"
                : kind === "wearable"
                  ? "Wearable JSON, Apple Health XML/ZIP or daily CSV"
                  : "Consumer genotype TXT or CSV · build 37 or 38"}
            </span>
            <small>Up to 15 MB · Your source stays private</small>
          </label>
          <div className="info-note">
            <Info size={17} />
            <span>
              {kind === "labs"
                ? "Text-based PDF results are extracted conservatively. Scanned or complex layouts can be entered manually after reviewing the original."
                : kind === "wearable"
                  ? "Import Oura JSON, a supported provider sync JSON, Apple Health export.xml, or the wearable CSV template. Review the measurements before they update your Twin. Apple SDNN is not imported as RMSSD HRV."
                  : "Include rsID, chromosome, position and genotype, plus an explicit # build 37 or # build 38 header. Raw variants are never sent to the guide."}
            </span>
          </div>
          {kind === "labs" && (
            <a
              className="text-button"
              href="/fixtures/lab-template.csv"
              download
            >
              Download CSV template <Download size={14} />
            </a>
          )}
          {err && (
            <p role="alert" className="form-error">
              {err}
            </p>
          )}
          <Button disabled={!file || loading} onClick={upload}>
            {loading ? (
              <>
                <LoaderCircle size={16} className="spin" />
                Reading your source…
              </>
            ) : (
              <>
                Upload & review <ArrowRight size={16} />
              </>
            )}
          </Button>
        </>
      )}
    </Modal>
  );
}

export function ReviewModal({
  draft,
  onClose,
}: {
  draft: RecordData;
  onClose: () => void;
}) {
  const { run, busy, catalog, setError } = useApp();
  const [rows, setRows] = useState<RecordData[]>(draft.rows || []),
    [ack, setAck] = useState(false);
  const [checked, setChecked] = useState(false);
  const update = (i: number, key: string, value: any) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  return (
    <Modal title="Verify your source data" wide onClose={onClose}>
      <div className="row between">
        <p className="modal-intro">{draft.filename}</p>
        <a className="text-button" href={"/api/sources/" + draft.artifact_id}>
          Open original <Download size={15} />
        </a>
      </div>
      <Badge tone="amber">
        Review required · Nothing has changed your Twin yet
      </Badge>
      {draft.kind === "genomics" ? (
        <div className="inset-card">
          <h3>
            {draft.variant_count} genotype rows · {draft.genome_build}
          </h3>
          <p>{draft.limitations}</p>
          <p>
            {draft.findings?.length || 0} curated contextual findings. Variants
            outside the annotation panel are stored, not interpreted.
          </p>
        </div>
      ) : (
        <>
          <div className="table-scroll review-table">
            <table>
              <thead>
                <tr>
                  <th>Biomarker</th>
                  <th>Value</th>
                  <th>Unit</th>
                  <th>Date</th>
                  <th>Low</th>
                  <th>High</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        aria-label={"Biomarker row " + (i + 1)}
                        value={r.concept_id}
                        onChange={(e) => {
                          update(i, "concept_id", e.target.value);
                          update(
                            i,
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
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        aria-label={"Value row " + (i + 1)}
                        value={r.value}
                        onChange={(e) => update(i, "value", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={"Unit row " + (i + 1)}
                        value={r.unit}
                        onChange={(e) => update(i, "unit", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        aria-label={"Date row " + (i + 1)}
                        value={r.effective_time?.slice(0, 10) || ""}
                        onChange={(e) =>
                          update(i, "effective_time", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        aria-label={"Reference low row " + (i + 1)}
                        value={r.reference_range?.low ?? ""}
                        onChange={(e) =>
                          update(i, "reference_range", {
                            ...r.reference_range,
                            low:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        aria-label={"Reference high row " + (i + 1)}
                        value={r.reference_range?.high ?? ""}
                        onChange={(e) =>
                          update(i, "reference_range", {
                            ...r.reference_range,
                            high:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={"Remove row " + (i + 1)}
                        onClick={() =>
                          setRows((rs) => rs.filter((_, j) => j !== i))
                        }
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="text-button"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                {
                  concept_id: "APOB",
                  value: "",
                  unit: "mg/dL",
                  effective_time: "",
                  reference_range: { low: null, high: null },
                },
              ])
            }
          >
            <Plus size={15} />
            Add a missed measurement
          </button>
        </>
      )}
      {draft.errors?.length > 0 && (
        <div className="extraction-errors">
          <h3>{draft.errors.length} rows need attention</h3>
          {draft.errors.slice(0, 20).map((e: RecordData, i: number) => (
            <p key={i}>
              Row {e.row}: {e.message}
            </p>
          ))}
          <label className="inline-check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I reviewed these issues and corrected or excluded the affected rows.
          </label>
        </div>
      )}
      <label className="consent-option">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>
          I checked the results, dates and units against the original source.
        </span>
      </label>
      <Button
        disabled={!checked || busy || (!ack && draft.errors?.length > 0)}
        onClick={async () => {
          const result = await run(
            () =>
              post("/imports/" + draft.id + "/confirm", {
                rows,
                acknowledge_excluded_rows: ack,
              }),
            "Verified data added. Your Twin has been updated.",
          );
          if (result) onClose();
        }}
      >
        {busy ? "Updating your Twin…" : "Confirm & update my Twin"}
        <Check size={16} />
      </Button>
    </Modal>
  );
}

export function MeasurementModal({
  observation: o,
  onClose,
}: {
  observation?: RecordData;
  onClose: () => void;
}) {
  const { catalog, run, busy } = useApp();
  const [code, setCode] = useState(o?.concept_id || "APOB");
  const concept = catalog.concepts.find((c: RecordData) => c.id === code);
  return (
    <Modal
      title={o ? "Correct a measurement" : "Add a verified measurement"}
      onClose={onClose}
    >
      <p className="modal-intro">
        {o
          ? "The original record is preserved. This correction creates a new version."
          : "Enter a result from a source you have checked. Wearable exports can be imported automatically."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          const body = {
            ...f,
            concept_id: code,
            value: Number(f.value),
            reference_range: {
              low: f.low === "" ? null : Number(f.low),
              high: f.high === "" ? null : Number(f.high),
            },
            verified: true,
          };
          const result = await run(
            () =>
              post(
                o ? "/observations/" + o.id + "/correct" : "/observations",
                body,
              ),
            "Measurement saved and Twin updated",
          );
          if (result) onClose();
        }}
      >
        <label>
          Measurement
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            {catalog.concepts.map((c: RecordData) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Value
            <input
              type="number"
              step="any"
              name="value"
              defaultValue={o?.value}
              required
            />
          </label>
          <label>
            Unit
            <input
              name="unit"
              key={code}
              defaultValue={concept.unit}
              required
            />
          </label>
        </div>
        <label>
          Measurement date
          <input
            type="date"
            name="effective_time"
            defaultValue={o?.effective_time.slice(0, 10)}
            max={new Date().toISOString().slice(0, 10)}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Source interval: low
            <input
              type="number"
              step="any"
              name="low"
              defaultValue={o?.reference_range?.low ?? ""}
            />
          </label>
          <label>
            Source interval: high
            <input
              type="number"
              step="any"
              name="high"
              defaultValue={o?.reference_range?.high ?? ""}
            />
          </label>
        </div>
        {o && (
          <label>
            Reason for correction
            <input
              name="reason"
              required
              minLength={3}
              placeholder="e.g. Verified units against the original report"
            />
          </label>
        )}
        <label className="inline-check">
          <input type="checkbox" required />I verified this result against its
          source.
        </label>
        <Button type="submit" disabled={busy}>
          Save verified result <Check size={16} />
        </Button>
      </form>
    </Modal>
  );
}
