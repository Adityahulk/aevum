import React, { useState } from "react";
import {
  ArrowRight,
  Check,
  Dna,
  FlaskConical,
  Layers,
  ShieldCheck,
  Sparkles,
  Target,
  LoaderCircle,
} from "lucide-react";
import { post } from "../api";
import { Logo, Button, TwinOrb } from "../components";
import { useApp } from "../context";
import { goals } from "../config";
export function AuthScreen({ onSuccess }: { onSuccess: () => Promise<any> }) {
  const { setError } = useApp();
  const [mode, setMode] = useState("welcome"),
    [pending, setPending] = useState(false),
    [err, setErr] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setPending(true);
    setErr("");
    try {
      await post("/auth/" + (mode === "login" ? "login" : "register"), f);
      await onSuccess();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-nav">
        <Logo />
        <span>Your biology. Better understood.</span>
      </div>
      <div className="auth-content">
        <div className="auth-story">
          <span className="eyebrow">
            <span className="status-dot" /> PERSONAL BIOLOGICAL INTELLIGENCE
          </span>
          <h1>
            More than a snapshot.
            <br />
            <em>A living picture of you.</em>
          </h1>
          <p>
            Connect the pieces of your health. Understand what’s changing,
            explore the biology behind it, and discover what works for you.
          </p>
          <div className="auth-pillars">
            <span>
              <Dna size={19} />
              Your personal Twin
            </span>
            <span>
              <Layers size={19} />
              Evidence you can explore
            </span>
            <span>
              <FlaskConical size={19} />
              Progress you can measure
            </span>
          </div>
          <TwinOrb />
          <div className="auth-orb-label">
            <span className="status-dot" />
            Always learning. Uniquely yours.
          </div>
        </div>
        <div className="auth-form card">
          {mode === "welcome" ? (
            <>
              <div className="welcome-icon">
                <Sparkles size={25} />
              </div>
              <h2>
                A new perspective
                <br />
                on your health.
              </h2>
              <p>Meet Aevum, your personal Biological Twin.</p>
              <Button onClick={() => setMode("register")}>
                Build my Twin <ArrowRight size={17} />
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setErr("");
                  try {
                    await post("/auth/demo");
                    await onSuccess();
                  } catch (e: any) {
                    setErr(e.message);
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {pending ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Dna size={17} />
                )}
                Explore a sample Twin
              </Button>
              <div className="auth-divider">
                <span>Already have an account?</span>
              </div>
              <button className="text-button" onClick={() => setMode("login")}>
                Sign in <ArrowRight size={15} />
              </button>
              <div className="info-note">
                <ShieldCheck size={18} />
                <span>
                  You control your data and permissions. Your genomic data is
                  kept separate.
                </span>
              </div>
            </>
          ) : (
            <>
              <button
                className="text-button subtle"
                onClick={() => setMode("welcome")}
              >
                ← Back
              </button>
              <h2>
                {mode === "login" ? "Welcome back." : "Let’s begin your story."}
              </h2>
              <p>
                {mode === "login"
                  ? "Your Twin is right where you left it."
                  : "Start with an account. Add your data at your pace."}
              </p>
              <form onSubmit={submit}>
                {mode === "register" && (
                  <label>
                    Your name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={80}
                      placeholder="Alex Morgan"
                    />
                  </label>
                )}
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    required
                    minLength={mode === "register" ? 12 : 1}
                    maxLength={72}
                    placeholder={
                      mode === "register"
                        ? "At least 12 characters"
                        : "Your password"
                    }
                  />
                </label>
                <Button type="submit" disabled={pending}>
                  {pending
                    ? "Connecting…"
                    : mode === "login"
                      ? "Sign in"
                      : "Create my account"}
                  <ArrowRight size={16} />
                </Button>
              </form>
              <button
                className="text-button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
              >
                {mode === "login"
                  ? "Create an account"
                  : "Already registered? Sign in"}
              </button>
            </>
          )}
          {err && (
            <p className="form-error" role="alert">
              {err}
            </p>
          )}
          <span className="auth-legal">
            A longitudinal research tool. No single score defines you.
          </span>
        </div>
      </div>
      <div className="auth-footer">
        AEVUM · PERSONAL BIOLOGICAL INTELLIGENCE
        <span>Understand · Explore · Experiment · Evolve</span>
      </div>
    </div>
  );
}

