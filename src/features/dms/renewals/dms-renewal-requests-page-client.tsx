"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DmsRenewalRequestsTable } from "./dms-renewal-requests-table";

export function DmsRenewalRequestsPageClient() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Renewal Requests</h1>
        <p className="text-sm text-muted-foreground">
          Track and manage document renewal workflows.
        </p>
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <DmsRenewalRequestsTable filter={{ includeCompleted: false }} />
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          <DmsRenewalRequestsTable filter={{ includeCompleted: true, status: "renewed" }} />
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <DmsRenewalRequestsTable filter={{ includeCompleted: true }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
