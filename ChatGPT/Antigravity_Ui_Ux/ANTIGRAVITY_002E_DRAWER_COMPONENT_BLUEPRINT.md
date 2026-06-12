# ANTIGRAVITY_002E_DRAWER_COMPONENT_BLUEPRINT — Drawer Component Blueprint

This blueprint outlines the API specifications and component interfaces for the polished `ERPDrawerForm` library.

---

## 1. ERPDrawerForm Interface Specifications

### A. Root Container (`ERPDrawerForm`)
Main container wrapper managing Radix state overlays.

```tsx
interface ERPDrawerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  mode?: "add" | "edit" | "view" | "draft" | "approval";
  status?: string; // e.g. "active", "inactive"
  recordNumber?: string; // e.g. "ORG-102"
  children: React.ReactNode;
  onPrint?: () => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onExportCSV?: () => void;
  onSendEmail?: () => void;
}
```

### B. Sticky Actions Footer (`ERPDrawerFooter`)
Fixed footer providing validation summary lists and draft action triggers.

```tsx
interface ERPDrawerFooterProps {
  onCancel: () => void;
  onSubmit: (e: any) => void;
  isSubmitting?: boolean;
  hasUnsavedChanges?: boolean;
  draftSaveText?: string;
  submitText?: string;
  onSaveDraft?: () => void;
  validationErrorsCount?: number;
}
```

### C. Sidebar Section Switcher (`ERPDrawerSectionNav`)
Left navigation panel linking directly to layout anchor IDs.

```tsx
interface ERPDrawerSectionNavProps {
  sections: { id: string; label: string; icon: React.ComponentType<any> }[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  auditInfo?: {
    createdBy?: string;
    updatedBy?: string;
    updatedAt?: string;
  };
}
```

---

## 2. Component Composition Pattern

To assemble a new sliding drawer form:

```tsx
import { 
  ERPDrawerForm, 
  ERPDrawerSectionNav, 
  ERPDrawerBody, 
  ERPDrawerSection, 
  ERPFieldGrid, 
  ERPDrawerFooter 
} from "@/components/erp/erp-drawer-form";
import { User } from "lucide-react";

export function CustomFormDrawer({ open, onOpenChange }) {
  const [activeSection, setActiveSection] = useState("basic");
  
  return (
    <ERPDrawerForm open={open} onOpenChange={onOpenChange} title="Create Profile">
      <form onSubmit={handleSubmit} className="flex flex-grow h-full overflow-hidden">
        <ERPDrawerSectionNav 
          sections={[{ id: "basic", label: "Basic Details", icon: User }]}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
        />
        <div className="flex-1 flex flex-col">
          <ERPDrawerBody>
            <ERPDrawerSection id="basic" activeId={activeSection} title="Identification Details">
              <ERPFieldGrid>
                {/* Inputs go here */}
              </ERPFieldGrid>
            </ERPDrawerSection>
          </ERPDrawerBody>
          <ERPDrawerFooter onCancel={() => onOpenChange(false)} onSubmit={handleSubmit} />
        </div>
      </form>
    </ERPDrawerForm>
  );
}
```
---
*Check out the modular code in [erp-drawer-form.tsx](file:///c:/dev/agt-erp/src/components/erp/erp-drawer-form.tsx) for direct implementation details.*
