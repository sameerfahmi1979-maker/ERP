"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (authError) {
        toast.error(authError.message);
        return;
      }

      const result = await changeOwnPassword(null);
      if (!result.success) {
        toast.error(result.error ?? "Password updated in auth but lifecycle update failed.");
        return;
      }

      toast.success("Password changed successfully.");
      reset();
    } finally {
      setLoading(false);
    }
  });

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
      <form onSubmit={onSubmit}>
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
