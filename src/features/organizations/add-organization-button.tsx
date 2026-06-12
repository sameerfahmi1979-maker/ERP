"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { OrganizationFormDialog } from "./organization-form-dialog";

type AddOrganizationButtonProps = {
  variant?: "default" | "outline" | "ghost";
};

export function AddOrganizationButton({ variant = "outline" }: AddOrganizationButtonProps) {
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
        Add Organization
      </Button>

      <OrganizationFormDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}
