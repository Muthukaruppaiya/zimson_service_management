import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  defaultQuickLinkIdsForUser,
  quickLinksAvailableForUser,
  resolveQuickLinkDefs,
  type DashboardQuickLinkId,
} from "../../lib/dashboardQuickLinks";
import { QUICK_LINK_ICON_TONE } from "../../lib/dashboardQuickLinkStyles";
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
    <section className="overflow-hidden rounded-2xl border border-rlx-rule bg-white shadow-[0_2px_12px_rgba(16,37,112,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rlx-rule bg-gradient-to-r from-rlx-green to-rlx-green-deep px-4 py-3 md:px-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-rlx-gold">Quick links</p>
          <h2 className="mt-0.5 text-sm font-semibold text-white md:text-base">Your daily shortcuts</h2>
        </div>
        <button
          type="button"
          onClick={openSettings}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
        >
          <CustomizeIcon />
          Customize
        </button>
      </div>

      <div className="bg-gradient-to-b from-stone-50/80 to-white px-4 py-6 md:px-6 md:py-7">
        <p className="mb-5 text-center text-xs text-stone-500 sm:text-left">
          Tap a coloured icon below — no need to open the menu first.
        </p>

        {activeLinks.length > 0 ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-x-3 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] sm:gap-x-4 md:gap-x-5">
            {activeLinks.map((item) => {
              const tone = QUICK_LINK_ICON_TONE[item.id];
              return (
                <li key={item.id} className="flex justify-center">
                  <Link
                    to={item.to}
                    title={item.description}
                    className={`group flex w-full max-w-[6.5rem] flex-col items-center rounded-2xl p-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rlx-green`}
                  >
                    <span
                      className={`relative flex aspect-square w-full max-w-[4.75rem] items-center justify-center rounded-2xl border shadow-[0_4px_14px_rgba(16,37,112,0.08)] ring-2 ring-transparent transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_20px_rgba(16,37,112,0.12)] group-active:translate-y-0 group-active:scale-[0.98] sm:max-w-[5.25rem] ${tone.tile} ${tone.hoverRing}`}
                    >
                      <DashboardQuickLinkIcon
                        id={item.id}
                        className={`h-9 w-9 sm:h-10 sm:w-10 ${tone.icon}`}
                      />
                    </span>
                    <span className="mt-2.5 line-clamp-2 w-full px-0.5 text-center text-[11px] font-bold leading-snug text-stone-800 group-hover:text-rlx-green sm:text-xs">
                      {item.shortLabel}
                    </span>
                  </Link>
                </li>
              );
            })}
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
                  const tone = QUICK_LINK_ICON_TONE[item.id];
                  return (
                    <li key={item.id}>
                      <label
                        className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 p-2.5 transition ${
                          checked
                            ? "border-rlx-green bg-white shadow-md"
                            : "border-transparent bg-white/80 opacity-75 hover:opacity-100"
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
                        <span
                          className={`flex h-12 w-12 items-center justify-center rounded-xl border ${tone.tile}`}
                        >
                          <DashboardQuickLinkIcon id={item.id} className={`h-7 w-7 ${tone.icon}`} />
                        </span>
                        <span className="mt-2 text-center text-[10px] font-bold leading-tight text-stone-800">
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
