import { useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const recognitionCtor = (): (new () => Recognition) | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

const language = () =>
  (typeof navigator !== "undefined" && navigator.language) || "en-US";

const errorMessages: Record<string, string> = {
  "not-allowed":
    "Microphone access is blocked. Allow it in your browser settings to ask by voice.",
  "service-not-allowed":
    "Voice input isn’t available in this browser. You can still type your question.",
  "no-speech": "I didn’t catch that. Tap the microphone and try again.",
  "audio-capture": "No microphone was found on this device.",
  network: "Voice input needs an internet connection. Please try again.",
};

export function useVoiceInput({
  onInterim,
  onFinal,
  onError,
}: {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
}) {
  const active = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const supported = Boolean(recognitionCtor());

  useEffect(() => () => active.current?.abort(), []);

  const start = () => {
    const Ctor = recognitionCtor();
    if (!Ctor || active.current) return;
    const recognition = new Ctor();
    recognition.lang = language();
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    let finalText = "";
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      onInterim((finalText + interim).trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted")
        onError(
          errorMessages[event.error] ||
            "Voice input stopped unexpectedly. Please try again.",
        );
    };
    recognition.onend = () => {
      active.current = null;
      setListening(false);
      if (finalText.trim()) onFinal(finalText.trim());
    };
    active.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      active.current = null;
      setListening(false);
      onError("Voice input could not start. Please try again.");
    }
  };

  return { supported, listening, start, stop: () => active.current?.stop() };
}

export function useSpeech() {
  const supported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined";
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (supported) window.speechSynthesis.cancel();
    },
    [supported],
  );

  const speak = (id: string, text: string) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language();
    const done = () =>
      setSpeakingId((current) => (current === id ? null : current));
    utterance.onend = done;
    utterance.onerror = done;
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    if (supported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  };

  return { supported, speakingId, speak, stop };
}
