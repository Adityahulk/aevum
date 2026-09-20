import { useEffect, useState } from "react";
import { api, post, RecordData } from "../api";
import { Button, Badge, SectionTitle } from "../components";
import { useApp } from "../context";

const text = (v: unknown): string =>
  v === null || v === undefined
    ? "Not recorded"
    : typeof v === "string"
      ? v
      : JSON.stringify(v);
const list = (v: unknown): RecordData[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];

export function HistoricalRecords() {
  const { me, state, run, busy, setError } = useApp();
  const [records, setRecords] = useState<RecordData[]>([]);
  const [selected, setSelected] = useState<RecordData | null>(null);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    api("/historical-imports")
      .then(setRecords)
      .catch((e) => setError(e.message));
  }, [state, setError]);
  const choose = (r: RecordData) => {
    setSelected(r);
    setVerified(false);
  };
  return (
    <section className="card context-card">
      <SectionTitle title="Historical records" />
      <p>
        Import dated lab results, questionnaire answers and an accompanying
        review. Your current profile stays separate.
      </p>
      <label>
        Choose a historical-record bundle (JSON, up to 2 MB)
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              setError("Choose a file up to 2 MB.");
              return;
            }
            try {
              const bundle = JSON.parse(await file.text());
              const result = await run(() =>
                post("/historical-imports/preview", bundle),
              );
              if (result) choose(result);
            } catch (error: any) {
              setError(
                error.message || "Unable to read the historical record.",
              );
            }
          }}
        />
      </label>
      <div className="row wrap">
        {records.map((r) => (
          <Button key={r.id} variant="secondary" onClick={() => choose(r)}>
            {text(r.client_name)} ·{" "}
            {r.status === "confirmed" ? "Imported" : "Review"}
          </Button>
        ))}
      </div>
      {selected && (
        <div>
          <h3>{text(selected.client_name)}</h3>
          <Badge tone={selected.status === "confirmed" ? "green" : "amber"}>
            {selected.status === "confirmed"
              ? "Imported"
              : "Review before import"}
          </Badge>
          <p>
            {list(selected.measurements).length} source results ·{" "}
            {list(selected.rows).length} supported measurements ·{" "}
            {list(selected.lifestyle?.facts).length} historical answers
          </p>
          <p className="muted">{text(selected.limitations)}</p>
          <details open={selected.status !== "confirmed"}>
            <summary>All source results</summary>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Marker</th>
                    <th>Result</th>
                    <th>Date</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {list(selected.measurements).map((r, i) => (
                    <tr key={i}>
                      <td>{text(r.name)}</td>
                      <td>
                        {text(r.value)} {text(r.unit)}
                      </td>
                      <td>{text(r.date)}</td>
                      <td>
                        {text(r.source_file)} ·{" "}
                        {r.source_kind === "original_lab"
                          ? "Original lab"
                          : "Table transcription"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details>
            <summary>
              Results retained outside scoring ({list(selected.retained).length}
              )
            </summary>
            {list(selected.retained).map((r, i) => (
              <p key={i}>
                Row {text(r.row)}: {text(r.reason)}
              </p>
            ))}
          </details>
          <details>
            <summary>
              Historical questionnaire ·{" "}
              {text(selected.lifestyle?.collected_at)}
            </summary>
            <p className="muted">{text(selected.lifestyle?.source_file)}</p>
            {list(selected.lifestyle?.facts).map((f, i) => (
              <p key={i}>
                <b>
                  {text(f.source_pointer)
                    .replaceAll("/", " › ")
                    .replaceAll("_", " ")}
                </b>
                : {text(f.value)}
              </p>
            ))}
            {!list(selected.lifestyle?.facts).length && (
              <p>No completed questionnaire provided.</p>
            )}
          </details>
          <details>
            <summary>Accompanying fresh review</summary>
            <p className="muted">
              Imported informational text; not a clinician-verified diagnosis or
              model input.
            </p>
            <h3>{text(selected.fresh_review?.headline)}</h3>
            <p>{text(selected.fresh_review?.context)}</p>
            {list(selected.fresh_review?.findings).map((f, i) => (
              <article key={i}>
                <h4>{text(f.title)}</h4>
                <p>{text(f.observed)}</p>
                <p>{text(f.interpretation)}</p>
                <p>{text(f.next_step)}</p>
                {list(f.references).map((s, j) =>
                  typeof s.url === "string" && /^https:\/\//i.test(s.url) ? (
                    <p key={j}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {text(s.title)}
                      </a>
                    </p>
                  ) : null,
                )}
              </article>
            ))}
            {Array.isArray(selected.fresh_review?.lifestyle_plan) && (
              <ul>
                {selected.fresh_review.lifestyle_plan.map(
                  (x: unknown, i: number) => (
                    <li key={i}>{text(x)}</li>
                  ),
                )}
              </ul>
            )}
          </details>
          {selected.status !== "confirmed" && (
            <>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                I checked the source records for {text(selected.client_name)}{" "}
                and confirm they belong to the signed-in account,{" "}
                {text(me.profile.name)}.
              </label>
              <Button
                disabled={!verified || busy}
                onClick={async () => {
                  const result = await run(
                    () =>
                      post(`/historical-imports/${selected.id}/confirm`, {
                        client_name: selected.client_name,
                        verified_account_and_sources: true,
                      }),
                    "Historical records saved and Twin refreshed",
                  );
                  if (result) choose(result);
                }}
              >
                Confirm complete historical import
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
