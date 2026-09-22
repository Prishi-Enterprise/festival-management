"use client";
import { useState } from "react";

export function PassShare({
  url,
  festival,
  showOpen = false,
}: {
  url: string;
  festival: string;
  showOpen?: boolean;
}) {
  const [message, setMessage] = useState("");
  return (
    <div className="pass-share">
      <div className="pass-share-actions">
        {showOpen && (
          <a
            className="button secondary"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            Open pass
          </a>
        )}
        <button
          type="button"
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setMessage("Guest pass link copied.");
            } catch {
              setMessage(`Copy this link: ${url}`);
            }
          }}
        >
          Copy pass link
        </button>
        <a
          className="button secondary"
          target="_blank"
          rel="noreferrer"
          href={`https://wa.me/?text=${encodeURIComponent(`Your guest pass for ${festival}: ${url}`)}`}
        >
          Share on WhatsApp
        </a>
      </div>
      {message && (
        <p role="status" className="tiny">
          {message}
        </p>
      )}
    </div>
  );
}
