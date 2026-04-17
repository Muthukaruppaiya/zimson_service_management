import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ModuleRoute } from "./components/auth/ModuleRoute";
import { RequireAuth } from "./components/auth/RequireAuth";
import { AppShell } from "./components/layout/AppShell";
import { AuthProvider } from "./context/AuthContext";
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
import { SrfBookingPage } from "./pages/service/SrfBookingPage";
import { StoreDispatchPage } from "./pages/service/StoreDispatchPage";
import { ScInwardPage } from "./pages/serviceCentre/ScInwardPage";
import { ScLogisticsPage } from "./pages/serviceCentre/ScLogisticsPage";
import { ScSupervisorPage } from "./pages/serviceCentre/ScSupervisorPage";
import { ServiceCentreHomePage } from "./pages/serviceCentre/ServiceCentreHomePage";
import { TechnicianWorkbenchPage } from "./pages/serviceCentre/TechnicianWorkbenchPage";
import { UsersPrivilegesPage } from "./pages/UsersPrivilegesPage";
import { InventoryModulePage } from "./pages/inventory/InventoryModulePage";
import { InventoryPoInwardPage } from "./pages/inventory/InventoryPoInwardPage";
import { InventoryPurchaseOrdersPage } from "./pages/inventory/InventoryPurchaseOrdersPage";
import { InventorySuppliersPage } from "./pages/inventory/InventorySuppliersPage";
import { InventoryPurchaseRequestsPage } from "./pages/inventory/InventoryPurchaseRequestsPage";
import { InventorySpareCatalogPage } from "./pages/inventory/InventorySpareCatalogPage";
import { InventorySparePriceFixingPage } from "./pages/inventory/InventorySparePriceFixingPage";
import { InventoryStockPriceOverviewPage } from "./pages/inventory/InventoryStockPriceOverviewPage";
import { InventoryStoreStockPage } from "./pages/inventory/InventoryStoreStockPage";

function RedirectPreserveSearch({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RegionsProvider>
          <CustomersProvider>
            <SrfJobsProvider>
            <SparesProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
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
                      <SrfBookingPage />
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
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
            </SparesProvider>
            </SrfJobsProvider>
          </CustomersProvider>
        </RegionsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
