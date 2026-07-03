"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
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
import type { RuntimeAppBranding } from "@/lib/branding/runtime-types";

const signupEnabled = process.env.NEXT_PUBLIC_SIGNUP_ENABLED === "true";

type LoginFormProps = {
  branding: RuntimeAppBranding;
};

export function LoginForm({ branding }: LoginFormProps) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const logoUrl = branding.assets.app_logo?.publicUrl ?? null;
  const title = branding.loginTitle?.trim() || branding.appName;
  const subtitle =
    branding.loginSubtitle?.trim() ||
    branding.tagline ||
    "Access your ERP workspace with Supabase Auth.";

  const onSubmit = handleSubmit(async (values) => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    toast.success("Signed in successfully");

    await new Promise((resolve) => setTimeout(resolve, 100));

    window.location.href = "/start";
  });

  return (
    <Card className="w-full max-w-md shadow-lg border-border/80 bg-card/95 backdrop-blur-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-col items-center text-center gap-3">
          {logoUrl ? (
            <div className="relative h-16 w-40">
              <Image
                src={logoUrl}
                alt={branding.appName}
                fill
                unoptimized
                priority
                className="object-contain"
              />
            </div>
          ) : (
            <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-lg font-bold text-primary-foreground">
                {branding.initials}
              </span>
            </div>
          )}
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription className="mt-1">{subtitle}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="email" required>
              Email
            </RequiredLabel>
            <Input id="email" type="email" autoComplete="email" required {...register("email")} />
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="password" required>
              Password
            </RequiredLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <div className="flex w-full justify-between text-sm">
            <Link href="/forgot-password" className="text-primary hover:underline">
              Forgot password?
            </Link>
            {signupEnabled && (
              <Link href="/signup" className="text-primary hover:underline">
                Create account
              </Link>
            )}
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
