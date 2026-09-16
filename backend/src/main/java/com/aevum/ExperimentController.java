package com.aevum;

import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/experiments")
public class ExperimentController {
  final Store s;
  final Auth auth;
  final TwinService twins;
  final Science science;

  public ExperimentController(Store s, Auth a, TwinService t, Science sc) {
    this.s = s;
    auth = a;
    twins = t;
    science = sc;
  }

  @PostMapping
  synchronized Map<String, Object> start(
      @RequestBody Map<String, Object> b, HttpServletRequest req) {
    String p = Api.person(req);
    auth.require(p, "health");
    String id = Api.str(b, "intervention_id", "");
    var r =
        Api.maps(twins.ranked(p).get("recommendations")).stream()
            .filter(x -> id.equals(x.get("id")))
            .findFirst()
            .orElseThrow(() -> new Api.Failure(404, "Intervention unavailable"));
    if (!Boolean.TRUE.equals(r.get("eligible")))
      throw new Api.Failure(
          422,
          "This option needs a baseline, safety review, or resolution of a contraindication before"
              + " it can start.");
    if (s.list(p, "experiment").stream()
        .anyMatch(
            e ->
                id.equals(e.get("intervention_id"))
                    && !List.of("Stopped", "Evaluated").contains(e.get("status"))))
      throw new Api.Failure(409, "This intervention is already active.");
    String protocol = Api.str(b, "protocol", r.get("protocol").toString());
    if (protocol.length() < 10 || protocol.length() > 4000)
      throw new Api.Failure(422, "Describe your planned protocol and intensity.");
    var fs = Api.map(twins.current(p).get("features"));
    Map<String, Object> baseline = new LinkedHashMap<>();
    List<String> sourceIds = new ArrayList<>();
    for (Object target : (List<?>) r.get("available_baselines")) {
      var f = Api.map(fs.get(target.toString()));
      var history = Api.maps(f.get("history"));
      double value = Double.parseDouble(f.get("current_window_mean").toString());
      double noise = 0;
      double avg =
          history.stream()
              .mapToDouble(o -> Double.parseDouble(o.get("value").toString()))
              .average()
              .orElse(0);
      if (avg != 0)
        noise =
            Math.sqrt(
                    history.stream()
                        .mapToDouble(
                            o -> Math.pow(Double.parseDouble(o.get("value").toString()) - avg, 2))
                        .average()
                        .orElse(0))
                / Math.abs(avg)
                * 100;
      baseline.put(
          target.toString(),
          Map.of(
              "value",
              value,
              "source",
              f.get("source"),
              "noise_pct",
              noise,
              "prior_trend",
              f.get("trend"),
              "reference_range",
              f.getOrDefault("reference_range", Map.of())));
      for (Object o : (List<?>) f.get("observation_ids")) sourceIds.add(o.toString());
    }
    Map<String, Object> exp = new LinkedHashMap<>();
    exp.put("intervention_id", id);
    exp.put("name", r.get("name"));
    exp.put("category", r.get("category"));
    exp.put("start_date", Instant.now().toString());
    exp.put("planned_duration_weeks", r.get("weeks"));
    exp.put(
        "due_date", LocalDate.now().plusWeeks(((Number) r.get("weeks")).longValue()).toString());
    exp.put("protocol", protocol);
    exp.put("baseline", baseline);
    exp.put("baseline_observation_ids", sourceIds);
    exp.put("target_outcomes", r.get("targets"));
    exp.put("success_threshold_pct", 5);
    exp.put("adherence", 0);
    exp.put("status", "Active");
    exp.put("adverse_effects", "");
    exp.put("concurrent_changes", "");
    exp.put("checkins", List.of());
    exp.put("decision", "");
    exp.put("evidence_ids", r.get("evidence_ids"));
    exp.put("baseline_twin_version", twins.current(p).get("version"));
    var saved = s.add(p, "experiment", exp);
    s.audit(p, "InterventionStarted", saved.get("id").toString());
    twins.refresh(p, "Experiment started", Set.of());
    return saved;
  }

