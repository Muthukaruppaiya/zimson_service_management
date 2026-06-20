import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { InventorySupervisorGuard } from "./components/auth/InventorySupervisorGuard";
import { ModuleRoute } from "./components/auth/ModuleRoute";
import { RequireAuth } from "./components/auth/RequireAuth";
import { AppShell } from "./components/layout/AppShell";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import { WhatsAppSendProvider } from "./components/messaging/WhatsAppSendProvider";
import { BrandsProvider } from "./context/BrandsContext";
import { CustomersProvider } from "./context/CustomersContext";
import { RegionsProvider } from "./context/RegionsContext";
import { SparesProvider } from "./context/SparesContext";
import { SrfJobsProvider } from "./context/SrfJobsContext";
import { DashboardPage } from "./pages/DashboardPage";
import { AccountsSetupPage } from "./pages/accounts/AccountsSetupPage";
import { InvoiceHistoryPage } from "./pages/accounts/InvoiceHistoryPage";
import { LedgerPage } from "./pages/accounts/LedgerPage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { RegionsPage } from "./pages/RegionsPage";
import { QuickBillPage } from "./pages/service/QuickBillPage";
import { QuickBillHistoryPage } from "./pages/service/QuickBillHistoryPage";
import { ServiceModulePage } from "./pages/service/ServiceModulePage";
import { CustomerRegisterPage } from "./pages/service/customers/CustomerRegisterPage";
import { CustomerMasterPage } from "./pages/service/customers/CustomerMasterPage";
import { ServiceBillingPage } from "./pages/service/ServiceBillingPage";
import { ServiceBillingHomePage } from "./pages/service/ServiceBillingHomePage";
import { SrfBookingsRegisterPage } from "./pages/service/SrfBookingsRegisterPage";
import { SrfBookingV2Page } from "./pages/service/SrfBookingV2Page";
import { SrfCustomerRegisterPage } from "./pages/service/SrfCustomerRegisterPage";
import { SrfMasterTablePage } from "./pages/service/SrfMasterTablePage";
import { StoreBillingPage } from "./pages/service/StoreBillingPage";
import { StoreBillingMasterPage } from "./pages/service/StoreBillingMasterPage";
import { StoreDispatchPage } from "./pages/service/StoreDispatchPage";
import { StoreLogisticsHistoryPage } from "./pages/service/StoreLogisticsHistoryPage";
import { StoreAssignPage } from "./pages/service/StoreAssignPage";
import { WatchInventoryPage } from "./pages/service/WatchInventoryPage";
import { ScInwardPage } from "./pages/serviceCentre/ScInwardPage";
import { ScLogisticsHistoryPage } from "./pages/serviceCentre/ScLogisticsHistoryPage";
import { ScLogisticsPage } from "./pages/serviceCentre/ScLogisticsPage";
import { ScOnlineStorePage } from "./pages/serviceCentre/ScOnlineStorePage";
import { ScSupervisorPage } from "./pages/serviceCentre/ScSupervisorPage";
import { ScSrfHistoryPage } from "./pages/serviceCentre/ScSrfHistoryPage";
import { ServiceCentreHomePage } from "./pages/serviceCentre/ServiceCentreHomePage";
import { TechnicianWorkbenchPage } from "./pages/serviceCentre/TechnicianWorkbenchPage";
import { TechnicianMasterPage } from "./pages/serviceCentre/TechnicianMasterPage";
import { UsersPrivilegesPage } from "./pages/UsersPrivilegesPage";
import { UsersListPage } from "./pages/UsersListPage";
import { ServiceTaxSettingsPage } from "./pages/settings/ServiceTaxSettingsPage";
import { MessagingSettingsPage } from "./pages/settings/MessagingSettingsPage";
import { EdocSettingsPage } from "./pages/settings/EdocSettingsPage";
import { ActiveSessionsPage } from "./pages/settings/ActiveSessionsPage";
import { DocumentTemplatesPage } from "./pages/settings/DocumentTemplatesPage";
import { InventoryModulePage } from "./pages/inventory/InventoryModulePage";
import { InventoryPoInwardPage } from "./pages/inventory/InventoryPoInwardPage";
import { InventoryGrnHistoryPage } from "./pages/inventory/InventoryGrnHistoryPage";
import { InventoryPurchaseOrdersPage } from "./pages/inventory/InventoryPurchaseOrdersPage";
import { InventoryPoHistoryPage } from "./pages/inventory/InventoryPoHistoryPage";
import { InventorySuppliersPage } from "./pages/inventory/InventorySuppliersPage";
import { InventorySupplierFormPage } from "./pages/inventory/InventorySupplierFormPage";
import { InventoryPurchaseRequestsPage } from "./pages/inventory/InventoryPurchaseRequestsPage";
import { InventoryPrHistoryPage } from "./pages/inventory/InventoryPrHistoryPage";
import { InventorySpareCatalogPage } from "./pages/inventory/InventorySpareCatalogPage";
import { InventoryBulkImportPage } from "./pages/inventory/InventoryBulkImportPage";
import { InventorySparePriceFixingPage } from "./pages/inventory/InventorySparePriceFixingPage";
import { InventoryStockPriceOverviewPage } from "./pages/inventory/InventoryStockPriceOverviewPage";
import { InventoryStoreStockPage } from "./pages/inventory/InventoryStoreStockPage";
import { InventoryStockAdjustmentPage } from "./pages/inventory/InventoryStockAdjustmentPage";
import { InventoryAllocationReviewPage } from "./pages/inventory/InventoryAllocationReviewPage";
import { InventoryBrandsPage } from "./pages/inventory/InventoryBrandsPage";
import { SrfPhotoCapturePage } from "./pages/public/SrfPhotoCapturePage";
import { QuickBillCapturePage } from "./pages/public/QuickBillCapturePage";
import { SrfTrackingPage } from "./pages/public/SrfTrackingPage";

