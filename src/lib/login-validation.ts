import { z } from "zod";
export const loginEmail = z.string().trim().toLowerCase().email().max(254);
export const loginCode = z
  .string()
  .trim()
  .regex(/^\d{8}$/, "Enter the eight-digit code from your email.");
export type LoginState = {
  email: string;
  step: "email" | "code";
  error?: string;
  message?: string;
  sent?: number;
};
