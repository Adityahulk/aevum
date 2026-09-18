export const wearableSources = new Set([
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
  "wearable_csv",
]);
export const isWearable = (source: string) =>
  wearableSources.has(source) || source.startsWith("ow:");

export type WearableProvider = {
  id: string;
  name: string;
  configured: boolean;
  connected: boolean;
  mode: "oauth" | "import" | "template" | "mobile";
  detail: string;
  companion_url?: string;
  last_sync?: { status?: string; created_at?: string; message?: string };
};
