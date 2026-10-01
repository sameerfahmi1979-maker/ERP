"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SignupForm() {
  const router = useRouter();
  const flight = useRef(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (values: SignupInput) => {
    if (flight.current) return;
    flight.current = true;
    setServiceError(null);
    setLoading(true);
    try {
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.fullName, display_name: values.fullName },
      },
    });


    if (error) {
      setServiceError("Account creation could not complete. Ask your administrator for an invitation.");
      return;
    }

    toast.success("Account created. Check your email if confirmation is enabled.");
    router.push("/login");
    router.refresh();
    } catch { setServiceError("The service could not be reached. Please try again later."); }
    finally { flight.current = false; setLoading(false); }
  };
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle><h1>Create account</h1></CardTitle>
        <CardDescription>
          Create your account using your work email.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert>
          <AlertTitle>Account registration</AlertTitle>
          <AlertDescription>
            If your organization uses invitations, open the invitation from your administrator instead.
          </AlertDescription>
        </Alert>
        <form noValidate onSubmit={event => void handleSubmit(onSubmit)(event)} className="flex flex-col gap-4">
        <div className=""><ControlledFormFeedback errors={errors} labels={{ fullName: "Full name", email: "Email", password: "Password" }} action="continuing" />{serviceError && <p role="alert" className="mb-4 text-sm text-destructive">{serviceError}</p>}</div>
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="fullName" required>Full name</RequiredLabel>
            <Input id="fullName" required {...register("fullName")} />
          </div>
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="email" required>Email</RequiredLabel>
            <Input id="email" type="email" required {...register("email")} />
          </div>
          <div className="flex flex-col gap-2">
            <RequiredLabel htmlFor="password" required>Password</RequiredLabel>
            <Input id="password" type="password" required {...register("password")} />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
