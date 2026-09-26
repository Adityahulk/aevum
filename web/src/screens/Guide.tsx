import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Database,
  Dna,
  Sparkles,
  Send,
  LoaderCircle,
} from "lucide-react";
import { api, post, RecordData } from "../api";
import { Badge, Button, Empty } from "../components";
import { useApp } from "../context";
import { useIsMobile } from "../mobile";
export function AIPage() {
  const { state, route, me, go, setModal, setError } = useApp();
  const mobile = useIsMobile();
  const domain = route.split("/")[1];
  const [messages, setMessages] = useState<RecordData[]>([]),
    [question, setQuestion] = useState(""),
    [sending, setSending] = useState(false);
  useEffect(() => {
    if (me.consents.ai)
      api("/ai/history")
        .then(setMessages)
        .catch((e: any) => setError(e.message));
  }, [me.consents.ai]);
  async function ask(q: string) {
    if (!q.trim() || sending) return;
    setSending(true);
    setQuestion("");
    try {
      const answer = await post("/ai", { question: q, domain });
      setMessages((m) => [...m, answer]);
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
    <div className="ai-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR PERSONAL BIOLOGICAL GUIDE</span>
          <h1>Make sense of your biology.</h1>
          <p>
            Ask a question. Follow the evidence. Understand the uncertainty.
          </p>
        </div>
        <Badge tone="purple">
          <span className="status-dot" />
          {messages[messages.length - 1]?.mode || "Grounded guide"}
        </Badge>
      </div>
      <div className="ai-context-bar">
        <Dna size={18} />
        <span>Connected to Twin v{state.twin.version}</span>
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
                "Why is my metabolic health changing?",
                "What should I prioritize next?",
                "Why was this intervention ranked first?",
                "Did my experiment actually work?",
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
              <article className="assistant-message">
                <span className="ai-avatar">
                  <Sparkles size={17} />
                </span>
                <div>
                  <div className="row between">
                    <strong>Aevum</strong>
                    <span className="muted text-small">
                      {m.mode} · {m.claims?.[0]?.confidence} confidence
                    </span>
                  </div>
                  {m.mode_detail && (
                    <p className="muted text-small mode-detail">
                      {m.mode_detail}
                    </p>
                  )}
                  <p>{m.answer}</p>
                  <div className="claim-sources">
                    <button onClick={() => go("data")}>
                      <Database size={13} />
                      {m.claims?.[0]?.observation_ids.length || 0} measurements
                    </button>
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
                    <Badge>{m.claims?.[0]?.model_version}</Badge>
                  </div>
                  <details className="claim-details">
                    <summary>Inspect claim provenance</summary>
                    <pre>{JSON.stringify(m.claims, null, 2)}</pre>
                  </details>
                </div>
              </article>
            </div>
          ))
        )}
        {sending && (
          <div className="assistant-thinking" role="status">
            <Sparkles size={17} />
            Reading the relevant measurements…
            <LoaderCircle size={15} className="spin" />
          </div>
        )}
      </div>
      <form
        className="chat-composer"
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
            domain
              ? `Ask about your ${domain} health…`
              : mobile
                ? "Ask about your biology…"
                : "Ask about your biology, your trajectory, or your next step…"
          }
        />
        <button
          aria-label="Send question"
          disabled={sending || !question.trim()}
        >
          <ArrowRight size={21} />
        </button>
      </form>
      <p className="ai-footnote">
        Explanations come from your structured data. Model routing is optional;
        all claims come from structured retrieval. The guide does not diagnose
        or prescribe.
      </p>
    </div>
  );
}
