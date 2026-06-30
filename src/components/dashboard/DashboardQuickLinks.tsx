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
import { DashboardQuickLinkIcon } from "./DashboardQuickLinkIcon";

function CustomizeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

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
    <section className="overflow-hidden rounded-2xl border border-[#e8ebf0] bg-white shadow-[0_2px_10px_rgba(16,37,112,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8ebf0] bg-white px-3 py-2.5 md:px-4">
        <h2 className="text-sm font-bold text-[#1B3A8F]">Daily Actions &amp; Quick Create</h2>
        <button
          type="button"
          onClick={openSettings}
          className="inline-flex items-center gap-1 rounded-full border border-[#d8dde6] bg-white px-3 py-1 text-[11px] font-semibold text-[#374151] shadow-sm transition hover:bg-[#f9fafb]"
        >
          <CustomizeIcon className="h-3.5 w-3.5" />
          Manage Links
        </button>
      </div>

      <div className="bg-[#f4f6f9] px-3 py-4 md:px-5 md:py-5">
        {activeLinks.length > 0 ? (
          <ul className="cs-actions-grid grid">
            {activeLinks.map((item) => (
              <li key={item.id} className="min-w-0">
                <Link
                  to={item.to}
                  title={item.description}
                  className="cs-action-tile dashboard-quick-tile group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#032d60]"
                >
                  <DashboardQuickLinkIcon id={item.id} />
                  <span className="cs-action-label">{item.shortLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-amber-300/60 bg-amber-50/80 px-4 py-6 text-center text-sm text-amber-950">
            No shortcuts yet. Tap <strong>Customize</strong> to add icons to your home screen.
          </p>
        )}
      </div>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-stone-900/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-links-settings-title"
        >
          <div
            className="max-h-[min(90vh,680px)] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-rlx-rule bg-gradient-to-r from-rlx-green to-rlx-green-deep px-5 py-4">
              <h3 id="quick-links-settings-title" className="text-base font-semibold text-white">
                Choose your shortcuts
              </h3>
              <p className="mt-1 text-xs text-white/75">Tap icons to show or hide on Home.</p>
            </div>
            <div className="max-h-[min(52vh,400px)] overflow-y-auto bg-stone-50/50 px-4 py-4">
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {available.map((item) => {
                  const checked = draftIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <label
                        className={`dashboard-quick-tile flex cursor-pointer flex-col items-center justify-between p-2 transition ${
                          checked
                            ? "ring-2 ring-[#1B3A8F]/30"
                            : "opacity-80 hover:opacity-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleDraft(item.id)}
                        />
                        {checked ? (
                          <span className="mb-1 flex h-4 w-4 items-center justify-center rounded-full bg-rlx-green text-[10px] font-bold text-white">
                            ✓
                          </span>
                        ) : (
                          <span className="mb-1 h-4 w-4" aria-hidden />
                        )}
                        <span className="flex flex-1 items-center justify-center">
                          <DashboardQuickLinkIcon id={item.id} />
                        </span>
                        <span className="mt-1 text-center text-[10px] font-semibold leading-tight text-[#1B3A8F]">
                          {item.shortLabel}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex justify-center gap-3 border-t border-rlx-rule bg-white px-5 py-4">
              <button
                type="button"
                className="min-w-[7rem] rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                onClick={() => setSettingsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-w-[7rem] rounded-xl bg-rlx-green px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rlx-green-deep"
                onClick={saveSettings}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
