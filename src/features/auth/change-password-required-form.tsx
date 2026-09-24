"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { changePasswordSchema } from "@/lib/validation/auth";
import { completeRequiredPasswordChange } from "@/server/actions/users/account-security";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequiredLabel } from "@/components/erp/required-label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { signOut } from "@/features/auth/actions";
import { navigateAfterIdentityChange } from "@/lib/auth/client-session";

type FormInput = { password: string; confirmPassword: string };

type Props = {
  reason?: string;
};

export function ChangePasswordRequiredForm({ reason }: Props) {
  const [loading, setLoading] = useState(false);
  const operationId = useRef<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = async (values: FormInput) => {
    setLoading(true);
    try {
      operationId.current ??= crypto.randomUUID();
      const result = await completeRequiredPasswordChange({ newPassword: values.password, operationId: operationId.current });
      if (!result.success) {
        if (result.canStartNewAttempt) operationId.current = null;
        toast.error(result.error ?? "Password change could not complete.");
        return;
      }
      toast.success("Password changed successfully. Welcome to ALGT ERP.");
      navigateAfterIdentityChange("/dashboard");
    } catch {
      toast.error("The request was interrupted. Please sign in again before trying another password change.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <CardTitle>Password change required</CardTitle>
        <CardDescription>
          You must set a new password before continuing.
        </CardDescription>
        {reason ? (
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium">Reason:</span> {reason}
          </p>
        ) : null}
      </CardHeader>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Password must be at least 10 characters and include at least one uppercase letter, one lowercase letter, and one digit.
          </p>
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="password" required>New password</RequiredLabel>
            <Input
              id="password"
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
            <RequiredLabel htmlFor="confirmPassword" required>Confirm new password</RequiredLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Set new password"}
          </Button>
          <Button
            type="button"
            onClick={async () => {
              const result = await signOut();
              if (!result.success) toast.error(result.error);
              else navigateAfterIdentityChange();
            }}
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            Sign out
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
