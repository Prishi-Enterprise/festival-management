"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Society } from "@/lib/societies";
import {
  saveSociety,
  uploadSocietyLogo,
  selectSociety,
} from "@/app/societies/actions";
import { Brand } from "./brand";
export function SocietyManager({
  societies,
  superadmin,
}: {
  societies: Society[];
  superadmin: boolean;
}) {
  const [editing, setEditing] = useState<Society | null>(null),
    [creating, setCreating] = useState(false),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <div className="section-heading society-heading">
        <h1>{superadmin ? "Society management" : "Choose your society"}</h1>
        {superadmin && (
          <button
            className="button"
            onClick={() => {
              setEditing(null);
              setCreating(true);
              setMessage("");
            }}
          >
            Add society
          </button>
        )}
      </div>
      <p>
        {superadmin
          ? "Create societies, then open one to invite its society admins and committee."
          : "Your role and festivals are managed separately in each society."}
      </p>
      {(creating || editing) && (
        <section className="panel" key={editing?.id ?? "new"}>
          <h2>{editing ? "Edit society" : "New society"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                try {
                  let logo = editing?.logo_url ?? null,
                    color = editing?.theme_color ?? "#b88724";
                  if (fd.get("remove_logo")) {
                    logo = null;
                    color = "#b88724";
                  }
                  const file = fd.get("logo");
                  if (file instanceof File && file.size) {
                    if (
                      !["image/png", "image/jpeg", "image/webp"].includes(
                        file.type,
                      ) ||
                      file.size > 5 * 1024 * 1024
                    )
                      throw Error(
                        "Choose a PNG, JPEG or WebP image up to 5 MB.",
                      );
                    const bitmap = await createImageBitmap(file);
                    const canvas = document.createElement("canvas");
                    const scale = Math.min(
                      1,
                      256 / Math.max(bitmap.width, bitmap.height),
                    );
                    canvas.width = Math.max(
                      1,
                      Math.round(bitmap.width * scale),
                    );
                    canvas.height = Math.max(
                      1,
                      Math.round(bitmap.height * scale),
                    );
                    const ctx = canvas.getContext("2d")!;
                    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                    bitmap.close();
                    const pixels = ctx.getImageData(
                      0,
                      0,
                      canvas.width,
                      canvas.height,
                    ).data;
                    const buckets = new Map<string, number>();
                    for (let i = 0; i < pixels.length; i += 16) {
                      const [r, g, b, a] = pixels.slice(i, i + 4);
                      if (
                        a < 128 ||
                        (Math.max(r, g, b) > 245 && Math.min(r, g, b) > 220) ||
                        Math.max(r, g, b) - Math.min(r, g, b) < 25
                      )
                        continue;
                      const key = [r, g, b]
                        .map((x) =>
                          Math.min(240, Math.round(x / 24) * 24)
                            .toString(16)
                            .padStart(2, "0"),
                        )
                        .join("");
                      buckets.set(key, (buckets.get(key) ?? 0) + 1);
                    }
                    color =
                      "#" +
                      ([...buckets].sort((a, b) => b[1] - a[1])[0]?.[0] ??
                        "b88724");
                    const blob = await new Promise<Blob>((resolve, reject) =>
                      canvas.toBlob(
                        (b) =>
                          b
                            ? resolve(b)
                            : reject(Error("Could not process logo.")),
                        "image/png",
                      ),
                    );
                    const upload = new FormData();
                    upload.set("logo", blob, "logo.png");
                    const result = await uploadSocietyLogo(upload);
                    if (!result.ok || !result.path) throw Error(result.error);
                    logo = result.path;
                  }
                  const result = await saveSociety({
                    id: editing?.id ?? null,
                    version: editing?.version ?? 0,
                    name: fd.get("name"),
                    logo_url: logo,
                    theme_color: color,
                  });
                  if (!result.ok) throw Error(result.error);
                  setEditing(null);
                  setCreating(false);
                  setMessage(
                    "Society saved. Open it to configure admins, blocks and festivals.",
                  );
                  router.refresh();
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "Could not save.",
                  );
                }
              });
            }}
          >
            <fieldset disabled={pending}>
              <div className="form-grid">
                <label>
                  Society name
                  <input
                    name="name"
                    defaultValue={editing?.name}
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
                <label>
                  Society logo
                  <input
                    type="file"
                    name="logo"
                    accept="image/png,image/jpeg,image/webp"
                  />
                  <small>
                    Optional. Theme color is picked automatically from the logo.
                  </small>
                </label>
              </div>
              {editing?.logo_url && (
                <label className="checkbox-row">
                  <input type="checkbox" name="remove_logo" />
                  Remove existing logo and restore default theme
                </label>
              )}
              <div className="form-actions">
                <button className="button">
                  {pending ? "Saving…" : "Save society"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setEditing(null);
                    setCreating(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="society-grid">
        {societies.map((s) => (
          <section className="panel society-card" key={s.id}>
            <Brand society={s} />
            <p>
              {superadmin
                ? "Platform access"
                : s.role === "admin"
                  ? "Society admin"
                  : "Committee member"}
            </p>
            <div className="form-actions">
              <form action={selectSociety}>
                <input type="hidden" name="society_id" value={s.id} />
                <button className="button">Open society</button>
              </form>
              {superadmin && (
                <button
                  className="button secondary"
                  onClick={() => {
                    setEditing(s);
                    setCreating(false);
                    setMessage("");
                  }}
                >
                  Edit details
                </button>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
