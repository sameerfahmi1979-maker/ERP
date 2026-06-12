"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { RoleFormDialog } from "./role-form-dialog";

type AddRoleButtonProps = {
  variant?: "default" | "outline" | "ghost";
};

export function AddRoleButton({ variant = "outline" }: AddRoleButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        className="h-9 text-xs gap-1.5"
        onClick={() => setIsDialogOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Role
      </Button>

      <RoleFormDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}
