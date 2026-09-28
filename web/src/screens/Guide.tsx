import React, { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Database,
  Dna,
  Sparkles,
  Send,
  LoaderCircle,
  Mic,
  Square,
  Volume2,
} from "lucide-react";
import { api, post, RecordData } from "../api";
import { Badge, Button, Empty } from "../components";
import { useApp } from "../context";
import { useIsMobile } from "../mobile";
import { useSpeech, useVoiceInput } from "../voice";
export function AIPage() {
  const { state, route, me, go, setModal, setError } = useApp();
  const mobile = useIsMobile();
  const conversationEnd = useRef<HTMLDivElement>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const domain = route.split("/")[1];
  const [messages, setMessages] = useState<RecordData[]>([]),
    [question, setQuestion] = useState(""),
    [sending, setSending] = useState(false);
  const speech = useSpeech();
  useEffect(() => {
    if (!mobile || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () =>
      setKeyboardInset(
        Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop),
      );
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [mobile]);
  const voice = useVoiceInput({
    onInterim: setQuestion,
    onFinal: (text) => ask(text, true),
    onError: setError,
  });
  useEffect(() => {
    if (me.consents.ai)
      api("/ai/history")
        .then(setMessages)
        .catch((e: any) => setError(e.message));
  }, [me.consents.ai]);
  async function ask(q: string, spoken = false) {
    if (!q.trim() || sending) return;
    setSending(true);
    setQuestion("");
    try {
      const answer = await post("/ai", { question: q, domain });
      setMessages((m) => [...m, answer]);
      requestAnimationFrame(() =>
        conversationEnd.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        }),
      );
      if (spoken) speech.speak(answer.id, answer.answer);
    } catch (e: any) {
      setError(e.message);
      setQuestion(q);
    } finally {
      setSending(false);
    }
  }
  if (!me.consents.ai)
    return (
      <Empty
        title="An explanation starts with your permission"
        action={
          <Button onClick={() => go("settings")}>
            Review AI processing consent <ArrowRight size={16} />
          </Button>
        }
      >
        Enable personalized explanations in Privacy to ask questions about your
        structured Twin.
      </Empty>
    );
  return (
    <div
      className={
        "ai-page" + (mobile && messages.length ? " m-chat-started" : "")
      }
    >
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR PERSONAL BIOLOGICAL GUIDE</span>
          <h1>{mobile ? "Ask Aevum" : "Make sense of your biology."}</h1>
          <p>
            {mobile
              ? "Your data. Your questions. A clearer next step."
              : "Ask a question. Follow the evidence. Understand the uncertainty."}
          </p>
        </div>
        {!mobile && (
          <Badge tone="purple">
            <span className="status-dot" />
            {messages[messages.length - 1]?.mode || "Grounded guide"}
          </Badge>
        )}
      </div>
      <div className="ai-context-bar">
        <Dna size={18} />
        <span>
          {mobile
            ? "Using your shared health data"
            : `Connected to Twin v${state.twin.version}`}
        </span>
        <span>·</span>
        <span>{state.twin.observation_count} verified measurements</span>
        {domain && (
          <Badge>
            {state.twin.domains.find((d: RecordData) => d.id === domain)?.name}
          </Badge>
        )}
      </div>
      <div className="conversation">
        {!messages.length ? (
          <div className="ai-welcome">
            <div className="ai-spark">
              <Sparkles size={31} />
            </div>
            <h2>What would you like to understand?</h2>
            <p>Let’s connect your measurements to the bigger picture.</p>
            <div className="prompt-grid">
              {[
                "What should I eat based on my current signals?",
                "What workout should I prioritize?",
                "Explain the biology behind my main issue.",
                "Why was this intervention ranked first?",
              ].map((q) => (
                <button key={q} onClick={() => ask(q)}>
                  {q}
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m: RecordData) => (
            <div className="message-pair" key={m.id}>
              <div className="user-message">{m.question}</div>
              <article
                className={
                  "assistant-message" +
                  (/pathway|biolog|mechanism/i.test(m.question)
                    ? " ai-pathway"
                    : "")
                }
              >
                <span className="ai-avatar">
                  <Sparkles size={17} />
                </span>
                <div>
                  <div className="row between">
                    <strong>Aevum</strong>
                    {!mobile && (
                      <span className="muted text-small">
                        {m.mode} · {m.confidence || m.claims?.[0]?.confidence}{" "}
                        confidence
                      </span>
                    )}
                  </div>
                  {mobile && m.mode !== "Grounded AI" && (
                    <p className="m-legacy-answer">
                      Saved response from an earlier version · ask again for an
                      updated answer.
                    </p>
                  )}
                  {!mobile && m.mode_detail && (
                    <p className="muted text-small mode-detail">
                      {m.mode_detail}
                    </p>
                  )}
                  <p className="ai-summary">{m.answer}</p>
                  {mobile &&
                    m.claims
                      ?.filter(
                        (claim: RecordData) => claim.kind === "uncertainty",
                      )
                      .map((claim: RecordData, index: number) => (
                        <p className="ai-limitation" key={index}>
                          {claim.text}
                        </p>
                      ))}
                  {m.claims?.some(
                    (claim: RecordData) =>
                      !mobile || claim.kind !== "uncertainty",
                  ) && (
                    <details
                      className="ai-reasoning"
                      open={
                        !mobile || /pathway|biolog|mechanism/i.test(m.question)
                      }
                    >
                      <summary>
                        {mobile
                          ? "Why this fits your data"
                          : "Supporting explanation"}
                      </summary>
                      <div className="ai-claims">
                        {m.claims
                          .filter(
                            (claim: RecordData) =>
                              !mobile || claim.kind !== "uncertainty",
                          )
                          .map((claim: RecordData, index: number) => (
                            <section
                              key={index}
                              className={"ai-claim " + claim.kind}
                            >
                              <span>
                                {claim.kind || "grounded explanation"}
                              </span>
                              <p>{claim.text}</p>
                              <small>
                                {claim.source_ids?.length || 0} linked{" "}
                                {(claim.source_ids?.length || 0) === 1
                                  ? "source"
                                  : "sources"}
                                {" · "}
                                {claim.confidence} confidence
                              </small>
                            </section>
                          ))}
                      </div>
                    </details>
                  )}
                  {m.action_items?.length > 0 && (
                    <section className="ai-actions">
                      <strong>
                        {mobile ? "Your next steps" : "Practical next steps"}
                      </strong>
                      {m.action_items.map((item: string) => (
                        <div key={item}>
                          <CheckCircle2 size={14} />
                          <span>{item}</span>
                        </div>
                      ))}
                    </section>
                  )}
                  {m.medical_boundary && (
                    <p className="ai-medical-boundary">{m.medical_boundary}</p>
                  )}
                  <div className="claim-sources">
                    {!mobile ||
                    m.provenance?.observation_ids?.length ||
                    m.claims?.[0]?.observation_ids?.length ? (
                      <button onClick={() => go("data")}>
                        <Database size={13} />
                        {m.provenance?.observation_ids?.length ||
                          m.claims?.[0]?.observation_ids?.length ||
                          0}{" "}
                        measurements
                      </button>
                    ) : null}
                    {m.evidence?.length > 0 && (
                      <button
                        onClick={() =>
                          setModal({
                            type: "evidence",
                            ids: m.evidence.map((e: RecordData) => e.id),
                          })
                        }
                      >
                        <BookOpen size={13} />
                        {m.evidence.length} scientific{" "}
                        {m.evidence.length === 1 ? "source" : "sources"}
                      </button>
                    )}
                    {speech.supported && (
                      <button
                        aria-pressed={speech.speakingId === m.id}
                        onClick={() =>
                          speech.speakingId === m.id
                            ? speech.stop()
                            : speech.speak(m.id, m.answer)
                        }
                      >
                        {speech.speakingId === m.id ? (
                          <Square size={13} />
                        ) : (
                          <Volume2 size={13} />
                        )}
                        {speech.speakingId === m.id ? "Stop" : "Listen"}
                      </button>
                    )}
                    {!mobile && <Badge>{m.claims?.[0]?.model_version}</Badge>}
                  </div>
                  <details className="claim-details">
                    <summary>
                      {mobile
                        ? "Sources & answer details"
                        : "Inspect sources used for this answer"}
                    </summary>
                    {mobile && (
                      <p className="text-small muted">
                        {m.created_at
                          ? new Date(m.created_at).toLocaleDateString() + " · "
                          : ""}
                        {m.mode} · {m.confidence || m.claims?.[0]?.confidence}{" "}
                        confidence · Twin{" "}
                        {m.provenance?.twin_version || "version not recorded"}
                        {m.mode_detail ? ` · ${m.mode_detail}` : ""}
                      </p>
                    )}
                    <div className="ai-source-list">
                      {m.source_cards?.map((source: RecordData) => (
                        <div key={source.source_id}>
                          <strong>{source.label || source.source_id}</strong>
                          <span>
                            {source.source_type?.replaceAll("_", " ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                  {m.suggestions?.length > 0 && (
                    <div className="ai-follow-ups">
                      {(mobile ? m.suggestions.slice(0, 1) : m.suggestions).map(
                        (suggestion: string) => (
                          <button
                            key={suggestion}
                            onClick={() => ask(suggestion)}
                          >
                            {suggestion}
                            <ArrowUpRight size={13} />
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </article>
            </div>
          ))
        )}
        {sending && (
          <div className="assistant-thinking" role="status">
            <Sparkles size={17} />
            Connecting your data and evidence…
            <LoaderCircle size={15} className="spin" />
          </div>
        )}
        <div ref={conversationEnd} />
      </div>
      <form
        className="chat-composer"
        style={
          mobile && keyboardInset > 100
            ? { bottom: keyboardInset + 8 }
            : undefined
        }
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label className="sr-only" htmlFor="question">
          Ask about your biology
        </label>
        <input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={2000}
          placeholder={
            voice.listening
              ? "Listening…"
              : domain
                ? `Ask about your ${domain} health…`
                : mobile
                  ? "Ask about your biology…"
                  : "Ask about your biology, your trajectory, or your next step…"
          }
        />
        {voice.supported && (
          <button
            type="button"
            className={"voice-button " + (voice.listening ? "listening" : "")}
            aria-label={voice.listening ? "Stop listening" : "Ask by voice"}
            aria-pressed={voice.listening}
            disabled={sending}
            onClick={() => {
              speech.stop();
              voice.listening ? voice.stop() : voice.start();
            }}
          >
            {voice.listening ? <Square size={18} /> : <Mic size={20} />}
          </button>
        )}
        <button
          aria-label="Send question"
          disabled={sending || voice.listening || !question.trim()}
        >
          <ArrowRight size={21} />
        </button>
      </form>
      {voice.listening && (
        <p className="voice-status" role="status">
          Listening… ask your question, then pause.
        </p>
      )}
      <p className="ai-footnote">
        {mobile
          ? "Answers use the health information you’ve shared. You can inspect their sources above. Aevum does not diagnose or prescribe."
          : "Ask uses a consent-gated, question-relevant view of your structured Twin. Every displayed claim must link to that context. It does not diagnose or prescribe."}
        {voice.supported &&
          " Voice questions are transcribed by your browser’s speech service and sent like typed text."}
      </p>
    </div>
  );
}
