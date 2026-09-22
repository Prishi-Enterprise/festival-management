export type Member = {
  user_id: string;
  email: string;
  display_name: string;
  role: "admin" | "committee";
  can_view_reports: boolean;
  can_manage_finance?: boolean;
  active: boolean;
  version: number;
};
export type Invitation = {
  id: string;
  email: string;
  role: "admin" | "committee";
  can_view_reports: boolean;
  can_manage_finance?: boolean;
  status: string;
  expires_at: string;
  created_at: string;
};
export type Festival = {
  id: string;
  name: string;
  start_date: string;
  day_count: number;
  status: "draft" | "ready";
  version: number;
  created_at: string;
};
export type Day = {
  day_number: number;
  service_date: string;
  label: string;
};
export type Rates = {
  child_min_age?: number;
  child_max_age?: number;
  fixed: number;
  adult: number;
  child: number;
  under_seven: number;
  guest: number | null;
  household_policy: "unconfirmed" | "all_residents";
  guest_age_policy: "unconfirmed" | "same_rate" | "under_seven_free";
};
export type Flat = {
  id: string;
  block: string;
  flat_number: string;
  active?: boolean;
};
export type FestivalDetail = Festival & {
  days: Day[];
  rates: Rates;
  flat_ids: string[];
  member_ids: string[];
  pricing_version: number;
};
