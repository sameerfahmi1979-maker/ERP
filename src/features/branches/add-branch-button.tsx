"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

type AddBranchButtonProps = {
  variant?: "default" | "outline" | "ghost";
  companies?: unknown[];
};

export function AddBranchButton({ variant = "outline" }: AddBranchButtonProps) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant={variant}
      className="h-9 text-xs gap-1.5"
      onClick={() => router.push("/admin/branches/record/new")}
    >
      <Plus className="h-3.5 w-3.5" />
      Add Branch
    </Button>
  );
}
