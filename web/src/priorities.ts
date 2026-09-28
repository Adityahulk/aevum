import { RecordData } from "./api";

export function genomicSource(state: RecordData, enabled: boolean) {
  if (!enabled) return "Permission needed";
  if (state.genomic_findings?.length)
    return `${state.genomic_findings.length} supported ${state.genomic_findings.length === 1 ? "finding" : "findings"} available`;
  if (
    state.twin.domains.some(
      (d: RecordData) => d.genomic_status?.sample_count > 0,
    )
  )
    return "Imported · no supported findings";
  const source = state.artifacts.find((a: RecordData) => a.kind === "genomics");
  if (!source) return "Optional · no DNA source added";
  if (source.error || source.status === "failed") return "Needs attention";
  if (["verified", "confirmed"].includes(source.status))
    return "Imported · no supported findings";
  return "Received · review needed";
}

export function domainSummary(d: RecordData) {
  if (d.coverage > 0)
    return isWithinExpected(d) ? "Assessed measurements within range" : d.state;
  const parts = [
    d.context_signals?.length ? "Supporting labs" : "",
    d.lifestyle_context?.length ? "Reported lifestyle" : "",
    d.genomic_context?.length ? "DNA context" : "",
  ].filter(Boolean);
  return parts.length
    ? `${parts.join(" and ")} available · direct measurements needed`
    : "Direct measurements needed";
}

const concerning = (d: RecordData) =>
  d.severity ? d.severity !== "None" : /concern/i.test(d.state || "");

export function followUpMeasurements(
  e: RecordData,
  observations: RecordData[],
) {
  const start = new Date(e.start_date).getTime();
  const windowStart = start + (e.planned_duration_weeks * 7 - 7) * 86400000;
  return observations.filter((o) => {
    const measured = new Date(o.effective_time).getTime();
    return (
      e.baseline?.[o.concept_id]?.source === o.source &&
      o.quality_status === "verified" &&
      measured > start &&
      measured >= windowStart &&
      measured <= Date.now() &&
      Date.now() - measured <= 30 * 86400000 &&
      !e.baseline_observation_ids?.includes(o.id)
    );
  });
}

// The engine caps `priorities` at three; every concerning domain still needs to be visible.
export function attentionDomains(twin: RecordData): RecordData[] {
  const ranked = new Set<string>(twin.priorities || []);
  return twin.domains
    .filter((d: RecordData) => ranked.has(d.id) || concerning(d))
    .sort(
      (a: RecordData, b: RecordData) => (b.priority ?? 0) - (a.priority ?? 0),
    );
}

export const isWithinExpected = (d: RecordData) =>
  ["Within source intervals", "Within personal baseline"].includes(d.state);

// Without lab reference ranges or a repeat measurement, nothing can be judged high or low.
export const canAssess = (twin: RecordData) =>
  twin.domains.some(
    (d: RecordData) =>
      isWithinExpected(d) ||
      ["Moderate concern", "Elevated concern"].includes(d.state),
  );

export const isActiveExperiment = (e: RecordData) =>
  !["Stopped", "Evaluated"].includes(e.status);

export function experimentsTargeting(
  domainId: string,
  experiments: RecordData[],
  interventions: RecordData[] = [],
) {
  return experiments.filter((e) => {
    if (!isActiveExperiment(e)) return false;
    const plan = interventions.find((i) => i.id === e.intervention_id);
    return Boolean(
      plan && [plan.domain, ...(plan.also || [])].includes(domainId),
    );
  });
}

export function suggestionFor(domainId: string, recommendations: RecordData[]) {
  const matches = recommendations.filter((r) =>
    [r.domain, ...(r.also || [])].includes(domainId),
  );
  return (
    matches.find(
      (r) => r.eligible && !r.already_active && !r.blocked_reasons?.length,
    ) || matches.find((r) => !r.already_active)
  );
}
