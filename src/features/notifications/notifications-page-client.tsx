"use client";

import { useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MyNotificationsTable } from "./my-notifications-table";
import type { NotificationRow } from "@/server/actions/notifications/notifications";
import {
  getMyNotifications,
  markAllMyNotificationsRead,
} from "@/server/actions/notifications/notifications";

interface NotificationsPageClientProps {
  initialNotifications: NotificationRow[];
  unreadCount: number;
}

export function NotificationsPageClient({
  initialNotifications,
  unreadCount: initialUnreadCount,
}: NotificationsPageClientProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await getMyNotifications({ limit: 200 });
      if (result.success && result.data) {
        setNotifications(result.data);
        setUnreadCount(result.data.filter((n) => n.status === "unread").length);
      }
    });
  }, []);

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const result = await markAllMyNotificationsRead();
      if (result.success) {
        toast.success(`${result.data?.count ?? 0} notifications marked as read`);
        refresh();
      } else {
        toast.error(result.error ?? "Failed");
      }
    });
  };

  const filtered =
    activeTab === "unread"
      ? notifications.filter((n) => n.status === "unread")
      : activeTab === "dismissed"
      ? notifications.filter((n) => n.status === "dismissed")
      : notifications;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}` : "All caught up"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleMarkAllRead} disabled={loading}>
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({notifications.length})</TabsTrigger>
          <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <MyNotificationsTable notifications={filtered} onRefresh={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
