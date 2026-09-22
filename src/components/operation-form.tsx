"use client";
import { FlatSelector, type FlatOption } from "./flat-selector";
import { useRef, useState, useTransition } from "react";
import { saveOperation } from "@/app/desk/operations-actions";
import type { Operation } from "@/lib/operations";
import { rupeesToPaise } from "@/lib/validation";
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "date"
    | "number"
    | "money"
    | "checkbox"
    | "select"
    | "cutoff"
    | "flat";
  flats?: FlatOption[];
  options?: { value: string; label: string }[];
  required?: boolean;
  max?: number;
  min?: number;
  hint?: string;
};
export function OperationForm({
  operation,
  base,
  fields,
  title,
  button = "Save",
  compact = false,
  onSaved,
}: {
  operation: Operation;
  base: Record<string, unknown>;
  fields: Field[];
  title?: string;
  button?: string;
  compact?: boolean;
  onSaved?: (saved: Record<string, unknown>) => void;
}) {
  const request = useRef<string | null>(null);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState(String(base.category ?? ""));
  return (
    <form
      className={compact ? "operation-inline" : "operation-form"}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const input = { ...base };
        if (!input.id && !["allocation"].includes(operation)) {
          request.current ??= crypto.randomUUID();
          input.id = request.current;
        }
        try {
          for (const f of fields) {
            const value = String(fd.get(f.name) ?? "");
            input[f.name] =
              f.type === "checkbox"
                ? fd.has(f.name)
                : f.type === "number"
                  ? Number(value)
                  : f.type === "money"
                    ? rupeesToPaise(value)
                    : f.type === "cutoff"
                      ? value
                        ? new Date(value + "+05:30").toISOString()
                        : null
                      : value;
          }
          if (input.category !== "Other" && "category_other" in input)
            input.category_other = "";
        } catch {
          setNotice("Check the amounts and date/time values.");
          return;
        }
        start(async () => {
          const result = await saveOperation(operation, input);
          if (!result.ok) {
            setNotice(result.error ?? "Could not save.");
            return;
          }
          setNotice("Saved.");
          request.current = null;
          onSaved?.(input);
        });
      }}
    >
      {title && <h3>{title}</h3>}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <fieldset disabled={pending}>
        <div className={compact ? "entry-actions" : "form-grid"}>
          {fields.map((f) => {
            if (f.name === "category_other" && category !== "Other")
              return null;
            const value = base[f.name];
            if (f.type === "flat")
              return (
                <FlatSelector
                  key={f.name}
                  flats={f.flats ?? []}
                  name={f.name}
                  label={f.label}
                  defaultValue={String(value ?? "")}
                  required={f.required !== false}
                />
              );
            return (
              <label
                key={f.name}
                className={f.type === "checkbox" ? "check-label" : ""}
              >
                {f.label}
                {f.type === "select" ? (
                  <select
                    name={f.name}
                    required={f.required !== false}
                    defaultValue={String(value ?? "")}
                    onChange={
                      f.name === "category"
                        ? (e) => setCategory(e.target.value)
                        : undefined
                    }
                  >
                    <option value="">Choose…</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "checkbox" ? (
                  <input
                    name={f.name}
                    type="checkbox"
                    defaultChecked={Boolean(value)}
                  />
                ) : (
                  <input
                    name={f.name}
                    type={
                      f.type === "money" || f.type === "number"
                        ? "number"
                        : f.type === "cutoff"
                          ? "datetime-local"
                          : (f.type ?? "text")
                    }
                    required={
                      f.name === "category_other" || f.required === true
                    }
                    defaultValue={
                      f.type === "money"
                        ? Number(value ?? 0) / 100
                        : f.type === "cutoff"
                          ? value
                            ? new Date(
                                new Date(String(value)).getTime() + 330 * 60000,
                              )
                                .toISOString()
                                .slice(0, 16)
                            : ""
                          : String(value ?? (f.type === "number" ? 0 : ""))
                    }
                    min={
                      f.min ??
                      (f.name === "sequence"
                        ? 1
                        : f.type === "money" || f.type === "number"
                          ? 0
                          : undefined)
                    }
                    max={
                      f.type === "money"
                        ? 1000000
                        : f.type === "number"
                          ? (f.max ?? 500)
                          : undefined
                    }
                    step={
                      f.type === "money"
                        ? "0.01"
                        : f.type === "number"
                          ? 1
                          : undefined
                    }
                    maxLength={
                      f.type === "text" || !f.type ? (f.max ?? 120) : undefined
                    }
                  />
                )}{" "}
                {f.hint && <small>{f.hint}</small>}
              </label>
            );
          })}
        </div>
        <button className="button secondary" disabled={pending}>
          {pending ? "Saving…" : button}
        </button>
      </fieldset>
    </form>
  );
}
