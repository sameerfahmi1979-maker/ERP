"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { BranchFormDialog } from "./branch-form-dialog";
import type { OwnerCompany } from "@/types/database";
import { useBranchFormPrefetch } from "./hooks/use-branch-form-prefetch";

type AddBranchButtonProps = {
  variant?: "default" | "outline" | "ghost";
  companies?: OwnerCompany[];
};

export function AddBranchButton({ variant = "outline", companies = [] }: AddBranchButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const prefetchBranchForm = useBranchFormPrefetch();

  useEffect(() => {
    prefetchBranchForm();
  }, [prefetchBranchForm]);

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        className="h-9 text-xs gap-1.5"
        onClick={() => {
          prefetchBranchForm();
          setIsDialogOpen(true);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Branch
      </Button>

      <BranchFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        companies={companies}
      />
    </>
  );
}
