"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@fluentui/react-components";
import { signIn } from "@/features/auth/login-action";
import { broadcastIdentityChange } from "@/lib/auth/client-session";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Input } from "@/components/ui/input";
import { RequiredLabel } from "@/components/erp/required-label";
import { ControlledFormFeedback } from "@/components/workspace/controlled-form-feedback";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RuntimeAppBranding } from "@/lib/branding/runtime-types";
import { safeAuthDestination } from "@/lib/auth/navigation";

const signupEnabled = process.env.NEXT_PUBLIC_SIGNUP_ENABLED === "true";

export function LoginForm({ branding }: { branding: RuntimeAppBranding }) {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const pending = useRef(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const onSubmit = async (values: LoginInput) => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true); setServiceError(null);
    try {
      const result = await signIn({ email: values.email, password: values.password });
      if (!result.success) {
        setServiceError("Unable to sign in. Check your email and password, or try again later.");
        return;
      }
      toast.success("Signed in successfully");
      broadcastIdentityChange();
      window.location.assign(new URL(safeAuthDestination(searchParams.get("redirectTo")), window.location.origin).href);
    } catch {
      setServiceError("Sign-in service is unavailable. Please try again.");
    } finally {
      pending.current = false; setLoading(false);
    }
  };
  return <Card className="w-full max-w-md">
    <CardHeader>
      <p className="algt-auth-eyebrow">Account access</p>
      <CardTitle><h1>{branding.loginTitle?.trim() || "Sign in"}</h1></CardTitle>
      <CardDescription>{branding.loginSubtitle?.trim() || "Sign in with your work email to continue."}</CardDescription>
    </CardHeader>
    <CardContent>
      <form noValidate onSubmit={event => void handleSubmit(onSubmit)(event)} aria-busy={loading} className="flex flex-col gap-4">
        {errorCode && <p role="alert" className="algt-auth-notice">
          {errorCode === "auth_unavailable" ? "The sign-in service is temporarily unavailable. Please try again." :
            errorCode === "account_mismatch" ? "This link belongs to another account. Sign out, then request and open a new link." :
              "This link is invalid, expired or already used. Request a new password reset, or ask your administrator to resend your invitation."}
        </p>}
        <ControlledFormFeedback errors={errors} labels={{ email: "Email", password: "Password" }} action="signing in" />
        {serviceError && <p role="alert" className="algt-auth-notice">{serviceError}</p>}
        <div className="grid gap-2">
          <RequiredLabel htmlFor="email" required>Email</RequiredLabel>
          <Input id="email" type="email" autoComplete="email" required placeholder="you@company.com" {...register("email")} />
        </div>
        <div className="grid gap-2">
          <RequiredLabel htmlFor="password" required>Password</RequiredLabel>
          <Input id="password" type="password" autoComplete="current-password" required {...register("password")} />
        </div>
        <Button appearance="primary" type="submit" disabled={loading} className="w-full">{loading ? "Signing in…" : "Sign in"}</Button>
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <Link href="/forgot-password" className="text-primary underline underline-offset-4">Forgot password?</Link>
          {signupEnabled && <Link href="/signup" className="text-primary underline underline-offset-4">Create account</Link>}
        </div>
      </form>
    </CardContent>
  </Card>;
}