  @PatchMapping("/{id}")
  synchronized Map<String, Object> update(
      @PathVariable String id, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    String p = Api.person(r);
    auth.require(p, "health");
    var e = s.get(p, "experiment", id);
    String status = e.get("status").toString();
    if (b.containsKey("decision")) {
      String d = b.get("decision").toString();
      if (!List.of("Continue", "Modify", "Stop").contains(d) || !e.containsKey("response"))
        throw new Api.Failure(
            422, "Evaluate the experiment before choosing Continue, Modify or Stop.");
      if ("Modify".equals(d) && Api.str(b, "decision_note", "").length() < 10)
        throw new Api.Failure(422, "Describe the modification and next measurement plan.");
      e.put("decision", d);
      e.put("decision_note", Api.str(b, "decision_note", ""));
      e.put("status", d.equals("Stop") ? "Stopped" : "Evaluated");
    } else {
      if (List.of("Stopped", "Evaluated").contains(status))
        throw new Api.Failure(
            409, "This experiment is closed. Start a new experiment for a new baseline.");
      double adherence;
      try {
        adherence = Double.parseDouble(b.getOrDefault("adherence", e.get("adherence")).toString());
      } catch (Exception ex) {
        throw new Api.Failure(422, "Adherence must be 0–100");
      }
      if (!Double.isFinite(adherence) || adherence < 0 || adherence > 100)
        throw new Api.Failure(422, "Adherence must be 0–100");
      e.put("adherence", adherence);
      e.put("adverse_effects", Api.str(b, "adverse_effects", Api.str(e, "adverse_effects", "")));
      e.put(
          "concurrent_changes",
          Api.str(b, "concurrent_changes", Api.str(e, "concurrent_changes", "")));
      e.put(
          "status",
          LocalDate.now().isBefore(LocalDate.parse(e.get("due_date").toString()))
              ? "Monitoring"
              : "Evaluation due");
      var checkins = new ArrayList<>(Api.maps(e.get("checkins")));
      checkins.add(
          Map.of(
              "date",
              Instant.now().toString(),
              "adherence",
              adherence,
              "adverse_effects",
              e.get("adverse_effects"),
              "concurrent_changes",
              e.get("concurrent_changes")));
      e.put("checkins", checkins);
    }
    var saved = s.replace(p, "experiment", id, e);
    s.audit(p, "ExperimentUpdated", id);
    return saved;
  }

  @PostMapping("/{id}/evaluate")
  synchronized Map<String, Object> evaluate(@PathVariable String id, HttpServletRequest req) {
    String p = Api.person(req);
    auth.require(p, "health");
    var e = s.get(p, "experiment", id);
    if ("Stopped".equals(e.get("status")))
      throw new Api.Failure(409, "A stopped experiment cannot be re-evaluated.");
    long concurrent =
        s.list(p, "experiment").stream()
            .filter(
                x ->
                    !id.equals(x.get("id"))
                        && !"Stopped".equals(x.get("status"))
                        && x.get("start_date")
                                .toString()
                                .compareTo(e.get("due_date").toString() + "T23:59:59Z")
                            <= 0
                        && x.get("due_date")
                                .toString()
                                .compareTo(e.get("start_date").toString().substring(0, 10))
                            >= 0)
            .count();
    var result =
        science.post(
            "/evaluate",
            Map.of(
                "experiment",
                e,
                "observations",
                twins.observations(p),
                "concurrent_experiments",
                concurrent));
    e.put("response", result);
    e.put("status", "Inconclusive".equals(result.get("outcome")) ? "Monitoring" : "Evaluated");
    s.replace(p, "experiment", id, e);
    s.add(p, "response", new LinkedHashMap<>(Map.of("experiment_id", id, "response", result)));
    s.audit(p, "ResponseEvaluated", id);
    twins.refresh(p, "Experiment response evaluated", Set.of());
    return e;
  }
}
