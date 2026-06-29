"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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

type FormInput = { password: string; confirmPassword: string };

type Props = {
  reason?: string;
};

export function ChangePasswordRequiredForm({ reason }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
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

      const result = await completeRequiredPasswordChange();
      if (!result.success) {
        toast.error(result.error ?? "Failed to complete password change");
        return;
      }

      toast.success("Password changed successfully. Welcome to ALGT ERP.");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  });

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
      <form onSubmit={onSubmit}>
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
            type="submit"
            formAction={signOut}
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
