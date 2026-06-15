"use client";

import type { NumberingRule } from "@/features/numbering/numbering-types";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  Pencil,
  Power,
  Lock,
  Unlock,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { toggleNumberingRuleActive, toggleNumberingRuleLock } from "@/server/actions/numbering";
import { toast } from "sonner";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

const BASE = "/admin/settings/numbering";

type NumberingRulesTableProps = {
  rules: NumberingRule[];
};

export function NumberingRulesTable({ rules }: NumberingRulesTableProps) {
  const router = useRouter();

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (rule: NumberingRule) => router.push(`${BASE}/record/${rule.id}`);
  const handleEdit = (rule: NumberingRule) => router.push(`${BASE}/record/${rule.id}?mode=edit`);

  const handleToggleActive = async (rule: NumberingRule) => {
    const result = await toggleNumberingRuleActive(rule.id, !rule.is_active);
    if (result.success) {
      toast.success(`Rule ${rule.is_active ? "deactivated" : "activated"} successfully`);
    } else {
      toast.error(result.error ?? "Failed to toggle rule status");
    }
  };

  const handleToggleLock = async (rule: NumberingRule) => {
    const result = await toggleNumberingRuleLock(rule.id, !rule.is_locked);
    if (result.success) {
      toast.success(`Rule ${rule.is_locked ? "unlocked" : "locked"} successfully`);
    } else {
      toast.error(result.error ?? "Failed to toggle rule lock");
    }
  };

  const columns: ColumnDef<NumberingRule>[] = [
    {
      accessorKey: "rule_code",
      header: "Rule Code",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.rule_name}</span>
          <span className="text-xs text-muted-foreground">{row.original.rule_code}</span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "Rule Code",
        exportValue: (row) => row.rule_code,
      },
    },
    {
      accessorKey: "module_code",
      header: "Module",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{row.original.module_name}</span>
          <span className="text-xs text-muted-foreground">{row.original.module_code}</span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "Module",
        exportValue: (row) => row.module_name,
      },
    },
    {
      accessorKey: "document_type_code",
      header: "Document Type",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{row.original.document_type_name}</span>
          <span className="text-xs text-muted-foreground">{row.original.document_type_code}</span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "Document Type",
        exportValue: (row) => row.document_type_name,
      },
    },
    {
      accessorKey: "document_prefix",
      header: "Prefix",
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono text-xs">
          {row.original.document_prefix}
        </Badge>
      ),
      meta: {
        exportable: true,
        exportHeader: "Prefix",
        exportValue: (row) => row.document_prefix,
      },
    },
    {
      accessorKey: "format_template",
      header: "Format",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.format_template}</span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Format Template",
        exportValue: (row) => row.format_template,
      },
    },
    {
      id: "next_preview",
      header: "Next Number Preview",
      cell: ({ row }) => {
        const rule = row.original;
        const seq = rule.next_sequence_number.toString().padStart(rule.sequence_length, rule.padding_character);
        const preview = rule.format_template
          .replace("{DOC}", rule.document_prefix)
          .replace("{SEQ}", seq)
          .replace("{SEQ3}", rule.next_sequence_number.toString().padStart(3, "0"))
          .replace("{SEQ4}", rule.next_sequence_number.toString().padStart(4, "0"))
          .replace("{SEQ5}", rule.next_sequence_number.toString().padStart(5, "0"))
          .replace("{SEQ6}", rule.next_sequence_number.toString().padStart(6, "0"))
          .replace("{SEQ12}", rule.next_sequence_number.toString().padStart(12, "0"));
        return (
          <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
            {preview}
          </span>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Next Number Preview",
        exportValue: (row) => {
          const seq = row.next_sequence_number.toString().padStart(row.sequence_length, row.padding_character);
          return row.format_template.replace("{DOC}", row.document_prefix).replace("{SEQ}", seq);
        },
      },
    },
    {
      accessorKey: "current_sequence_number",
      header: "Current Seq",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.current_sequence_number}</span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Current Sequence",
        exportValue: (row) => row.current_sequence_number,
      },
    },
    {
      accessorKey: "next_sequence_number",
      header: "Next Seq",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold">{row.original.next_sequence_number}</span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Next Sequence",
        exportValue: (row) => row.next_sequence_number,
      },
    },
    {
      accessorKey: "reset_policy",
      header: "Reset Policy",
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-xs">
          {row.original.reset_policy}
        </Badge>
      ),
      meta: {
        exportable: true,
        exportHeader: "Reset Policy",
        exportValue: (row) => row.reset_policy,
      },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => {
        const isActive = row.original.is_active;
        const isLocked = row.original.is_locked;
        return (
          <div className="flex gap-1">
            <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
              {isActive ? "Active" : "Inactive"}
            </Badge>
            {isLocked && (
              <Badge variant="destructive" className="text-xs">
                <Lock className="h-3 w-3" />
              </Badge>
            )}
          </div>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Status",
        exportValue: (row) => (row.is_active ? "Active" : "Inactive") + (row.is_locked ? " (Locked)" : ""),
      },
    },
    {
      accessorKey: "updated_at",
      header: "Updated At",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.updated_at), "yyyy-MM-dd HH:mm")}
        </span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Updated At",
        exportValue: (row) => row.updated_at,
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const rule = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => handleView(rule)}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleEdit(rule)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => handleToggleActive(rule)}>
                  <Power className="h-4 w-4 mr-2" />
                  {rule.is_active ? "Deactivate" : "Activate"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToggleLock(rule)}>
                  {rule.is_locked ? (
                    <>
                      <Unlock className="h-4 w-4 mr-2" />
                      Unlock
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Lock
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      meta: {
        exportable: false,
      },
    },
  ];

  return (
    <ERPDataTable<NumberingRule>
      tableId="numbering_rules_table"
      columns={columns}
      data={rules}
      enableSorting={true}
      enableColumnResizing={true}
      enableRowSelection={true}
      enableColumnVisibility={true}
      enablePreferences={true}
      searchPlaceholder="Search rules by code, name, module, or prefix..."
      enableGlobalFilter={true}
      initialPageSize={25}
      exportConfig={{
        title: "Numbering Rules",
        subtitle: `${rules.length} rule${rules.length !== 1 ? "s" : ""} configured`,
        filename: "numbering-rules",
        orientation: "landscape",
      }}
      toolbarSlot={
        <Button onClick={handleAdd} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Numbering Rule
        </Button>
      }
    />
  );
}
