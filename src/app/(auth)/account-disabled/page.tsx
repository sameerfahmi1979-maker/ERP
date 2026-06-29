import { signOut } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ShieldOff } from "lucide-react";

export default function AccountDisabledPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldOff className="h-6 w-6" />
        </div>
        <CardTitle>Account Disabled</CardTitle>
        <CardDescription>
          Your account is not active. Please contact your administrator.
        </CardDescription>
      </CardHeader>
      <CardContent />
      <CardFooter className="justify-center">
        <form action={signOut}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
