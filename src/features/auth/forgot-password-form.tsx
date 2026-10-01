"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/server/actions/users/account-security";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ControlledFormFeedback } from "@/components/workspace/controlled-form-feedback";
import { RequiredLabel } from "@/components/erp/required-label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ForgotInput = { email: string };

export function ForgotPasswordForm() {
  const flight = useRef(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (values: ForgotInput) => {
    if (flight.current) return;
    flight.current = true;
    setServiceError(null);
    setLoading(true);
    try {
      // Server action handles ERP-branded email via Supabase admin API.
      // Always returns success — never reveals whether email exists.
      await requestPasswordReset(values.email);
      setSubmitted(true);
      toast.success("Request received. If eligible, your account will receive reset instructions.");
    } catch {
      setServiceError("Your request could not reach the service. Please try again later.");
        toast.error("Your request could not reach the service. Please try again later.");
    } finally {
      flight.current = false;
      setLoading(false);
    }
  };
  if (submitted) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle><h1>Check your email</h1></CardTitle>
          <CardDescription>
            If your account is eligible, you will receive password reset instructions.
            Check your inbox and junk folder. If nothing arrives, contact your administrator.
          </CardDescription>
        </CardHeader>
        <CardContent />
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle><h1>Forgot password</h1></CardTitle>
        <CardDescription>We will email you a secure reset link.</CardDescription>
      </CardHeader>
      <form noValidate onSubmit={event => void handleSubmit(onSubmit)(event)}>
        <div className="px-6"><ControlledFormFeedback errors={errors} labels={{ email: "Email" }} action="requesting a reset" />{serviceError && <p role="alert" className="mb-4 text-sm text-destructive">{serviceError}</p>}</div>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="email" required>Email</RequiredLabel>
            <Input id="email" type="email" required {...register("email")} />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </Button>
          <Link href="/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
