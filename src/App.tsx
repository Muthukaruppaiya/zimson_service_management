import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ModuleRoute } from "./components/auth/ModuleRoute";
import { RequireAuth } from "./components/auth/RequireAuth";
import { AppShell } from "./components/layout/AppShell";
import { AuthProvider } from "./context/AuthContext";
import { BrandsProvider } from "./context/BrandsContext";
import { CustomersProvider } from "./context/CustomersContext";
import { RegionsProvider } from "./context/RegionsContext";
import { SparesProvider } from "./context/SparesContext";
import { SrfJobsProvider } from "./context/SrfJobsContext";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { RegionsPage } from "./pages/RegionsPage";
import { QuickBillPage } from "./pages/service/QuickBillPage";
import { ServiceModulePage } from "./pages/service/ServiceModulePage";
import { CustomerRegisterPage } from "./pages/service/customers/CustomerRegisterPage";
import { ServiceBillingPage } from "./pages/service/ServiceBillingPage";
import { SrfBookingV2Page } from "./pages/service/SrfBookingV2Page";
import { StoreBillingPage } from "./pages/service/StoreBillingPage";
import { StoreDispatchPage } from "./pages/service/StoreDispatchPage";
import { ScInwardPage } from "./pages/serviceCentre/ScInwardPage";
import { ScLogisticsPage } from "./pages/serviceCentre/ScLogisticsPage";
import { ScSupervisorPage } from "./pages/serviceCentre/ScSupervisorPage";
import { ServiceCentreHomePage } from "./pages/serviceCentre/ServiceCentreHomePage";
import { TechnicianWorkbenchPage } from "./pages/serviceCentre/TechnicianWorkbenchPage";
import { UsersPrivilegesPage } from "./pages/UsersPrivilegesPage";
import { ServiceTaxSettingsPage } from "./pages/settings/ServiceTaxSettingsPage";
import { DocumentTemplatesPage } from "./pages/settings/DocumentTemplatesPage";
import { InventoryModulePage } from "./pages/inventory/InventoryModulePage";
import { InventoryPoInwardPage } from "./pages/inventory/InventoryPoInwardPage";
import { InventoryPurchaseOrdersPage } from "./pages/inventory/InventoryPurchaseOrdersPage";
import { InventorySuppliersPage } from "./pages/inventory/InventorySuppliersPage";
import { InventoryPurchaseRequestsPage } from "./pages/inventory/InventoryPurchaseRequestsPage";
import { InventorySpareCatalogPage } from "./pages/inventory/InventorySpareCatalogPage";
import { InventoryBulkImportPage } from "./pages/inventory/InventoryBulkImportPage";
import { InventorySparePriceFixingPage } from "./pages/inventory/InventorySparePriceFixingPage";
import { InventoryStockPriceOverviewPage } from "./pages/inventory/InventoryStockPriceOverviewPage";
import { InventoryStoreStockPage } from "./pages/inventory/InventoryStoreStockPage";
import { InventoryAllocationReviewPage } from "./pages/inventory/InventoryAllocationReviewPage";
import { InventoryBrandsPage } from "./pages/inventory/InventoryBrandsPage";
import { SrfPhotoCapturePage } from "./pages/public/SrfPhotoCapturePage";

function RedirectPreserveSearch({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RegionsProvider>
          <BrandsProvider>
          <CustomersProvider>
            <SrfJobsProvider>
            <SparesProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/service/srf-capture" element={<SrfPhotoCapturePage />} />
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
                  path="/service/srf"
                  element={
                    <ModuleRoute module="service">
                      <SrfBookingV2Page />
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
                  path="/service/store-billing"
                  element={
                    <ModuleRoute module="service">
                      <StoreBillingPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/service/billing"
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
                  path="/service/invoicing"
                  element={
                    <ModuleRoute module="service">
                      <RedirectPreserveSearch to="/service/billing" />
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
                  path="/service-centre/inward"
                  element={
                    <ModuleRoute module="service_centre">
                      <ScInwardPage />
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
                  path="/service-centre/technician"
                  element={
                    <ModuleRoute module="service_centre">
                      <TechnicianWorkbenchPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory"
                  element={
                    <ModuleRoute module="inventory">
                      <InventoryModulePage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/store-stock"
                  element={
                    <ModuleRoute module="inventory">
                      <InventoryStoreStockPage />
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
                      <InventoryAllocationReviewPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/purchase-requests"
                  element={
                    <ModuleRoute module="inventory">
                      <InventoryPurchaseRequestsPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/purchase-orders"
                  element={
                    <ModuleRoute module="inventory">
                      <InventoryPurchaseOrdersPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/suppliers"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySuppliersPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/po-inward"
                  element={
                    <ModuleRoute module="inventory">
                      <InventoryPoInwardPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/spares"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySpareCatalogPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/bulk-import"
                  element={
                    <ModuleRoute module="inventory">
                      <InventoryBulkImportPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/brands"
                  element={
                    <ModuleRoute module="inventory">
                      <InventoryBrandsPage />
                    </ModuleRoute>
                  }
                />
                <Route
                  path="/inventory/spare-price-fixing"
                  element={
                    <ModuleRoute module="inventory">
                      <InventorySparePriceFixingPage />
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
                  path="/settings/tax"
                  element={
                    <ModuleRoute module="settings">
                      <ServiceTaxSettingsPage />
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
    </BrowserRouter>
  );
}
