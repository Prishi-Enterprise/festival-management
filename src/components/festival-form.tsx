"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CalendarDays,
  IndianRupee,
  Building2,
  UsersRound,
  ArrowLeft,
  Save,
} from "lucide-react";
import Link from "next/link";
import { saveFestival } from "@/app/admin/actions";
import { makeDays, rupeesToPaise } from "@/lib/validation";
import type { Day, FestivalDetail, Flat, Member } from "@/lib/types";
import { BlockManager } from "./block-manager";
const sections = [
  { id: "details", label: "Details & charges", icon: IndianRupee },
  { id: "calendar", label: "Festival days", icon: CalendarDays },
  { id: "flats", label: "Participating flats", icon: Building2 },
  { id: "committee", label: "Committee", icon: UsersRound },
];
export function FestivalForm({
  festival,
  flats,
  members,
  today,
}: {
  festival?: FestivalDetail;
  flats: Flat[];
  members: Member[];
  today: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("details");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState(festival?.name || "");
  const [startDate, setStartDate] = useState(festival?.start_date || today);
  const [count, setCount] = useState(festival?.day_count || 10);
  const [days, setDays] = useState<Day[]>(
    festival?.days || makeDays(today, 10),
  );
  const [flatIds, setFlatIds] = useState<string[]>(festival?.flat_ids || []);
  const [memberIds, setMemberIds] = useState<string[]>(
    festival?.member_ids || [],
  );
  const [rates, setRates] = useState({
    fixed: String((festival?.rates.fixed ?? 250000) / 100),
    adult: String((festival?.rates.adult ?? 120000) / 100),
    child: String((festival?.rates.child ?? 60000) / 100),
    guest:
      festival?.rates.guest == null ? "" : String(festival.rates.guest / 100),
  });
  const [householdPolicy, setHouseholdPolicy] = useState(
    festival?.rates.household_policy || "unconfirmed",
  );
  const [guestPolicy, setGuestPolicy] = useState(
    festival?.rates.guest_age_policy || "unconfirmed",
  );
  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }
  function submit(status: "draft" | "ready") {
    setError("");
    setNotice("");
    let parsedRates;
    try {
      parsedRates = {
        fixed: rupeesToPaise(rates.fixed),
        adult: rupeesToPaise(rates.adult),
        child: rupeesToPaise(rates.child),
        guest: rates.guest.trim() === "" ? null : rupeesToPaise(rates.guest),
        under_seven: 0,
        household_policy: householdPolicy,
        guest_age_policy: guestPolicy,
      };
    } catch (e) {
      setError((e as Error).message);
      setTab("details");
      return;
    }
    start(async () => {
      const result = await saveFestival({
        id: festival?.id,
        version: festival?.version || 0,
        name,
        start_date: startDate,
        day_count: count,
        days,
        rates: parsedRates,
        flat_ids: flatIds,
        member_ids: memberIds,
        status,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!festival) router.push(`/admin/festivals/${result.id}`);
      else {
        setNotice(
          status === "ready"
            ? "Festival setup is ready. No financial charges have been posted."
            : "Draft saved.",
        );
        router.refresh();
      }
    });
  }
  return (
    <>
      <Link href="/admin/festivals" className="back-link">
        <ArrowLeft size={15} />
        All festivals
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {festival ? "FESTIVAL SETTINGS" : "MAKE ROOM FOR CELEBRATION"}
          </p>
          <h1>{festival?.name || "Create a festival"}</h1>
          <p className="muted">
            Set the foundations. You can save your progress as a draft.
          </p>
        </div>
        <span className="badge">
          {festival?.status === "ready" ? "Setup ready" : "Draft"}
          {festival ? ` · Revision ${festival.version}` : ""}
        </span>
      </div>
      <div
        className="editor-tabs"
        role="tablist"
        aria-label="Festival settings"
      >
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={tab === id ? "selected" : ""}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      <div
        className="editor-body"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "details" && (
          <>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>The essentials</h2>
                  <p className="small muted">
                    Give your festival a name and a place on the calendar.
                  </p>
                </div>
                <span className="section-number">01</span>
              </div>
              <div className="form-grid">
                <label className="span-two">
                  Festival name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Navratri 2026"
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  Start date
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setDays(makeDays(e.target.value, count));
                    }}
                  />
                </label>
                <label>
                  Number of days
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={count}
                    onChange={(e) => {
                      const n = Math.min(
                        31,
                        Math.max(1, Number(e.target.value)),
                      );
                      setCount(n);
                      setDays(makeDays(startDate, n));
                    }}
                  />
                </label>
              </div>
              <p className="tiny muted">
                Changing the start date or day count rebuilds the calendar.
                Review the Festival days tab before saving.
              </p>
            </section>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Contributions</h2>
                  <p className="small muted">
                    Amounts in rupees. Package contributions are for the whole
                    meal package.
                  </p>
                </div>
                <span className="section-number">02</span>
              </div>
              <div className="form-grid">
                {[
                  {
                    key: "fixed" as const,
                    label: "Fixed contribution / flat",
                    note: "Shared arrangements and included meals",
                  },
                  {
                    key: "adult" as const,
                    label: "Adult meal package / person",
                    note: "Above 10 years · services selected in the meal calendar",
                  },
                  {
                    key: "child" as const,
                    label: "Child meal package / person",
                    note: "Ages 7–10, inclusive",
                  },
                  {
                    key: "guest" as const,
                    label: "Default guest meal / person",
                    note: "Leave blank until the rate is agreed",
                  },
                ].map(({ key, label, note }) => (
                  <label key={key}>
                    {label}
                    <div className="money-input">
                      <span>₹</span>
                      <input
                        inputMode="decimal"
                        value={rates[key]}
                        onChange={(e) =>
                          setRates({ ...rates, [key]: e.target.value })
                        }
                        placeholder={key === "guest" ? "Not configured" : "0"}
                        aria-label={label}
                      />
                    </div>
                    <small>{note}</small>
                  </label>
                ))}
              </div>
              <div className="included-note">
                <Check size={17} />
                <div>
                  <strong>Children under seven: ₹0</strong>
                  <span>
                    Free contribution; still included in attendance and catering
                    counts.
                  </span>
                </div>
              </div>
            </section>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Meal coverage</h2>
                  <p className="small muted">
                    Keep unresolved rules as unconfirmed while drafting.
                  </p>
                </div>
                <span className="section-number">03</span>
              </div>
              <div className="form-grid">
                <label>
                  Fixed fee includes
                  <select
                    value={householdPolicy}
                    onChange={(e) =>
                      setHouseholdPolicy(
                        e.target.value as typeof householdPolicy,
                      )
                    }
                  >
                    <option value="unconfirmed">
                      Household coverage unconfirmed
                    </option>
                    <option value="all_residents">
                      All registered residents of the flat
                    </option>
                  </select>
                </label>
                <label>
                  Guest age policy
                  <select
                    value={guestPolicy}
                    onChange={(e) =>
                      setGuestPolicy(e.target.value as typeof guestPolicy)
                    }
                  >
                    <option value="unconfirmed">
                      Guest age policy unconfirmed
                    </option>
                    <option value="same_rate">
                      Same guest rate for all ages
                    </option>
                    <option value="under_seven_free">
                      Under-seven guests are free
                    </option>
                  </select>
                </label>
              </div>
              <p className="small muted">
                After saving the festival, add named meals and configure their
                daily coverage in the Meal coverage by day section below. No day
                range is hardcoded.
              </p>
            </section>
          </>
        )}
        {tab === "calendar" && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>{count} days of celebration</h2>
                <p className="small muted">
                  Set dates and day names. Dates must stay in order.
                </p>
              </div>
              <CalendarDays size={22} />
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Date</th>
                    <th>Day name</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day, index) => (
                    <tr key={day.day_number}>
                      <td>
                        <span className="day-number">
                          {String(day.day_number).padStart(2, "0")}
                        </span>
                      </td>
                      <td>
                        <input
                          type="date"
                          aria-label={`Day ${day.day_number} date`}
                          value={day.service_date}
                          onChange={(e) =>
                            setDays(
                              days.map((d, i) =>
                                i === index
                                  ? { ...d, service_date: e.target.value }
                                  : d,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Day ${day.day_number} name`}
                          value={day.label}
                          maxLength={60}
                          onChange={(e) =>
                            setDays(
                              days.map((d, i) =>
                                i === index
                                  ? { ...d, label: e.target.value }
                                  : d,
                              ),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {tab === "flats" && (
          <>
            <BlockManager flats={flats} />
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Participating homes</h2>
                  <p className="small muted">
                    {flatIds.length} flats selected for this festival.
                  </p>
                </div>
                <button
                  className="button secondary small-button"
                  onClick={() =>
                    setFlatIds(
                      flatIds.length === flats.length
                        ? []
                        : flats.map((f) => f.id),
                    )
                  }
                >
                  {flatIds.length === flats.length && flats.length
                    ? "Clear selection"
                    : "Select all"}
                </button>
              </div>
              {[...new Set(flats.map((f) => f.block))].sort().map((block) => (
                <div className="flat-group" key={block}>
                  <h3>Block {block}</h3>
                  <div className="flat-grid">
                    {flats
                      .filter((f) => f.block === block)
                      .map((f) => (
                        <label
                          className={`choice-chip ${flatIds.includes(f.id) ? "checked" : ""}`}
                          key={f.id}
                        >
                          <input
                            type="checkbox"
                            checked={flatIds.includes(f.id)}
                            onChange={() => setFlatIds(toggle(flatIds, f.id))}
                          />
                          {f.flat_number}
                        </label>
                      ))}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
        {tab === "committee" && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>The people behind the celebration</h2>
                <p className="small muted">
                  Assign onboarded members. Admins can access every festival.
                </p>
              </div>
              <Link href="/admin/users" className="text-link">
                Manage people →
              </Link>
            </div>
            {members
              .filter((m) => m.active)
              .map((member) => (
                <label className="member-choice" key={member.user_id}>
                  <input
                    type="checkbox"
                    checked={memberIds.includes(member.user_id)}
                    onChange={() =>
                      setMemberIds(toggle(memberIds, member.user_id))
                    }
                  />
                  <span className="avatar">
                    {(member.display_name || member.email)[0].toUpperCase()}
                  </span>
                  <span>
                    <strong>{member.display_name || member.email}</strong>
                    <small>{member.email}</small>
                  </span>
                  <span className="badge">{member.role}</span>
                </label>
              ))}
          </section>
        )}
      </div>
      <div className="save-bar">
        <span>
          {festival
            ? `Pricing version ${festival.pricing_version}. Changes keep earlier rates in history.`
            : "Nothing is posted to the accounts during setup."}
        </span>
        <div>
          <button
            className="button secondary"
            onClick={() => submit("draft")}
            disabled={pending}
          >
            <Save size={16} />
            {pending ? "Saving…" : "Save draft"}
          </button>
          <button
            className="button"
            disabled={pending}
            onClick={() => submit("ready")}
          >
            <Check size={16} />
            Mark setup ready
          </button>
        </div>
      </div>
    </>
  );
}
