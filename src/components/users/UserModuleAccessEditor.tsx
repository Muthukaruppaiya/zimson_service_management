import { useEffect } from "react";
import { ROLE_MODULE_ACCESS } from "../../config/moduleAccess";
import { ALL_MODULE_KEYS, MODULE_LABELS, effectiveModuleAccess } from "../../lib/userCreationPolicy";
import type { ModuleKey, UserRole } from "../../types/user";

type Props = {
  role: UserRole;
  useCustomModules: boolean;
  onUseCustomModulesChange: (value: boolean) => void;
  selectedModules: ModuleKey[];
  onSelectedModulesChange: (modules: ModuleKey[]) => void;
};

export function UserModuleAccessEditor({
  role,
  useCustomModules,
  onUseCustomModulesChange,
  selectedModules,
  onSelectedModulesChange,
}: Props) {
  const defaultMods = ROLE_MODULE_ACCESS[role];
  const customDiffersFromDefault =
    useCustomModules &&
    (selectedModules.length !== defaultMods.length ||
      !defaultMods.every((m) => selectedModules.includes(m)) ||
      !selectedModules.every((m) => defaultMods.includes(m)));

  useEffect(() => {
    if (!useCustomModules) onSelectedModulesChange([...ROLE_MODULE_ACCESS[role]]);
  }, [role, useCustomModules, onSelectedModulesChange]);

  const effectiveMods = effectiveModuleAccess(role, useCustomModules ? selectedModules : null);

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4 accent-rlx-green"
          checked={useCustomModules}
          onChange={(e) => {
            const on = e.target.checked;
            onUseCustomModulesChange(on);
            if (on) onSelectedModulesChange([...ROLE_MODULE_ACCESS[role]]);
          }}
        />
        <span className="text-sm font-semibold text-stone-700">
          Override with custom module list
          <span className="ml-2 text-[11px] font-normal text-stone-400">(unchecked = role defaults)</span>
        </span>
      </label>

      {useCustomModules ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_MODULE_KEYS.map((m) => {
            const active = selectedModules.includes(m);
            return (
              <label
                key={m}
                className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-xs transition ${
                  active
                    ? "border-rlx-green bg-rlx-green/8 text-rlx-green font-semibold"
                    : "border-rlx-rule bg-stone-50 text-stone-400"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-rlx-green"
                  checked={active}
                  onChange={(ev) =>
                    onSelectedModulesChange(
                      ev.target.checked
                        ? Array.from(new Set([...selectedModules, m]))
                        : selectedModules.filter((x) => x !== m),
                    )
                  }
                />
                <span>{MODULE_LABELS[m]}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {effectiveMods.map((m) => (
            <span
              key={m}
              className="border border-rlx-green/30 bg-rlx-green/5 px-2.5 py-1 text-[11px] font-medium text-rlx-green"
            >
              {MODULE_LABELS[m] ?? m}
            </span>
          ))}
        </div>
      )}

      {customDiffersFromDefault ? (
        <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Custom module list differs from role default — confirm this is intentional.
        </p>
      ) : null}
    </div>
  );
}
