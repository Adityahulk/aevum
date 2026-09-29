import React, { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Download, Stethoscope } from "lucide-react";
import { api, post, date, RecordData } from "./api";
import { Button, Modal } from "./components";
import { useApp } from "./context";

export function ClinicianCard({ origin }: { origin: "home" | "twin" }) {
  const { me, setMe, setError, setToast } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = me.clinician_request;
  const active = ["requested", "contacted", "scheduled"].includes(
    request?.status,
  );
  return (
    <>
      <section className="clinician-card" aria-label="Longevity clinician call">
        <span className="clinician-icon">
          <Stethoscope size={22} />
        </span>
        <div>
          <h3>
            {active
              ? "Your clinician call"
              : origin === "home"
                ? "A clinician’s perspective"
                : "Talk with an expert"}
          </h3>
          <p>
            {active
              ? request.status === "scheduled"
                ? "Your call is marked as scheduled. Check the details shared by the Aevum team."
                : "Request received. Our team will contact you by email to arrange a call."
              : "Discuss your results, priorities and next steps with a longevity clinician."}
          </p>
          {active ? (
            <span className="clinician-status">
              <CheckCircle2 size={15} />{" "}
              {request.status === "scheduled" ? "Scheduled" : "Call requested"}
            </span>
          ) : (
            <button className="clinician-link" onClick={() => setOpen(true)}>
              {origin === "home"
                ? "Discuss this with a longevity clinician"
                : "Request a call"}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </section>
      {open && (
        <Modal
          title="Talk with a longevity clinician"
          onClose={() => !busy && setOpen(false)}
        >
          <p>
            Review your results, discuss your goals and prepare questions about
            your next steps.
          </p>
          <p>
            The Aevum team will email you to arrange a suitable time and confirm
            any fee before booking. Requesting a call does not book or charge
            you.
          </p>
          {me.profile.demo ? (
            <p>
              Create your own account to request a call. Sample accounts cannot
              submit requests.
            </p>
          ) : (
            <>
              <p>
                By requesting a call, you allow Aevum to prepare and share your
                health report with the clinician for this call. It includes your
                available results, lifestyle context and progress. Your Ask
                conversations are excluded.
              </p>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const saved = await post("/clinician-requests", {
                      origin,
                      share_report: true,
                    });
                    setMe((current: RecordData) => ({
                      ...current,
                      clinician_request: saved,
                    }));
                    setOpen(false);
                    setToast(
                      "Call requested. Our team will email you to arrange it.",
                    );
                  } catch (e: any) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Sending request…" : "Request a call"}
                <ArrowRight size={16} />
              </Button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

export function AdminPage() {
  const { me, setError } = useApp();
  const [requests, setRequests] = useState<RecordData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [failed, setFailed] = useState(false);
  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      setRequests(await api("/admin/clinician-requests"));
    } catch (e: any) {
      setFailed(true);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (me.is_admin) void load();
  }, [me.is_admin]);
  if (!me.is_admin)
    return <p>Admin access is required to view call requests.</p>;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMIN</span>
          <h1>Clinician call requests</h1>
          <p>
            Contact members to arrange a call. Download their report when
            preparing the clinician’s review.
          </p>
        </div>
        <Button variant="secondary" disabled={loading} onClick={load}>
          Refresh requests
        </Button>
      </div>
      {loading ? (
        <p role="status">Loading requests…</p>
      ) : failed ? (
        <p>Requests could not be loaded. Refresh to try again.</p>
      ) : requests.length === 0 ? (
        <p>No call requests yet.</p>
      ) : (
        <div className="clinician-requests">
          {requests.map((request) => (
            <section className="card clinician-request" key={request.id}>
              <div>
                <h2>{request.name}</h2>
                <a href={"mailto:" + encodeURIComponent(request.email)}>
                  {request.email}
                </a>
                <p>
                  Requested {date(request.created_at)} · From{" "}
                  {request.origin === "home" ? "Home" : "Twin"}
                </p>
              </div>
              <div className="clinician-actions">
                <label>
                  Request status
                  <select
                    aria-label={"Status for " + request.name}
                    value={request.status}
                    disabled={busy === request.id}
                    onChange={async (e) => {
                      const status = e.target.value;
                      setBusy(request.id);
                      try {
                        await post("/admin/clinician-requests/" + request.id, {
                          status,
                        });
                        setRequests((rows) =>
                          rows.map((row) =>
                            row.id === request.id ? { ...row, status } : row,
                          ),
                        );
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    {[
                      "requested",
                      "contacted",
                      "scheduled",
                      "completed",
                      "cancelled",
                    ].map((status) => (
                      <option key={status} value={status}>
                        {status[0].toUpperCase() + status.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="secondary"
                  disabled={
                    busy === request.id ||
                    !request.report_available ||
                    request.status === "cancelled"
                  }
                  onClick={async () => {
                    setBusy(request.id);
                    try {
                      const response = await fetch(
                        "/api/admin/clinician-requests/" +
                          request.id +
                          "/report",
                        { credentials: "same-origin" },
                      );
                      if (!response.ok) {
                        const error = await response.json();
                        throw new Error(
                          error.error || "Report could not be downloaded.",
                        );
                      }
                      const url = URL.createObjectURL(await response.blob());
                      const link = document.createElement("a");
                      link.href = url;
                      link.download =
                        "aevum-clinician-report-" + request.id + ".html";
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                      setTimeout(() => URL.revokeObjectURL(url), 10000);
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  <Download size={16} />
                  Download report
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="muted">
        Reports open in a browser and can be saved as PDF using Print.
        Scheduling and meeting links are handled directly by your team.
      </p>
    </>
  );
}
