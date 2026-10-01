"use client";

import { navigateAfterIdentityChange } from "@/lib/auth/client-session";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { recordPasswordResetCompleted } from "@/server/actions/users/account-security";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ControlledFormFeedback } from "@/components/workspace/controlled-form-feedback";
import { RequiredLabel } from "@/components/erp/required-label";
import { PasswordReverification } from "./password-reverification";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ResetInput = { password: string; confirmPassword: string };

export function ResetPasswordForm({ flow = "recovery" }: { flow?: "invite" | "recovery" }) {
  const invitation = flow === "invite";
  const flight = useRef(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const operationId = useRef<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ResetInput>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = async (values: ResetInput) => {
    if (flight.current) return;
    flight.current = true;
    setServiceError(null);
    setLoading(true);
    try {
      operationId.current ??= crypto.randomUUID();
      const result = await recordPasswordResetCompleted({ newPassword: values.password, operationId: operationId.current });
      if (!result.success) {
        if (result.canStartNewAttempt) operationId.current = null;
        if (result.requiresFreshSignIn) { reset(); setNeedsVerification(true); return; }
        setServiceError(result.error ?? "Password change could not complete.");
        toast.error(result.error ?? "Password change could not complete.");
        return;
      }
      toast.success(invitation ? "Password created. Your account setup is complete." : "Password updated");
      navigateAfterIdentityChange("/dashboard");
    } catch {
      setServiceError("The request was interrupted. Please sign in again before trying another password change.");
        toast.error("The request was interrupted. Please sign in again before trying another password change.");
    } finally {
      flight.current = false;
      setLoading(false);
    }
  };

  if (needsVerification) return <PasswordReverification mode="recovery" />;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle><h1>{invitation ? "Create your password" : "Reset password"}</h1></CardTitle>
        <CardDescription>
          {invitation && "Welcome. Create your own password to finish account setup. You do not need an existing password. "}
          Enter your new password. Must be 10+ characters with uppercase, lowercase, and digit.
          {" Common or previously exposed passwords may be rejected. Finish in this browser within 15 minutes of verification."}
        </CardDescription>
      </CardHeader>
      <form noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <div className="px-6"><ControlledFormFeedback errors={errors} labels={{ password: "New password", confirmPassword: "Confirm password" }} action="continuing" />{serviceError && <p role="alert" className="mb-4 text-sm text-destructive">{serviceError}</p>}</div>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="password" required>New password</RequiredLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              {...register("password")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="confirmPassword" required>Confirm password</RequiredLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              {...register("confirmPassword")}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? (invitation ? "Creating..." : "Updating...") : invitation ? "Create password" : "Update password"}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
