"use client";
import { useState } from "react";
import type { Service } from "@/lib/operations";
import { OperationForm } from "./operation-form";

export function GuestRegistrationCutoff({ services }: { services: Service[] }) {
  const [selected, setSelected] = useState(services[0]?.id ?? "");
  const service = services.find((item) => item.id === selected);
  if (!service) return null;
  return (
    <section className="panel finance-form">
      <label>
        Meal for guest registration cutoff
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {services.map((item) => (
            <option key={item.id} value={item.id}>
              {item.service_date} · {item.meal}
            </option>
          ))}
        </select>
      </label>
      <OperationForm
        key={service.id + service.version}
        title="Guest registration cutoff"
        operation="meal_access"
        base={{
          id: service.id,
          version: service.version,
          locked: service.attendance_locked,
          cutoff: service.booking_cutoff,
        }}
        fields={[
          {
            name: "locked",
            label: "Close guest registration",
            type: "checkbox",
          },
          {
            name: "cutoff",
            label: "Booking cutoff (India time)",
            type: "cutoff",
          },
          { name: "reason", label: "Reason", max: 300, required: true },
        ]}
      />
    </section>
  );
}
