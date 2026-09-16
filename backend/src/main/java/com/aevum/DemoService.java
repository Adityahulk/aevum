package com.aevum;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class DemoService {
  final Store s;
  final TwinService twins;
  final RawStorage raw;

  public DemoService(Store s, TwinService t, RawStorage raw) {
    this.s = s;
    twins = t;
    this.raw = raw;
  }

  public String create() {
    String p = Store.id();
    for (String scope : List.of("health", "wearable", "genomics", "ai"))
      s.add(
          p,
          "consent",
          Map.of("scope", scope, "granted", true, "policy_version", "synthetic-demo-v1"));
    s.add(
        p,
        "profile",
        Map.ofEntries(
            Map.entry("name", "Alex Morgan"),
            Map.entry("age", 38),
            Map.entry("sex", "Male"),
            Map.entry("goal", "Longevity"),
            Map.entry("secondary_goal", "Preserve athletic performance"),
            Map.entry("onboarded", true),
            Map.entry("demo", true),
            Map.entry("conditions", ""),
            Map.entry("medications", ""),
            Map.entry("allergies", ""),
            Map.entry("exercise_frequency", 4),
            Map.entry("exercise_type", "Running and strength training"),
            Map.entry("sleep_duration", 6.8),
            Map.entry("sleep_schedule", "23:00–06:30"),
            Map.entry("diet", "Mixed, mostly home-cooked"),
            Map.entry("alcohol", "2 drinks/week"),
            Map.entry("smoking", "Never"),
            Map.entry("stress", "Moderate"),
            Map.entry(
                "family_history",
                List.of(
                    Map.of(
                        "relation",
                        "Father",
                        "condition",
                        "Cardiovascular disease",
                        "onset_age",
                        52,
                        "confidence",
                        "Reported"))),
            Map.entry("preferences", Map.of("supplements", false, "strong_only", false))));
    String lab = Store.id();
    StringBuilder csv =
        new StringBuilder("biomarker,value,unit,date,reference_low,reference_high\n");
    Object[][] series = {
      {"APOB", "ApoB", "mg/dL", new double[] {92, 105, 132, 118}, 60., 100.},
      {"TRIGLYCERIDES", "Triglycerides", "mg/dL", new double[] {110, 132, 180, 156}, 40., 150.},
      {"GLUCOSE", "Fasting glucose", "mg/dL", new double[] {87, 89, 95, 93}, 70., 99.},
      {"HBA1C", "HbA1c", "%", new double[] {5.1, 5.2, 5.4, 5.3}, 4., 5.6},
      {"INSULIN", "Fasting insulin", "uIU/mL", new double[] {7.2, 9.8, 13.5, 12.2}, 2., 10.},
      {"HDL", "HDL cholesterol", "mg/dL", new double[] {58, 57, 55, 58}, 40., 90.},
      {"HSCRP", "hs-CRP", "mg/L", new double[] {1.1, 1.4, 2.1, 2.4}, 0., 2.},
      {"VO2MAX", "VO₂ max", "mL/kg/min", new double[] {39, 40, 41, 44}, 35., 65.},
      {"GRIP", "Grip strength", "kg", new double[] {39, 40, 42, 44}, 30., 65.},
      {"MUSCLE", "Lean mass", "kg", new double[] {57, 57.5, 58, 59}, 50., 80.},
      {"WAIST", "Waist circumference", "cm", new double[] {82, 82, 83, 82}, 65., 95.},
      {"WEIGHT", "Body weight", "kg", new double[] {75, 75, 75.5, 75.2}, 60., 90.},
      {"SBP", "Systolic blood pressure", "mmHg", new double[] {117, 118, 119, 116}, 90., 120.},
      {"LDL", "LDL cholesterol", "mg/dL", new double[] {99, 110, 130, 115}, 40., 100.}
    };
    int[] days = {540, 360, 90, 5};
    for (var row : series)
      for (int i = 0; i < 4; i++) {
        double v = ((double[]) row[3])[i];
        LocalDate date = LocalDate.now().minusDays(days[i]);
        observation(
            p,
            row[0].toString(),
            row[1].toString(),
            v,
            row[2].toString(),
            date,
            "lab_csv",
            lab,
            (Double) row[4],
            (Double) row[5]);
        csv.append(
            row[0] + "," + v + "," + row[2] + "," + date + "," + row[4] + "," + row[5] + "\n");
      }
    artifact(p, lab, "Example longitudinal bloodwork.csv", "labs", csv.toString().getBytes(), 56);
    String wear = Store.id();
    List<Map<String, Object>> export = new ArrayList<>();
    for (int i = 34; i >= 0; i--) {
      LocalDate day = LocalDate.now().minusDays(i);
      double hrv = i < 8 ? 44 + (i % 3) : 52 + (i % 4),
          sleep = i < 8 ? 6.3 + (i % 3) * 0.12 : 7.2 + (i % 4) * 0.1,
          rhr = i < 8 ? 54 + (i % 2) : 56 + (i % 3);
      observation(p, "HRV", "Heart rate variability", hrv, "ms", day, "oura", wear, null, null);
      observation(p, "SLEEP", "Sleep duration", sleep, "h", day, "oura", wear, null, null);
      observation(p, "RHR", "Resting heart rate", rhr, "bpm", day, "oura", wear, null, null);
      observation(
          p, "STEPS", "Daily steps", 8500 + i % 5 * 600, "steps", day, "oura", wear, null, null);
      export.add(
          Map.of(
              "day",
              day.toString(),
              "average_hrv",
              hrv,
              "total_sleep_duration",
              sleep * 3600,
              "average_heart_rate",
              rhr,
              "steps",
              8500 + i % 5 * 600));
    }
    try {
      artifact(
          p,
          wear,
          "Example Oura export.json",
          "wearable",
          s.json.writeValueAsBytes(Map.of("data", export)),
          140);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
    String gen = Store.id();
    artifact(
        p,
        gen,
        "Example genotype.txt",
        "genomics",
        "# Synthetic data — not a real genotype\n# build 37\nrs4149056 12 21331549 TT\n".getBytes(),
        1);
    s.add(
        p,
        "genomic_finding",
        Map.of(
            "name",
            "Medication context available",
            "category",
            "Medication context",
            "gene",
            "SLCO1B1",
            "confidence",
            "Low",
            "level",
            "Supported",
            "interpretation",
            "A synthetic pharmacogenomic locus is available for demonstration. Clinical"
                + " confirmation and professional interpretation are required before treatment"
                + " decisions.",
            "impact",
            "Context only; no current disease or biological-age claim.",
            "citation",
            "https://blog.clinpgx.org/cpic-publishes-guideline-for-slco1b1/",
            "provenance_id",
            gen));
    twins.refresh(p, "Your first Biological Twin", Set.of());
    Map<String, Object> exp = new LinkedHashMap<>();
    exp.put("name", "Build your aerobic foundation");
    exp.put("intervention_id", "aerobic");
    exp.put("category", "Exercise");
    exp.put("start_date", Instant.now().minus(Duration.ofDays(84)).toString());
    exp.put("due_date", LocalDate.now().toString());
    exp.put("planned_duration_weeks", 12);
    exp.put("status", "Evaluation due");
    exp.put("adherence", 86);
    exp.put(
        "protocol",
        "Synthetic example: three comfortable aerobic sessions per week, adjusted to recovery.");
    exp.put(
        "baseline",
        Map.of(
            "VO2MAX",
            Map.of("value", 41, "source", "lab_csv", "noise_pct", 2, "prior_trend", "Improving"),
            "RHR",
            Map.of("value", 58, "source", "oura", "noise_pct", 2, "prior_trend", "Stable")));
    exp.put("baseline_observation_ids", List.of());
    exp.put("success_threshold_pct", 5);
    exp.put("target_outcomes", List.of("VO2MAX", "RHR"));
    exp.put("adverse_effects", "");
    exp.put("concurrent_changes", "");
    exp.put("decision", "");
    exp.put("checkins", List.of());
    exp.put("evidence_ids", List.of("e-activity"));
    s.add(p, "experiment", exp);
    twins.refresh(p, "New bloodwork and wearable data", Set.of());
    s.audit(p, "SyntheticDemoCreated", p);
    return p;
  }

  private void artifact(String p, String id, String name, String kind, byte[] bytes, int count) {
    String key = p + "/" + (kind.equals("genomics") ? "genomic/" : "health/") + id;
    raw.put(key, bytes);
    String hash;
    try {
      hash =
          HexFormat.of()
              .formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
    s.add(
        p,
        "artifact",
        Map.of(
            "id",
            id,
            "filename",
            name,
            "kind",
            kind,
            "status",
            "verified",
            "size",
            bytes.length,
            "sha256",
            hash,
            "storage_key",
            key,
            "source",
            "synthetic_demo",
            "accepted_count",
            count));
  }

  private void observation(
      String p,
      String code,
      String label,
      double value,
      String unit,
      LocalDate date,
      String source,
      String provenance,
      Double lo,
      Double hi) {
    Map<String, Object> refs = new LinkedHashMap<>();
    refs.put("low", lo);
    refs.put("high", hi);
    refs.put("origin", "Synthetic demonstration interval; not a clinical policy");
    Map<String, Object> o = new LinkedHashMap<>();
    o.put("concept_id", code);
    o.put("label", label);
    o.put("value", value);
    o.put("unit", unit);
    o.put("effective_time", date + "T00:00:00+00:00");
    o.put("result_time", date + "T00:00:00+00:00");
    o.put("source", source);
    o.put("provenance_id", provenance);
    o.put("source_record_id", Store.id());
    o.put("reference_range", refs);
    o.put("quality_status", "verified");
    o.put("confidence", 1);
    s.add(p, "observation", o);
  }
}
