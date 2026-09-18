package com.aevum;

import java.util.*;

final class Wearables {
  static final Set<String> SOURCES =
      Set.of(
          "oura",
          "whoop",
          "fitbit",
          "polar",
          "withings",
          "apple_health",
          "garmin",
          "samsung_health",
          "health_connect",
          "suunto",
          "coros",
          "amazfit",
          "ultrahuman",
          "wearable_csv");

  static boolean isWearable(Object source) {
    return source != null
        && (SOURCES.contains(source.toString()) || source.toString().startsWith("ow:"));
  }
}
