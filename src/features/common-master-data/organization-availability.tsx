import { Label } from "@/components/ui/label";

export function OrganizationAvailability({ value, onChange, savedShared, editable }: {
  value: boolean;
  onChange: (shared: boolean) => void;
  savedShared: boolean;
  editable: boolean;
}) {
  return (
    <div className="col-span-12 sm:col-span-6 space-y-1.5">
      <Label htmlFor="available_to_all_organizations">Availability</Label>
      <select id="available_to_all_organizations" name="available_to_all_organizations"
        value={value ? "all" : "own"} onChange={event => onChange(event.target.value === "all")}
        disabled={!editable || savedShared} aria-describedby="organization-availability-help"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground disabled:opacity-60">
        <option value="own">Owning organization</option>
        <option value="all">All Organizations</option>
      </select>
      <p id="organization-availability-help" className="text-xs text-muted-foreground">
        {savedShared
          ? "Shared assignments are retained. The original organization and branch still control record and document access."
          : "All Organizations keeps this record available for future assignments. Record and document access still use the owning organization and branch."}
      </p>
    </div>
  );
}
