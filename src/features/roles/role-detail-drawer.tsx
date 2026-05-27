"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Users, Building2, MapPin } from "lucide-react";
import type { Role, UserProfile, OwnerCompany, Branch } from "@/types/database";
import { getRoleWithUsersAction } from "@/server/actions/roles";

type RoleDetailDrawerProps = {
  roleId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type RoleWithUsers = {
  role: Role;
  assigned_users: Array<{
    user_role_id: number;
    user_profile: UserProfile;
    owner_company: OwnerCompany | null;
    branch: Branch | null;
    assigned_at: string;
    is_active: boolean;
  }>;
};

export function RoleDetailDrawer({ roleId, open, onOpenChange }: RoleDetailDrawerProps) {
  const [data, setData] = useState<RoleWithUsers | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && roleId) {
      setIsLoading(true);
      getRoleWithUsersAction(roleId)
        .then((result) => {
          if (result.success && result.data) {
            setData(result.data);
          } else {
            setData(null);
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      setData(null);
    }
  }, [roleId, open]);

  const getScopeDisplay = (
    companyId: number | null,
    branchId: number | null,
    companyName?: string,
    branchName?: string
  ) => {
    if (branchId && branchName) {
      return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span>{branchName}</span>
        </div>
      );
    }
    if (companyId && companyName) {
      return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3" />
          <span>{companyName}</span>
        </div>
      );
    }
    return (
      <Badge variant="outline" className="text-xs">
        Global
      </Badge>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : data ? (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <SheetTitle className="text-xl">{data.role.role_name}</SheetTitle>
                  <SheetDescription className="mt-1">
                    {data.role.description || "No description available"}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-6 py-6">
              {/* Role Details */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Role Information</h3>
                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Role Code</p>
                    <p className="font-mono text-sm">{data.role.role_code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <div className="mt-1">
                      <Badge variant={data.role.is_system_role ? "default" : "secondary"}>
                        {data.role.is_system_role ? "System" : "Custom"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="mt-1">
                      <Badge variant={data.role.is_active ? "default" : "secondary"}>
                        {data.role.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                  {data.role.role_category && (
                    <div>
                      <p className="text-xs text-muted-foreground">Category</p>
                      <p className="text-sm">{data.role.role_category}</p>
                    </div>
                  )}
                  {data.role.role_level && (
                    <div>
                      <p className="text-xs text-muted-foreground">Level</p>
                      <p className="text-sm">{data.role.role_level}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Assignable</p>
                    <p className="text-sm">{data.role.is_assignable ? "Yes" : "No"}</p>
                  </div>
                </div>
              </div>

              {/* Assigned Users */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <h3 className="text-sm font-medium">
                    Assigned Users ({data.assigned_users.length})
                  </h3>
                </div>

                {data.assigned_users.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No users assigned to this role
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.assigned_users.map((assignment) => (
                      <div
                        key={assignment.user_role_id}
                        className="flex items-start justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">
                              {assignment.user_profile.full_name || "Unnamed User"}
                            </p>
                            {!assignment.is_active && (
                              <Badge variant="secondary" className="text-xs">
                                Inactive
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3">
                            {assignment.user_profile.job_title && (
                              <span className="text-xs text-muted-foreground">
                                {assignment.user_profile.job_title}
                              </span>
                            )}
                            {assignment.user_profile.department && (
                              <span className="text-xs text-muted-foreground">
                                {assignment.user_profile.department}
                              </span>
                            )}
                          </div>
                          <div className="mt-2">
                            {getScopeDisplay(
                              assignment.owner_company?.id ?? null,
                              assignment.branch?.id ?? null,
                              assignment.owner_company?.legal_name_en,
                              assignment.branch?.branch_name_en
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {new Date(assignment.assigned_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {data.role.notes && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Notes</h3>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {data.role.notes}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Role not found</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
