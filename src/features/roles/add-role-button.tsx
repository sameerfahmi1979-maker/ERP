"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

type AddRoleButtonProps = {
  variant?: "default" | "outline" | "ghost";
};

export function AddRoleButton({ variant = "outline" }: AddRoleButtonProps) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant={variant}
      className="h-9 text-xs gap-1.5"
      onClick={() => router.push("/admin/roles/record/new")}
    >
      <Plus className="h-3.5 w-3.5" />
      Add Role
    </Button>
  );
}
