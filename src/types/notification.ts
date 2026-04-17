export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: "inventory_pr" | "service_dc";
  isRead: boolean;
  createdAt: string;
};
