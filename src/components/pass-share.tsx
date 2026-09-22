"use client";
import { useState } from "react";

export function PassShare({
  url,
  festival,
}: {
  url: string;
  festival: string;
}) {
  const [message, setMessage] = useState("");
  return (
    <div className="pass-share">
      <div className="entry-actions">
        <button
          type="button"
          className="text-button"
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
          className="text-link"
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
