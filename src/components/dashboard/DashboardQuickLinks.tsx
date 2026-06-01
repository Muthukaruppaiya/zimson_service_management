import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  defaultQuickLinkIdsForUser,
  quickLinksAvailableForUser,
  resolveQuickLinkDefs,
  type DashboardQuickLinkId,
} from "../../lib/dashboardQuickLinks";
import {
  loadDashboardQuickLinkIds,
  saveDashboardQuickLinkIds,
} from "../../lib/dashboardQuickLinksStorage";

export function DashboardQuickLinks() {
  const { user } = useAuth();
  const available = useMemo(() => quickLinksAvailableForUser(user), [user]);
  const [selectedIds, setSelectedIds] = useState<DashboardQuickLinkId[]>(() =>
    loadDashboardQuickLinkIds(user),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<DashboardQuickLinkId[]>(selectedIds);

  useEffect(() => {
    setSelectedIds(loadDashboardQuickLinkIds(user));
  }, [user?.id]);

  const activeLinks = useMemo(
    () => resolveQuickLinkDefs(user, selectedIds),
    [user, selectedIds],
  );

  function openSettings() {
    setDraftIds(selectedIds.length > 0 ? selectedIds : defaultQuickLinkIdsForUser(user));
    setSettingsOpen(true);
  }

  function toggleDraft(id: DashboardQuickLinkId) {
    setDraftIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  function saveSettings() {
    if (!user?.id) return;
    const next = draftIds.length > 0 ? draftIds : defaultQuickLinkIdsForUser(user);
    saveDashboardQuickLinkIds(user.id, next);
    setSelectedIds(next);
    setSettingsOpen(false);
  }

  if (available.length === 0) return null;

  return (
    <section className="rounded-3xl border border-zimson-200/80 bg-white px-5 py-5 shadow-sm md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zimson-700">Quick links</p>
          <h2 className="mt-1 text-lg font-semibold text-stone-900">Jump to your daily pages</h2>
          <p className="mt-1 text-sm text-stone-600">
            Shortcuts appear here on Home. Choose which pages you use most.
          </p>
        </div>
        <button
          type="button"
          onClick={openSettings}
          className="shrink-0 rounded-xl border border-zimson-400 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
        >
          Customize quick links
        </button>
      </div>

      {activeLinks.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {activeLinks.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              className="group rounded-2xl border border-zimson-200 bg-gradient-to-br from-white to-zimson-50/80 p-4 shadow-sm transition hover:border-zimson-500 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zimson-600"
            >
              <p className="text-sm font-bold text-zimson-950 group-hover:text-zimson-800">{item.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">{item.description}</p>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zimson-700">
                Open →
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No quick links selected. Use <strong>Customize quick links</strong> to add shortcuts.
        </p>
      )}

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-links-settings-title"
        >
          <div
            className="max-h-[min(90vh,640px)] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-stone-200 bg-zimson-50 px-5 py-4">
              <h3 id="quick-links-settings-title" className="text-base font-semibold text-zimson-950">
                Dashboard quick links
              </h3>
              <p className="mt-1 text-xs text-stone-600">
                Select one or more pages. Only modules you can access are listed.
              </p>
            </div>
            <div className="max-h-[min(50vh,360px)] overflow-y-auto px-5 py-4">
              <ul className="space-y-2">
                {available.map((item) => {
                  const checked = draftIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 px-3 py-2.5 hover:bg-stone-50 has-[:checked]:border-zimson-500 has-[:checked]:bg-zimson-50/80">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-stone-300 text-zimson-600 focus:ring-zimson-500"
                          checked={checked}
                          onChange={() => toggleDraft(item.id)}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-stone-900">{item.label}</span>
                          <span className="mt-0.5 block text-xs text-stone-600">{item.description}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-stone-50 px-5 py-4">
              <button
                type="button"
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100"
                onClick={() => setSettingsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-700"
                onClick={saveSettings}
              >
                Save quick links
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
