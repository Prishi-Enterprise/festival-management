"use client";
import { useEffect, useRef } from "react";
import { Ellipsis } from "lucide-react";
import { PassShare } from "./pass-share";

export function GuestPassMenu({
  url,
  festival,
  flat,
  code,
  paymentUrl,
  onEdit,
  kind = "guest",
}: {
  url: string;
  festival: string;
  flat: string;
  code: string;
  paymentUrl?: string;
  onEdit?: () => void;
  kind?: "guest" | "resident";
}) {
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
        root.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      ref={root}
      className="guest-pass-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape" && root.current) {
          root.current.open = false;
          root.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={`Pass actions for ${flat}`} title="Pass actions">
        <Ellipsis size={22} aria-hidden="true" />
      </summary>
      <div className="guest-pass-menu-content">
        <PassShare showOpen url={url} festival={festival} kind={kind} />
        {paymentUrl && (
          <a className="button secondary" href={paymentUrl}>
            Record linked payment
          </a>
        )}
        {onEdit && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              if (root.current) root.current.open = false;
              onEdit();
            }}
          >
            Edit registration
          </button>
        )}
        <small className="guest-menu-code">Pass code: {code}</small>
      </div>
    </details>
  );
}
