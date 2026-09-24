"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { changePasswordSchema } from "@/lib/validation/auth";
import { changeOwnPassword } from "@/server/actions/users/account-security";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequiredLabel } from "@/components/erp/required-label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KeyRound } from "lucide-react";

type FormInput = { password: string; confirmPassword: string };

export function ChangePasswordCard() {
  const [loading, setLoading] = useState(false);
  const operationId = useRef<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = async (values: FormInput) => {
    setLoading(true);
    try {
      operationId.current ??= crypto.randomUUID();
      const result = await changeOwnPassword({ newPassword: values.password, operationId: operationId.current });
      if (!result.success) {
        if (result.canStartNewAttempt) operationId.current = null;
        toast.error(result.error ?? "Password change could not complete.");
        return;
      }
      toast.success("Password changed successfully.");
      reset();
      operationId.current = null;
    } catch {
      toast.error("The request was interrupted. Please sign in again before trying another password change.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <CardTitle className="text-base">Change Password</CardTitle>
          <CardDescription className="text-sm">
            Must be 10+ characters with uppercase, lowercase, and digit.
          </CardDescription>
        </div>
      </CardHeader>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="profile-password" required>New password</RequiredLabel>
            <Input
              id="profile-password"
              type="password"
              autoComplete="new-password"
              required
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="profile-confirmPassword" required>Confirm new password</RequiredLabel>
            <Input
              id="profile-confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            ) : null}
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Update password"}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
