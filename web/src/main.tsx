import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Dna,
  FlaskConical,
  Home as HomeIcon,
  Layers,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
  CheckCheck,
} from "lucide-react";
import { api, post, date, RecordData } from "./api";
import {
  Logo,
  Button,
  Empty,
  Loading,
  Modal,
  EvidenceCard,
} from "./components";
import { Ctx } from "./context";
import { createRoot } from "react-dom/client";
import { AuthScreen, Onboarding } from "./screens/Auth";
import { HomePage } from "./screens/Overview";
import { TwinPage } from "./screens/Twin";
import { BiologyPage } from "./screens/Biology";
import { InterventionsPage } from "./screens/Interventions";
import { AIPage } from "./screens/Guide";
import { DataPage, UploadModal, MeasurementModal } from "./screens/Data";
import { SettingsPage } from "./screens/Settings";
import { MobileTabBar, YouPage } from "./mobile";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./styles.css";
const navs = [
  ["home", "Overview", HomeIcon],
  ["twin", "My Twin", Dna],
  ["biology", "Biology", Layers],
  ["interventions", "Interventions", FlaskConical],
  ["ai", "Ask Aevum", Sparkles],
  ["data", "My Data", Database],
] as const;
function App() {
  const [me, setMe] = useState<any>(null),
    [state, setState] = useState<any>(null),
    [catalog, setCatalog] = useState<any>(null),
    [boot, setBoot] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [route, setRoute] = useState(location.hash.slice(1) || "home"),
    [modal, setModal] = useState<any>(null),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false);
  const go = (r: string) => {
    location.hash = r;
    setRoute(r);
    setMobile(false);
    window.scrollTo(0, 0);
  };
  const refresh = async () => {
    const m = await api("/me");
    setMe(m);
    if (m.consents.health) {
      const [s, c] = await Promise.all([api("/state"), api("/catalog")]);
      setState(s);
      setCatalog(c);
    } else {
      setState(null);
      setCatalog(await api("/catalog"));
    }
    return m;
  };
  useEffect(() => {
    refresh()
      .catch((e: any) => {
        if (e.status === 401) setMe(null);
        else setError(e.message);
      })
      .finally(() => setBoot(false));
    const listener = () => setRoute(location.hash.slice(1) || "home");
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const run = async (fn: () => Promise<any>, message?: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      await refresh();
      if (message) setToast(message);
      return result;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const value = {
    me,
    state,
    catalog,
    go,
    refresh,
    run,
    busy,
    setModal,
    setToast,
    setError,
    route,
  };
  if (boot)
    return (
      <div className="boot">
        <Logo />
        <Loading />
      </div>
    );
  if (!me)
    return (
      <Ctx.Provider value={value}>
        <AuthScreen onSuccess={refresh} />
      </Ctx.Provider>
    );
  if (!me.profile.onboarded)
    return (
      <Ctx.Provider value={value}>
        <Onboarding />
        {error && (
          <div className="global-error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={18} />
            </button>
          </div>
        )}
      </Ctx.Provider>
    );
  const page = route.split("/")[0];
  return (
    <Ctx.Provider value={value}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-shell">
        <aside className={"sidebar " + (mobile ? "open" : "")}>
          <a className="brand-link" href="#home" aria-label="Aevum home">
            <Logo />
          </a>
          <div className="workspace-label">PERSONAL INTELLIGENCE</div>
          <nav aria-label="Main navigation">
            {navs.map(([id, label, Icon]) => (
              <a
                key={id}
                className={"nav-item " + (page === id ? "active" : "")}
                href={"#" + id}
                onClick={() => setMobile(false)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "ai" && <span className="tiny-spark">✧</span>}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="twin-status">
              <span className="status-dot" />
              <div>
                Your Twin is evolving
                <small>
                  {state?.twin?.observation_count || 0} verified measurements
                </small>
              </div>
            </div>
            <button
              className={"nav-item " + (page === "settings" ? "active" : "")}
              onClick={() => go("settings")}
            >
              <Settings size={18} />
              Settings & privacy
            </button>
            <button className="profile-button" onClick={() => go("settings")}>
              <span className="avatar">
                {me.profile.name
                  ?.split(" ")
                  .map((s: string) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <strong>{me.profile.name}</strong>
                <small>
                  {me.profile.demo ? "Demo workspace" : "Personal workspace"}
                </small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>
        </aside>
        {mobile && (
          <div className="nav-scrim" onClick={() => setMobile(false)} />
        )}
        <div className="main-shell">
          <header className="topbar">
            <div className="row">
              <button
                className="icon-button mobile-menu"
                onClick={() => setMobile(!mobile)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
              <span className="mobile-brand">
                <Logo />
              </span>
              <span className="breadcrumb">Your workspace</span>
              <ChevronRight size={13} className="breadcrumb-separator" />
              <span className="breadcrumb-current">
                {page === "you"
                  ? "You"
                  : navs.find((n) => n[0] === page)?.[1] ||
                    "Settings & privacy"}
              </span>
            </div>
            <div className="row topbar-actions">
              <span className="privacy-label">
                <ShieldCheck size={14} />
                Private by design
              </span>
              <button
                className="icon-button notification-trigger"
                aria-label="View notifications"
                onClick={() => setModal({ type: "notifications" })}
              >
                <Bell size={18} />
                {state?.notifications?.some((n: any) => !n.read) && <i />}
              </button>
              <span className="avatar small-avatar">
                {me.profile.name?.[0]}
              </span>
            </div>
          </header>
          <main id="main-content" className="main-content">
            {me.profile.demo && (
              <div className="demo-banner">
                <span>
                  <span className="status-dot" />
                  You’re exploring a sample Biological Twin. All health data is
                  synthetic.
                </span>
                <button
                  onClick={async () => {
                    await post("/logout");
                    setMe(null);
                    setState(null);
                  }}
                >
                  Create your own <ArrowUpRight size={13} />
                </button>
              </div>
            )}
            {!me.consents.health && page !== "settings" ? (
              <Empty
                title="Your data, your decision"
                action={
                  <Button onClick={() => go("settings")}>
                    Review privacy settings <ArrowRight size={16} />
                  </Button>
                }
              >
                Enable health-data processing to build and explore your Twin.
              </Empty>
            ) : !state && page !== "settings" ? (
              <Loading />
            ) : (
              <>
                {page === "home" ? (
                  <HomePage />
                ) : page === "twin" ? (
                  <TwinPage />
                ) : page === "biology" ? (
                  <BiologyPage />
                ) : page === "interventions" ? (
                  <InterventionsPage />
                ) : page === "ai" ? (
                  <AIPage />
                ) : page === "data" ? (
                  <DataPage />
                ) : page === "settings" ? (
                  <SettingsPage />
                ) : page === "you" ? (
                  <YouPage />
                ) : (
                  <Empty
                    title="Page not found"
                    action={
                      <Button onClick={() => go("home")}>
                        Back to overview
                      </Button>
                    }
                  >
                    Choose a page from your navigation.
                  </Empty>
                )}
              </>
            )}
            <footer className="page-footer">
              <Logo small />
              <span>A clearer understanding. A healthier horizon.</span>
              <span>Research model · Not a diagnostic service</span>
            </footer>
          </main>
        </div>
        <MobileTabBar page={page} go={go} />
      </div>
      {modal?.type === "upload" && (
        <UploadModal
          kind={modal.kind || "labs"}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "manual" && (
        <MeasurementModal
          observation={modal.observation}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "evidence" && (
        <Modal
          title="The evidence behind this"
          wide
          onClose={() => setModal(null)}
        >
          <p className="modal-intro">
            Inspect the source, study population and limitations behind each
            interpretation.
          </p>
          {catalog?.evidence
            .filter((e: RecordData) => !modal.ids || modal.ids.includes(e.id))
            .map((e: RecordData) => (
              <EvidenceCard key={e.id} e={e} />
            ))}
        </Modal>
      )}
      {modal?.type === "notifications" && (
        <Modal title="Meaningful updates" onClose={() => setModal(null)}>
          <div className="notification-list">
            {[...(state?.notifications || [])]
              .reverse()
              .map((n: RecordData) => (
                <div className="notification" key={n.id}>
                  <span className="update-icon">
                    <Dna size={19} />
                  </span>
                  <div>
                    <strong>{n.title}</strong>
                    <p>
                      {date(n.created_at)}{" "}
                      {n.twin_version && `· Twin v${n.twin_version}`}
                    </p>
                  </div>
                  {!n.read && <span className="status-dot" />}
                </div>
              ))}
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              run(
                () => post("/notifications/read"),
                "All updates marked as read",
              )
            }
          >
            Mark all as read <CheckCheck size={16} />
          </Button>
        </Modal>
      )}
      {error && (
        <div className="global-error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </Ctx.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
