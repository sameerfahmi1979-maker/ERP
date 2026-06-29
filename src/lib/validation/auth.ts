import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signupSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

// USERS.2A — Shared strong password policy for all password-change/set flows.
// Min 10 chars, at least one uppercase, lowercase, and digit.
export const passwordPolicySchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .refine((v) => /[A-Z]/.test(v), { message: "Password must contain at least one uppercase letter" })
  .refine((v) => /[a-z]/.test(v), { message: "Password must contain at least one lowercase letter" })
  .refine((v) => /[0-9]/.test(v), { message: "Password must contain at least one digit" });

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
