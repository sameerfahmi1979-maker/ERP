"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function AddUserDialog() {
  const router = useRouter();
  return (
    <Button size="sm" className="h-9 text-xs gap-1.5 font-semibold" onClick={() => router.push("/admin/users/record/new")}>
      <Plus className="h-3.5 w-3.5" />
      Add User
    </Button>
  );
}
