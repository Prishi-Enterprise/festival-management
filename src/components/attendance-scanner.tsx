"use client";
import { useEffect, useRef, useState } from "react";
import { parsePassCode } from "@/lib/pass-code";
export function AttendanceScanner({
  onScan,
}: {
  onScan: (pass: { kind: "resident" | "guest"; code: string }) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    controls = useRef<{ stop: () => void } | null>(null),
    generation = useRef(0);
  const [active, setActive] = useState(false),
    [message, setMessage] = useState("");
  const stop = () => {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    setActive(false);
  };
  useEffect(
    () => () => {
      generation.current++;
      controls.current?.stop();
    },
    [],
  );
  const read = (value: string) => {
    const pass = parsePassCode(value, window.location.origin);
    if (!pass) {
      setMessage("Use a resident or guest pass from this website.");
      return;
    }
    setMessage("");
    onScan(pass);
  };
  return (
    <section className="panel no-print">
      <h2>Scan attendance pass</h2>
      <p>
        Select the day and meal above, scan a resident or guest QR, then confirm
        the arrival count below.
      </p>
      <video
        ref={video}
        muted
        playsInline
        className="qr-camera"
        hidden={!active}
      />
      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          disabled={active}
          onClick={async () => {
            setMessage("");
            setActive(true);
            const run = ++generation.current;
            try {
              const { BrowserQRCodeReader } = await import("@zxing/browser");
              if (run !== generation.current) return;
              const scanner = new BrowserQRCodeReader();
              const c = await scanner.decodeFromConstraints(
                {
                  video: { facingMode: { ideal: "environment" } },
                  audio: false,
                },
                video.current!,
                (result, _error, c) => {
                  if (result && run === generation.current) {
                    c.stop();
                    stop();
                    read(result.getText());
                  }
                },
              );
              if (run !== generation.current) c.stop();
              else controls.current = c;
            } catch {
              if (run === generation.current) {
                stop();
                setMessage(
                  "Camera unavailable. Allow camera access or paste the pass link below.",
                );
              }
            }
          }}
        >
          Scan QR with camera
        </button>
        {active && (
          <button type="button" className="button secondary" onClick={stop}>
            Stop camera
          </button>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          stop();
          read(String(new FormData(e.currentTarget).get("pass")));
        }}
      >
        <label>
          Or paste a pass link
          <input
            name="pass"
            type="url"
            required
            placeholder="Resident or guest pass link"
          />
        </label>
        <button className="button secondary">Find pass</button>
      </form>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