export function Onboarding() {
  const { me, run, busy, go } = useApp();
  const [step, setStep] = useState(0),
    [goal, setGoal] = useState("Longevity"),
    [health, setHealth] = useState(false),
    [ai, setAi] = useState(false);
  return (
    <div className="onboarding">
      <header>
        <Logo />
        <span>YOUR TWIN STARTS HERE</span>
      </header>
      <div className="onboarding-progress">
        {["Your direction", "Your context", "Your permissions"].map((s, i) => (
          <span className={i <= step ? "selected" : ""} key={s}>
            <i>{i < step ? <Check size={13} /> : i + 1}</i>
            {s}
          </span>
        ))}
      </div>
      <div className="onboarding-card card">
        <span className="eyebrow">STEP {step + 1} OF 3</span>
        <h1>
          {step === 0
            ? "What matters most to you?"
            : step === 1
              ? "A little context goes a long way."
              : "You’re in control."}
        </h1>
        <p>
          {step === 0
            ? "Your goal shapes priorities. Your biology stays the same."
            : step === 1
              ? "These details help us understand your measurements responsibly."
              : "Choose how Aevum can use your data. Optional permissions can change at any time."}
        </p>
        {step === 0 ? (
          <>
            <div className="goal-grid">
              {goals.map((g) => (
                <button
                  className={"goal-option " + (goal === g ? "selected" : "")}
                  key={g}
                  onClick={() => setGoal(g)}
                >
                  <Target size={19} />
                  {g}
                  {goal === g && <Check size={16} />}
                </button>
              ))}
            </div>
            <Button onClick={() => setStep(1)}>
              Continue <ArrowRight size={16} />
            </Button>
          </>
        ) : step === 1 ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              sessionStorage.setItem(
                "aevum-onboarding",
                JSON.stringify({ ...f, goal }),
              );
              setStep(2);
            }}
          >
            <div className="form-grid">
              <label>
                Age
                <input name="age" type="number" min="18" max="120" required />
              </label>
              <label>
                Sex for clinical context
                <select name="sex" required>
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Intersex</option>
                  <option>Prefer not to say</option>
                </select>
              </label>
            </div>
            <label>
              Secondary goal <span className="muted">optional</span>
              <input
                name="secondary_goal"
                placeholder="e.g. Preserve my athletic performance"
              />
            </label>
            <label>
              Conditions and relevant medical history
              <textarea
                name="conditions"
                placeholder="Include any known conditions, or leave blank"
              />
            </label>
            <label>
              Current medications and allergies
              <input
                name="medications"
                placeholder="Medication names; review allergies in settings"
              />
            </label>
            <div className="row between">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button type="submit">
                Continue <ArrowRight size={16} />
              </Button>
            </div>
          </form>
        ) : (
          <>
            <label className="consent-option">
              <input
                type="checkbox"
                checked={health}
                onChange={(e) => setHealth(e.target.checked)}
              />
              <span>
                <strong>Process my health data</strong>
                <small>
                  Required to normalize measurements and build your Twin. You
                  can revoke this permission in Privacy.
                </small>
              </span>
            </label>
            <label className="consent-option">
              <input
                type="checkbox"
                checked={ai}
                onChange={(e) => setAi(e.target.checked)}
              />
              <span>
                <strong>Enable personalized explanations</strong>
                <small>
                  Optional. Let the guide explain selected structured health
                  information. When configured, your question text is sent to an
                  external routing model; raw records stay local.
                </small>
              </span>
            </label>
            <div className="info-note">
              <ShieldCheck size={18} />
              <span>
                Wearable and genomic processing have separate permissions.
                Clinician access and research use are off by default.
              </span>
            </div>
            <div className="row between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                disabled={!health || busy}
                onClick={() =>
                  run(async () => {
                    await post("/consent", { scope: "health", granted: true });
                    await post("/consent", { scope: "ai", granted: ai });
                    await post("/profile", {
                      ...JSON.parse(
                        sessionStorage.getItem("aevum-onboarding") || "{}",
                      ),
                      onboarded: true,
                    });
                    sessionStorage.removeItem("aevum-onboarding");
                    go("data");
                  }, "Your workspace is ready")
                }
              >
                {busy ? "Building your workspace…" : "Create my workspace"}
                <ArrowRight size={16} />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
