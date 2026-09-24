import { z } from "zod";

export const authEmailSchema = z.string().trim().toLowerCase().max(254).email("Enter a valid email address");

export const loginSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1, "Enter your password").max(1024),
});

export const forgotPasswordSchema = z.object({
  email: authEmailSchema,
});

// USERS.2A — Shared strong password policy for all password-change/set flows.
// Min 10 chars, at least one uppercase, lowercase, and digit.
export const passwordPolicySchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[A-Z]/.test(v), { message: "Password must contain at least one uppercase letter" })
  .refine((v) => /[a-z]/.test(v), { message: "Password must contain at least one lowercase letter" })
  .refine((v) => /[0-9]/.test(v), { message: "Password must contain at least one digit" });

export const signupSchema = z.object({
  email: authEmailSchema,
  password: passwordPolicySchema,
  fullName: z.string().trim().min(2, "Full name is required").max(255),
});

export const changePasswordSchema = z
  .object({
    password: passwordPolicySchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// Updated reset schema uses the strong policy
export const resetPasswordSchema = changePasswordSchema;

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
