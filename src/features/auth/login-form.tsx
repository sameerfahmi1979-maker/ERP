"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequiredLabel } from "@/components/erp/required-label";
import type { RuntimeAppBranding } from "@/lib/branding/runtime-types";

const signupEnabled = process.env.NEXT_PUBLIC_SIGNUP_ENABLED === "true";

type LoginFormProps = {
  branding: RuntimeAppBranding;
};

export function LoginForm({ branding }: LoginFormProps) {
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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

  // Page-load entrance — floats the card contents gently into view.
  // Skipped entirely when the user prefers reduced motion.
  useEffect(() => {
    if (!cardRef.current) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const ctx = gsap.context(() => {
      if (prefersReducedMotion) {
        gsap.set("[data-auth-reveal]", { opacity: 1, y: 0 });
        return;
      }
      gsap.set("[data-auth-reveal]", { opacity: 0, y: 22 });
      gsap.to("[data-auth-reveal]", {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.08,
        delay: 0.1,
      });
    }, cardRef);

    return () => ctx.revert();
  }, []);

  // Subtle pointer-driven 3D tilt — desktop pointer devices only, and only
  // when the user does not prefer reduced motion.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const card = cardRef.current;
    const canTilt =
      window.matchMedia("(pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canTilt || !wrapper || !card) return;

    const handleMove = (e: PointerEvent) => {
      const rect = wrapper.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - 0.5;
      const relY = (e.clientY - rect.top) / rect.height - 0.5;
      gsap.to(card, {
        rotateY: relX * 5,
        rotateX: relY * -5,
        transformPerspective: 1000,
        duration: 0.5,
        ease: "power2.out",
      });
    };
    const handleLeave = () => {
      gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.6, ease: "power3.out" });
    };

    wrapper.addEventListener("pointermove", handleMove);
    wrapper.addEventListener("pointerleave", handleLeave);
    return () => {
      wrapper.removeEventListener("pointermove", handleMove);
      wrapper.removeEventListener("pointerleave", handleLeave);
    };
  }, []);

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
    <div ref={wrapperRef} className="w-full max-w-md [perspective:1200px]">
      <div
        ref={cardRef}
        className="relative w-full rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)] backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-amber-400/70 before:to-transparent [transform-style:preserve-3d]"
      >
        <div className="flex flex-col items-center gap-3 px-8 pt-9 pb-2 text-center">
          {logoUrl ? (
            <div data-auth-reveal className="relative h-14 w-36">
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
            <div
              data-auth-reveal
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 shadow-[0_10px_30px_-8px_rgba(245,165,36,0.55)]"
            >
              <span className="text-lg font-bold">{branding.initials}</span>
            </div>
          )}

          <div
            data-auth-reveal
            className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-amber-300/90 [font-family:var(--font-auth-mono)]"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-amber-400/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
            </span>
            Secure sign-in
          </div>

          <h1
            data-auth-reveal
            className="text-3xl leading-tight font-bold tracking-tight text-white [font-family:var(--font-auth-display)]"
          >
            {title}
          </h1>
          <p data-auth-reveal className="max-w-xs text-sm text-white/55">
            {subtitle}
          </p>
        </div>

        <div
          data-auth-reveal
          className="mx-8 my-5 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />

        <form onSubmit={onSubmit} className="px-8 pb-8">
          <div data-auth-reveal className="flex flex-col gap-1.5">
            <RequiredLabel
              htmlFor="email"
              required
              className="text-xs font-medium tracking-wide text-white/60 uppercase"
            >
              Email
            </RequiredLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              className="h-10 border-white/15 bg-white/[0.04] text-white placeholder:text-white/30 focus-visible:border-amber-400/60 focus-visible:ring-amber-400/25"
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-xs text-red-400">{errors.email.message}</p>
            ) : null}
          </div>

          <div data-auth-reveal className="mt-4 flex flex-col gap-1.5">
            <RequiredLabel
              htmlFor="password"
              required
              className="text-xs font-medium tracking-wide text-white/60 uppercase"
            >
              Password
            </RequiredLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="h-10 border-white/15 bg-white/[0.04] text-white placeholder:text-white/30 focus-visible:border-amber-400/60 focus-visible:ring-amber-400/25"
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-xs text-red-400">{errors.password.message}</p>
            ) : null}
          </div>

          <Button
            type="submit"
            disabled={loading}
            data-auth-reveal
            className="group/submit mt-6 h-10 w-full justify-center gap-2 rounded-lg bg-amber-400 text-sm font-semibold text-slate-900 shadow-[0_12px_30px_-10px_rgba(245,165,36,0.6)] hover:bg-amber-300 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
            {!loading && (
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/submit:translate-x-0.5" />
            )}
          </Button>

          <div
            data-auth-reveal
            className="mt-5 flex w-full items-center justify-between text-xs text-white/50"
          >
            <Link href="/forgot-password" className="hover:text-amber-300 hover:underline">
              Forgot password?
            </Link>
            {signupEnabled && (
              <Link href="/signup" className="hover:text-amber-300 hover:underline">
                Create account
              </Link>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
