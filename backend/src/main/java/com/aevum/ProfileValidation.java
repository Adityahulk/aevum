package com.aevum;

import java.util.*;

final class ProfileValidation {
  static void validate(Map<String, Object> b) {
    for (String key :
        List.of(
            "name",
            "sex",
            "goal",
            "secondary_goal",
            "conditions",
            "medications",
            "allergies",
            "symptoms",
            "procedures",
            "exercise_type",
            "sleep_schedule",
            "diet",
            "alcohol",
            "smoking",
            "supplements",
            "stress",
            "occupation",
            "exposures"))
      if (b.containsKey(key)
          && (!(b.get(key) instanceof String) || b.get(key).toString().length() > 4000))
        throw new Api.Failure(422, "Invalid " + key + ": use text up to 4,000 characters.");
    if (b.containsKey("name") && b.get("name").toString().isBlank())
      throw new Api.Failure(422, "Your name cannot be blank.");
    if (b.containsKey("preferences")) {
      if (!(b.get("preferences") instanceof Map))
        throw new Api.Failure(422, "Preferences must be an object");
      for (var e : Api.map(b.get("preferences")).entrySet())
        if (!Set.of("strong_only", "supplements").contains(e.getKey())
            || !(e.getValue() instanceof Boolean))
          throw new Api.Failure(422, "Invalid recommendation preference");
    }
    if (b.containsKey("onboarded") && !(b.get("onboarded") instanceof Boolean))
      throw new Api.Failure(422, "Invalid onboarding state");
    for (String k : List.of("exercise_frequency", "sleep_duration"))
      if (b.containsKey(k) && !b.get(k).toString().isBlank()) {
        try {
          double n = Double.parseDouble(b.get(k).toString());
          if (!Double.isFinite(n) || n < 0 || n > (k.equals("sleep_duration") ? 24 : 28))
            throw new NumberFormatException();
          b.put(k, n);
        } catch (Exception e) {
          throw new Api.Failure(422, "Invalid " + k + " value");
        }
      }
    if (b.containsKey("family_history")) {
      if (!(b.get("family_history") instanceof List)
          || ((List<?>) b.get("family_history")).size() > 50)
        throw new Api.Failure(422, "Family history supports up to 50 structured entries");
      for (Object item : (List<?>) b.get("family_history")) {
        if (!(item instanceof Map)) throw new Api.Failure(422, "Invalid family history entry");
        var f = Api.map(item);
        if (!(f.get("relation") instanceof String)
            || !(f.get("condition") instanceof String)
            || f.get("condition").toString().isBlank())
          throw new Api.Failure(422, "A family relationship and condition are required");
        for (String k : List.of("onset_age", "age_at_death"))
          if (f.get(k) != null && !f.get(k).toString().isBlank())
            try {
              int age = Integer.parseInt(f.get(k).toString());
              if (age < 0 || age > 130) throw new NumberFormatException();
            } catch (Exception e) {
              throw new Api.Failure(
                  422, "Family history ages must be between 0 and 130 or left unknown");
            }
      }
    }
  }

  static void facts(Store s, String p, Map<String, Object> profile) {
    String version = profile.get("id").toString();
    for (String k :
        List.of(
            "exercise_frequency",
            "exercise_type",
            "sleep_duration",
            "sleep_schedule",
            "diet",
            "alcohol",
            "smoking",
            "supplements",
            "stress",
            "occupation",
            "exposures"))
      if (profile.containsKey(k))
        s.add(
            p,
            "lifestyle_fact",
            Map.of(
                "concept",
                k,
                "value",
                profile.get(k),
                "start_date",
                profile.get("created_at"),
                "context_version",
                version,
                "source",
                "questionnaire",
                "confidence",
                0.8));
    for (var f : Api.maps(profile.get("family_history"))) {
      var record = new LinkedHashMap<>(f);
      record.put("context_version", version);
      record.put("source", "questionnaire");
      s.add(p, "family_history", record);
    }
    for (String k : List.of("conditions", "medications", "allergies", "symptoms", "procedures"))
      if (profile.containsKey(k) && !profile.get(k).toString().isBlank())
        s.add(
            p,
            "medical_context",
            Map.of(
                "concept",
                k,
                "reported_text",
                profile.get(k),
                "context_version",
                version,
                "source",
                "questionnaire",
                "status",
                "user_reported"));
  }
}
