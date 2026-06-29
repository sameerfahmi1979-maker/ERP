import { SignupForm } from "@/features/auth/signup-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// ERP USERS.1 — Signup gate. Disabled by default (SIGNUP_ENABLED not set = false).
const signupEnabled = process.env.SIGNUP_ENABLED === "true";

export default function SignupPage() {
  if (!signupEnabled) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Registration Disabled</CardTitle>
          <CardDescription>
            Self-registration is not available. Please contact your administrator to be invited.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  return <SignupForm />;
}
