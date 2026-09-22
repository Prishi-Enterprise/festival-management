"use client";
import { useState } from "react";

export type FlatOption = {
  id: string;
  block: string;
  flat_number: string;
  active?: boolean;
};

export function FlatSelector({
  flats,
  name = "flat_id",
  label = "Flat",
  value,
  defaultValue = "",
  onChange,
  required = true,
  disabled = false,
}: {
  flats: FlatOption[];
  name?: string;
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const [selection, setSelection] = useState(defaultValue);
  const selected = value ?? selection;
  const selectedFlat = flats.find((f) => f.id === selected);
  const [chosenBlock, setChosenBlock] = useState(selectedFlat?.block ?? "");
  const block = selectedFlat?.block ?? chosenBlock;
  const available = flats.filter(
    (f) => f.active !== false || f.id === selected,
  );
  const blocks = [...new Set(available.map((f) => f.block))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  function select(id: string) {
    setSelection(id);
    onChange?.(id);
  }
  return (
    <div className="flat-selector">
      <label>
        {label === "Host flat" ? "Host block" : "Block"}
        <select
          value={block}
          required={required}
          disabled={disabled}
          onChange={(e) => {
            setChosenBlock(e.target.value);
            select("");
          }}
        >
          <option value="">Choose block</option>
          {blocks.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label>
        {label === "Host flat" ? "Host flat number" : "Flat number"}
        <select
          name={name}
          value={selected}
          required={required}
          disabled={disabled || !block}
          onChange={(e) => select(e.target.value)}
        >
          <option value="">
            {block ? "Choose flat" : "Choose block first"}
          </option>
          {available
            .filter((f) => f.block === block)
            .sort((a, b) =>
              a.flat_number.localeCompare(b.flat_number, undefined, {
                numeric: true,
              }),
            )
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.flat_number}
                {f.active === false ? " · Inactive" : ""}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
