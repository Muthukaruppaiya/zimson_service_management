import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { canAccessModule } from "../config/moduleAccess";
import { useAuth } from "../context/AuthContext";
import {
  MANUAL_TOPICS,
  ROLE_MANUALS,
  SRF_JOURNEY,
  roleManual,
  type ManualTopic,
} from "../lib/userManual";

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <strong key={i} className="font-semibold text-rlx-ink">{p.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function TopicCard({ topic, index, canOpen }: { topic: ManualTopic; index: number; canOpen: boolean }) {
  return (
    <section id={`manual-${topic.id}`} className="manual-topic break-inside-avoid scroll-mt-24 border border-rlx-rule bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-rlx-rule bg-gradient-to-r from-rlx-green-light/60 to-white px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-rlx-green text-[12px] font-bold text-white">
            {index}
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-rlx-ink">{topic.title}</h3>
            <p className="mt-0.5 text-[12.5px] text-rlx-ink-muted">
              <span className="font-semibold text-rlx-gold">Menu: </span>
              <Rich text={topic.menu} />
            </p>
          </div>
        </div>
        {canOpen && topic.path ? (
          <Link
            to={topic.path}
            className="shrink-0 border border-rlx-green px-3 py-1 text-[12px] font-semibold text-rlx-green transition hover:bg-rlx-green hover:text-white print:hidden"
          >
            Open
          </Link>
        ) : null}
      </header>
      <ol className="space-y-1.5 px-4 py-3 text-[13.5px] text-rlx-ink-muted">
        {topic.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="w-5 shrink-0 text-right font-semibold text-rlx-green">{i + 1}.</span>
            <span><Rich text={s} /></span>
          </li>
        ))}
      </ol>
      {topic.notes?.length ? (
        <ul className="space-y-1 border-t border-dashed border-rlx-rule px-4 py-2.5 text-[12.5px] text-rlx-ink-muted">
          {topic.notes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-rlx-gold">►</span>
              <span><Rich text={n} /></span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function UserManualPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const [viewRole, setViewRole] = useState<string>(user?.role ?? "");

  const manual = roleManual(viewRole) ?? roleManual(user?.role ?? "");
  const viewingOwn = manual?.role === user?.role;

  const groups = useMemo(() => {
    if (!manual || !user) return [];
    const seen = new Set<string>();
    return manual.groups
      .map((g) => ({
        title: g.title,
        topics: g.topics
          .map((id) => MANUAL_TOPICS[id])
          .filter((t): t is ManualTopic => {
            if (!t || seen.has(t.id)) return false;
            if (viewingOwn && t.module && !canAccessModule(user, t.module)) return false;
            seen.add(t.id);
            return true;
          }),
      }))
      .filter((g) => g.topics.length > 0);
  }, [manual, user, viewingOwn]);

  if (!user || !manual) {
    return (
      <div>
        <PageHeader title="User manual" description="" />
        <p className="text-sm text-rlx-ink-muted">No manual is available for your role yet.</p>
      </div>
    );
  }

  let counter = 0;
  const fullFlow = manual.role === "super_admin" || manual.role === "admin";
  const journey = fullFlow ? SRF_JOURNEY : SRF_JOURNEY.filter((j) => j.roles.includes(manual.role));
  const showJourney = journey.length > 0;
  const journeyTitle = fullFlow ? "SRF flow at a glance" : "Your steps in the SRF flow";

  return (
    <div className="user-manual-page">
      <PageHeader
        title="User manual"
        description=""
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {isAdmin ? (
              <select
                value={manual.role}
                onChange={(e) => setViewRole(e.target.value)}
                className="border border-rlx-rule bg-white px-3 py-1.5 text-[13px] font-semibold text-rlx-ink"
                aria-label="View manual for role"
              >
                {ROLE_MANUALS.map((m) => (
                  <option key={m.role} value={m.role}>
                    {m.label}{m.role === user.role ? " (you)" : ""}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => window.print()}
              className="bg-rlx-green px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-rlx-green-deep"
            >
              Print / Save PDF
            </button>
          </div>
        }
      />

      <div className="mb-5 border-l-4 border-rlx-gold bg-rlx-green-light/40 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-rlx-gold">Role</p>
        <p className="text-[17px] font-semibold text-rlx-ink">{manual.label}</p>
        <p className="mt-0.5 text-[13px] text-rlx-ink-muted">{manual.summary}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="hidden self-start lg:sticky lg:top-20 lg:block print:hidden" aria-label="Manual contents">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-rlx-ink-muted">Contents</p>
          <ul className="space-y-3 text-[13px]">
            {showJourney ? (
              <li>
                <a href="#manual-journey" className="font-semibold text-rlx-green hover:underline">{journeyTitle}</a>
              </li>
            ) : null}
            {groups.map((g) => (
              <li key={g.title}>
                <p className="font-semibold text-rlx-ink">{g.title}</p>
                <ul className="mt-1 space-y-1 border-l border-rlx-rule pl-3">
                  {g.topics.map((t) => (
                    <li key={t.id}>
                      <a href={`#manual-${t.id}`} className="text-rlx-ink-muted hover:text-rlx-green">{t.title}</a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          {showJourney ? (
            <section id="manual-journey" className="break-inside-avoid scroll-mt-24 border border-rlx-rule bg-white">
              <h2 className="border-b border-rlx-rule px-4 py-3 text-[15px] font-semibold text-rlx-ink">{journeyTitle}</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-[13px]">
                  <thead className="bg-rlx-green text-[11px] uppercase tracking-wider text-white">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Step</th>
                      <th className="px-3 py-2">Who</th>
                      <th className="px-3 py-2">Menu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journey.map((j, i) => {
                      return (
                        <tr key={i} className="border-t border-rlx-rule text-rlx-ink-muted">
                          <td className="px-3 py-1.5">{i + 1}</td>
                          <td className="px-3 py-1.5">{j.step}</td>
                          <td className="px-3 py-1.5">{j.who}</td>
                          <td className="px-3 py-1.5">{j.menu}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {groups.map((g) => (
            <div key={g.title} className="space-y-3">
              <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.22em] text-rlx-ink-muted">
                <span className="h-px w-6 bg-rlx-gold" aria-hidden />
                {g.title}
              </h2>
              <div className="grid gap-3 xl:grid-cols-2">
                {g.topics.map((t) => {
                  counter += 1;
                  return <TopicCard key={t.id} topic={t} index={counter} canOpen={!t.module || canAccessModule(user, t.module)} />;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
