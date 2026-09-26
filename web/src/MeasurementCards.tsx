import React from "react";
import { ArrowUpRight } from "lucide-react";
import { RecordData, shortDate } from "./api";
import { Badge, Sparkline } from "./components";
import { useApp } from "./context";

export function rangeLabel(s: RecordData): [string, string] {
  const r = s.reference_range || {};
  if (r.low == null && r.high == null) return ["No lab range", ""];
  return s.abnormal
    ? ["Outside lab range", "amber"]
    : ["Within lab range", "green"];
}

export function RangeTrack({ signal }: { signal: RecordData }) {
  const r = signal.reference_range || {};
  const value = Number(signal.current);
  const baseline = signal.baseline == null ? null : Number(signal.baseline);
  if (
    r.low == null ||
    r.high == null ||
    !Number.isFinite(value) ||
    r.high <= r.low
  )
    return null;
  const span = r.high - r.low;
  const points = [r.low - span * 0.4, r.high + span * 0.4, value];
  if (baseline != null) points.push(baseline);
  const min = Math.min(...points),
    max = Math.max(...points);
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="m-track">
      <div
        className="m-range"
        role="img"
        aria-label={`${signal.current} ${signal.unit}; lab range ${r.low}–${r.high}${baseline != null ? `; your baseline ${baseline}` : ""}`}
      >
        <span
          className="m-range-normal"
          style={{
            left: pos(r.low) + "%",
            width: pos(r.high) - pos(r.low) + "%",
          }}
        />
        {baseline != null && (
          <span
            className="m-range-baseline"
            style={{ left: pos(baseline) + "%" }}
          />
        )}
        <span
          className={"m-range-marker " + (signal.abnormal ? "" : "inside")}
          style={{ left: pos(value) + "%" }}
        />
      </div>
      <div className="m-track-legend">
        <span>
          Lab range {r.low}–{r.high}
        </span>
        {baseline != null && (
          <span>
            <i className="m-baseline-key" /> Your baseline {baseline}
          </span>
        )}
      </div>
    </div>
  );
}

export function MeasurementCards({ signals }: { signals: RecordData[] }) {
  const { go } = useApp();
  return (
    <div className="m-measures">
      {signals.map((s) => {
        const [status, tone] = rangeLabel(s);
        const history = (s.history || []).map((h: RecordData) =>
          Number(h.value),
        );
        return (
          <article className="card m-measure" key={s.concept_id}>
            <div className="m-measure-head">
              <strong>{s.label}</strong>
              <span className="m-badges">
                {s.stale && <Badge tone="amber">Outdated</Badge>}
                <Badge tone={tone}>{status}</Badge>
              </span>
            </div>
            <p className="m-measure-value">
              <strong>{s.current}</strong>
              <span>{s.unit}</span>
              {s.personal_change_pct != null && (
                <em
                  className={
                    s.trend === "Worsening"
                      ? "concern"
                      : s.trend === "Improving"
                        ? "good"
                        : ""
                  }
                >
                  {s.personal_change_pct > 0 ? "+" : ""}
                  {s.personal_change_pct}% vs your baseline
                </em>
              )}
            </p>
            <RangeTrack signal={s} />
            {history.length >= 2 && (
              <div className="m-measure-trend">
                <Sparkline
                  values={history}
                  color={s.trend === "Worsening" ? "#a8773f" : "#5a7863"}
                />
                <span>
                  {history.length} results since {shortDate(s.history[0].date)}
                </span>
              </div>
            )}
            <div className="m-measure-foot">
              <span>Measured {shortDate(s.latest_date)}</span>
              <button
                className="text-button"
                onClick={() => go("data/" + s.concept_id)}
              >
                View data <ArrowUpRight size={13} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