function RedirectPreserveSearch({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <WhatsAppSendProvider>
      <AuthProvider>
        <RegionsProvider>
          <BrandsProvider>
          <CustomersProvider>
            <SrfJobsProvider>
            <SparesProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/login/reset-password" element={<ResetPasswordPage />} />
            <Route path="/service/srf-capture" element={<SrfPhotoCapturePage />} />
            <Route path="/service/quick-bill-capture" element={<QuickBillCapturePage />} />
            <Route path="/track" element={<SrfTrackingPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route
                  path="/"
                  element={
                    <ModuleRoute module="dashboard">
                      <DashboardPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/accounts/invoice-history"
                  element={
                    <ModuleRoute module="accounts">
                      <InvoiceHistoryPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/accounts/ledger"
                  element={
                    <ModuleRoute module="accounts">
                      <LedgerPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/accounts/setup"
                  element={
                    <ModuleRoute module="accounts">
                      <AccountsSetupPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service"
                  element={
                    <ModuleRoute module="service">
                      <ServiceModulePage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/quick-bill"
                  element={
                    <ModuleRoute module="service">
                      <QuickBillPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/quick-bill/new-customer"
                  element={
                    <ModuleRoute module="service">
                      <SrfCustomerRegisterPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/quick-bill-history"
                  element={
                    <ModuleRoute module="service">
                      <QuickBillHistoryPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/srf"
                  element={
                    <ModuleRoute module="service">
                      <SrfBookingV2Page />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/srf/new-customer"
                  element={
                    <ModuleRoute module="service">
                      <SrfCustomerRegisterPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/srf-register"
                  element={
                    <ModuleRoute module="service">
                      <SrfBookingsRegisterPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/store-dispatch"
                  element={
                    <ModuleRoute module="service">
                      <StoreDispatchPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/store-logistics-history"
                  element={
                    <ModuleRoute module="service">
                      <StoreLogisticsHistoryPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/store-assign"
                  element={
                    <ModuleRoute module="service">
                      <StoreAssignPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/srf-master"
                  element={
                    <ModuleRoute module="service">
                      <SrfMasterTablePage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/store-billing"
                  element={
                    <ModuleRoute module="service">
                      <StoreBillingPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/store-billing-master"
                  element={
                    <ModuleRoute module="service">
                      <StoreBillingMasterPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/watch-inventory"
                  element={
                    <ModuleRoute module="service">
                      <WatchInventoryPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/billing"
                  element={
                    <ModuleRoute module="service">
                      <ServiceBillingHomePage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/billing/create"
                  element={
                    <ModuleRoute module="service">
                      <ServiceBillingPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/billing/register"
                  element={
                    <ModuleRoute module="service">
                      <CustomerRegisterPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/customers/master"
                  element={
                    <ModuleRoute module="service">
                      <CustomerMasterPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/invoicing"
                  element={
                    <ModuleRoute module="service">
                      <RedirectPreserveSearch to="/service/billing/create" />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/customers/register"
                  element={
                    <ModuleRoute module="service">
                      <RedirectPreserveSearch to="/service/billing/register" />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre"
                  element={
                    <ModuleRoute module="service_centre">
                      <ServiceCentreHomePage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/logistics"
                  element={
                    <ModuleRoute module="service_centre">
                      <ScLogisticsPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/logistics-history"
                  element={
                    <ModuleRoute module="service_centre">
                      <ScLogisticsHistoryPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/inward"
                  element={
                    <ModuleRoute module="service_centre">
                      <ScInwardPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/online-store"
                  element={
                    <ModuleRoute module="service_centre">
                      <ScOnlineStorePage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/online-store/order/:orderId"
                  element={
                    <ModuleRoute module="service_centre">
                      <ScOnlineStorePage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/online-store/invoice"
                  element={
                    <ModuleRoute module="service_centre">
                      <ServiceBillingPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/inter-ho-invoice"
                  element={
                    <ModuleRoute module="service_centre">
                      <ServiceBillingPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/srf-history"
                  element={
                    <ModuleRoute module="service_centre">
                      <ScSrfHistoryPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/supervisor"
                  element={
                    <ModuleRoute module="service_centre">
                      <ScSupervisorPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/supervisor/reestimate-sender"
                  element={
                    <ModuleRoute module="service_centre">
                      <ScSupervisorPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/supervisor/srf/:srfId"
                  element={
                    <ModuleRoute module="service_centre">
                      <ScSupervisorPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/technician"
                  element={
                    <ModuleRoute module="service_centre">
                      <TechnicianWorkbenchPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/technicians-master"
                  element={
                    <ModuleRoute module="service_centre">
                      <TechnicianMasterPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service-centre/watch-inventory"
                  element={
                    <ModuleRoute module="service_centre">
                      <WatchInventoryPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryModulePage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/store-stock"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryStoreStockPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/stock-adjustment"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryStockAdjustmentPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/stock-prices"
                  element={
                    <ModuleRoute module="inventory">
                      <InventoryStockPriceOverviewPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/allocation-review"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryAllocationReviewPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/purchase-requests"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryPurchaseRequestsPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/pr-history"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryPrHistoryPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/purchase-orders"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryPurchaseOrdersPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/po-history"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryPoHistoryPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/suppliers"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventorySuppliersPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/suppliers/new"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventorySupplierFormPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/suppliers/:id/edit"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventorySupplierFormPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/po-inward"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryPoInwardPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/grn-history"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryGrnHistoryPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/spares"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventorySpareCatalogPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/bulk-import"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryBulkImportPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/brands"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventoryBrandsPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/spare-price-fixing"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySupervisorGuard>
                        <InventorySparePriceFixingPage />
                      </InventorySupervisorGuard>
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/regions"
                  element={
                    <ModuleRoute module="regions">
                      <RegionsPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <ModuleRoute module="users">
                      <UsersPrivilegesPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/users/list"
                  element={
                    <ModuleRoute module="users">
                      <UsersListPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/settings/tax"
                  element={
                    <ModuleRoute module="settings">
                      <ServiceTaxSettingsPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/settings/messaging"
                  element={
                    <ModuleRoute module="settings">
                      <MessagingSettingsPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/settings/edoc"
                  element={
                    <ModuleRoute module="settings">
                      <EdocSettingsPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/settings/active-sessions"
                  element={
                    <ModuleRoute module="settings">
                      <ActiveSessionsPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/settings/document-templates"
                  element={
                    <ModuleRoute module="settings">
                      <DocumentTemplatesPage />
                    </ModuleRoute>
                  }
                />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
            </SparesProvider>
            </SrfJobsProvider>
          </CustomersProvider>
          </BrandsProvider>
        </RegionsProvider>
      </AuthProvider>
      </WhatsAppSendProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
