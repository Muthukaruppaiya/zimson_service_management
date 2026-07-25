export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: "inventory_pr" | "service_dc" | "service_srf";
  isRead: boolean;
  createdAt: string;
};
