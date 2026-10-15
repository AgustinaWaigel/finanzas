"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Send, Square } from "lucide-react";
import type { Interpreted } from "./schema";

// Reconocimiento de voz del navegador (Chrome, Edge, Safari). No está en los tipos estándar.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
function recognitionClass() {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => Recognition)
    | undefined;
}

// Dictar o escribir una frase y dejar que la IA complete el formulario.
// Nunca guarda: la persona revisa los campos y toca Guardar.
export function VoiceFill({
  interpret,
  apply,
}: {
  interpret: (text: string) => Promise<Interpreted>;
  apply: (result: Interpreted) => string | void;
}) {
  const [supported, setSupported] = useState(false),
    [listening, setListening] = useState(false),
    [thinking, setThinking] = useState(false),
    [text, setText] = useState(""),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const heard = useRef("");
  useEffect(() => {
    setSupported(!!recognitionClass());
    return () => recognition.current?.abort();
  }, []);
  async function send(phrase: string) {
    const clean = phrase.trim();
    if (!clean || thinking) return;
    setThinking(true);
    setFailed(false);
    setMessage("");
    try {
      const note = apply(await interpret(clean));
      setMessage(note || "Listo. Revisá los datos y guardá.");
      setText("");
    } catch (e) {
      setFailed(true);
      setMessage((e as Error).message || "No se pudo interpretar.");
    } finally {
      setThinking(false);
    }
  }
  function toggle() {
    if (listening) return recognition.current?.stop();
    const Class = recognitionClass();
    if (!Class) return;
    const r = new Class();
    r.lang = "es-AR";
    r.interimResults = true;
    r.continuous = false;
    heard.current = "";
    r.onresult = (event) => {
      heard.current = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      setText(heard.current);
    };
    r.onerror = (event) => {
      setFailed(true);
      setMessage(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "El navegador no tiene permiso para usar el micrófono. Podés escribir la frase."
          : event.error === "no-speech"
            ? "No escuché nada. Probá de nuevo o escribí la frase."
            : "No se pudo usar el dictado. Escribí la frase.",
      );
    };
    r.onend = () => {
      setListening(false);
      if (heard.current.trim()) void send(heard.current);
    };
    recognition.current = r;
    setFailed(false);
    setMessage("");
    setText("");
    setListening(true);
    r.start();
  }
  return (
    <div className="voice-fill">
      <div className="voice-row">
        {supported && (
          <button
            type="button"
            className={`voice-button ${listening ? "listening" : ""}`}
            aria-pressed={listening}
            aria-label={listening ? "Dejar de escuchar" : "Dictar el movimiento"}
            disabled={thinking}
            onClick={toggle}
          >
            {listening ? <Square size={18} /> : <Mic size={20} />}
          </button>
        )}
        <input
          aria-label="Decilo con tus palabras"
          placeholder={
            listening
              ? "Te escucho…"
              : "Decilo: “gasté 2500 en el súper con Mercado Pago”"
          }
          value={text}
          maxLength={500}
          enterKeyHint="send"
          disabled={thinking}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void send(text);
          }}
        />
        <button
          type="button"
          className="voice-send"
          aria-label="Interpretar la frase"
          disabled={thinking || listening || !text.trim()}
          onClick={() => void send(text)}
        >
          <Send size={17} />
        </button>
      </div>
      <p
        className={failed ? "form-error" : "voice-status"}
        role="status"
        aria-live="polite"
      >
        {thinking
          ? "Interpretando…"
          : message ||
            "La IA completa el formulario; vos revisás y guardás."}
      </p>
    </div>
  );
}
