import { Link } from "react-router-dom";
import { ServiceNavBar } from "../../components/service/ServiceNavBar";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";

const quickLinks = [
  { to: "/service/quick-bill", title: "Quick bill", description: "Walk-in repair billing and customer upload link." },
  { to: "/service/srf", title: "SRF booking", description: "New service request with photos, estimate, and OTP." },
  { to: "/service/quick-bill-history", title: "Quick bill history", description: "Past quick bills and reprints." },
  { to: "/service/srf-register", title: "Booking list", description: "Open and in-progress SRF jobs." },
] as const;

export function ServiceModulePage() {
  return (
    <div>
      <PageHeader
        title="Service module"
        description="Quick billing, SRF booking, and store service workflows."
      />
      <ServiceNavBar />
      <div className="grid gap-4 sm:grid-cols-2">
        {quickLinks.map((item) => (
          <Link key={item.to} to={item.to} className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zimson-600">
            <Card title={item.title} className="h-full transition hover:border-zimson-300 hover:shadow-md">
              <p className="text-sm text-stone-600">{item.description}</p>
              <p className="mt-3 text-xs font-semibold text-zimson-700">Open →</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
