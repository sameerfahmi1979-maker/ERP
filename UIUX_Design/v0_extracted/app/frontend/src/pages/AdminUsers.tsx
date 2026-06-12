import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPDataToolbar } from "@/components/erp/data-toolbar";
import { ERPStatusBadge } from "@/components/erp/status-badge";
import { ERPActionMenu } from "@/components/erp/action-menu";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { ERPSectionCard } from "@/components/erp/section-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, Edit, Trash2, Eye, Mail, Shield } from "lucide-react";

// Demo data
const demoUsers = [
  { id: "1", name: "Sameer Fahmi", email: "sameer@alliancegulf.com", role: "Super Admin", department: "Management", status: "active" as const, lastLogin: "2 min ago" },
  { id: "2", name: "Ahmed Al Rashid", email: "ahmed.r@alliancegulf.com", role: "Fleet Manager", department: "Operations", status: "active" as const, lastLogin: "1 hr ago" },
  { id: "3", name: "Fatima Hassan", email: "fatima.h@alliancegulf.com", role: "HR Manager", department: "Human Resources", status: "active" as const, lastLogin: "3 hrs ago" },
  { id: "4", name: "Mohammed Ali", email: "m.ali@alliancegulf.com", role: "Workshop Lead", department: "Workshop", status: "active" as const, lastLogin: "Today" },
  { id: "5", name: "Sarah Khan", email: "sarah.k@alliancegulf.com", role: "Finance Officer", department: "Finance", status: "pending" as const, lastLogin: "Never" },
  { id: "6", name: "Omar Youssef", email: "omar.y@alliancegulf.com", role: "HSE Officer", department: "HSE", status: "active" as const, lastLogin: "Yesterday" },
  { id: "7", name: "Layla Ibrahim", email: "layla.i@alliancegulf.com", role: "Procurement", department: "Supply Chain", status: "inactive" as const, lastLogin: "2 weeks ago" },
  { id: "8", name: "Khalid Nasser", email: "khalid.n@alliancegulf.com", role: "Driver", department: "Operations", status: "suspended" as const, lastLogin: "1 month ago" },
];

const roleColors: Record<string, string> = {
  "Super Admin": "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  "Fleet Manager": "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  "HR Manager": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  "Workshop Lead": "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  "Finance Officer": "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  "HSE Officer": "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  "Procurement": "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-800",
  "Driver": "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800",
};

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const filteredUsers = demoUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );

  const toggleUser = (id: string) => {
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((uid) => uid !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map((u) => u.id));
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        <ERPPageHeader
          title="User Management"
          description="Manage system users, roles, and access permissions"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Administration", href: "/admin/users" },
            { label: "Users" },
          ]}
          actions={
            <Button size="sm" className="h-9 text-xs gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              Add User
            </Button>
          }
        />

        <ERPSectionCard noPadding>
          <div className="px-5 pt-4">
            <ERPDataToolbar
              searchPlaceholder="Search users by name, email, or role..."
              searchValue={search}
              onSearchChange={setSearch}
              showExport
              actions={
                selectedUsers.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {selectedUsers.length} selected
                  </Badge>
                )
              }
            />
          </div>

          {filteredUsers.length === 0 ? (
            <ERPEmptyState
              title="No users found"
              description="Try adjusting your search or filter criteria"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/40">
                  <TableHead className="w-10 pl-5">
                    <Checkbox
                      checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">User</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Role</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Department</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Last Login</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className="border-border/30 hover:bg-muted/30">
                    <TableCell className="pl-5">
                      <Checkbox
                        checked={selectedUsers.includes(user.id)}
                        onCheckedChange={() => toggleUser(user.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                            {user.name.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] font-medium px-2 py-0.5 ${roleColors[user.role] || ""}`}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.department}</TableCell>
                    <TableCell>
                      <ERPStatusBadge status={user.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{user.lastLogin}</TableCell>
                    <TableCell>
                      <ERPActionMenu
                        items={[
                          { label: "View Profile", icon: Eye },
                          { label: "Edit User", icon: Edit },
                          { label: "Send Email", icon: Mail },
                          { label: "Manage Roles", icon: Shield },
                          { label: "Delete User", icon: Trash2, variant: "destructive", separator: true },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="px-5 py-3 border-t border-border/30 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {filteredUsers.length} of {demoUsers.length} users
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled>Previous</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs">Next</Button>
            </div>
          </div>
        </ERPSectionCard>
      </div>
    </AppLayout>
  );
}