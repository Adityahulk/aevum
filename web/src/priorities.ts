import { RecordData } from "./api";

const concerning = (d: RecordData) =>
  d.severity ? d.severity !== "None" : /concern/i.test(d.state || "");

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
