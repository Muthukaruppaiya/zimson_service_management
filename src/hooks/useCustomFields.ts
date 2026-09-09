import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../lib/api";
import type { CustomFieldDefinition, CustomFieldEntityKey } from "../types/customField";

export function useCustomFields(entity: CustomFieldEntityKey) {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await apiJson<{ fields: CustomFieldDefinition[] }>(
        `/api/custom-fields?entity=${encodeURIComponent(entity)}`,
      );
      setFields((data.fields ?? []).filter((f) => f.isActive).sort((a, b) => a.sortOrder - b.sortOrder));
    } catch {
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { fields, loading, reload };
}
