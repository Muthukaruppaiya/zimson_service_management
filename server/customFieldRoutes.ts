import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  isCustomFieldEntity,
  isCustomFieldType,
  loadCustomFieldDefs,
  slugifyFieldKey,
} from "./customFields";

type Authed = Request & { userId: string };

function canAdmin(actor: DemoUser | null | undefined): boolean {
  return actor?.role === "super_admin" || actor?.role === "admin";
}

export function registerCustomFieldRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/custom-fields", requireAuth, async (req, res) => {
    const entity = String(req.query.entity ?? "").trim();
    const includeInactive = String(req.query.all ?? "") === "1";
    try {
      if (entity) {
        if (!isCustomFieldEntity(entity)) {
          res.status(400).json({ error: "Unknown entity." });
          return;
        }
        const fields = await loadCustomFieldDefs(pool, entity, !includeInactive);
        res.json({ fields, entity });
        return;
      }
      const { rows } = await pool.query(
        `SELECT id,
                entity_key AS "entityKey",
                field_key AS "fieldKey",
                label,
                field_type AS "fieldType",
                options,
                required,
                show_in_list AS "showInList",
                searchable,
                help_text AS "helpText",
                sort_order AS "sortOrder",
                is_active AS "isActive"
         FROM custom_field_definitions
         ${includeInactive ? "" : "WHERE is_active = true"}
         ORDER BY entity_key, sort_order, created_at`,
      );
      res.json({ fields: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load custom fields." });
    }
  });

  app.post("/api/custom-fields", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canAdmin(actor)) {
      res.status(403).json({ error: "Only admin can add custom fields." });
      return;
    }
    const entityKey = String(req.body?.entityKey ?? "").trim();
    if (!isCustomFieldEntity(entityKey)) {
      res.status(400).json({ error: "entityKey must be customer, supplier, spare, or srf." });
      return;
    }
    const label = String(req.body?.label ?? "").trim();
    if (!label) {
      res.status(400).json({ error: "Label is required." });
      return;
    }
    const fieldType = String(req.body?.fieldType ?? "text").trim();
    if (!isCustomFieldType(fieldType)) {
      res.status(400).json({ error: "Invalid field type." });
      return;
    }
    let fieldKey = String(req.body?.fieldKey ?? "").trim() || slugifyFieldKey(label);
    fieldKey = slugifyFieldKey(fieldKey);
    const options = Array.isArray(req.body?.options)
      ? (req.body.options as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean)
      : String(req.body?.optionsText ?? "")
          .split(/\r?\n|,/)
          .map((x) => x.trim())
          .filter(Boolean);
    if (fieldType === "dropdown" && options.length === 0) {
      res.status(400).json({ error: "Dropdown fields need at least one option." });
      return;
    }
    try {
      const max = await pool.query<{ n: number }>(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM custom_field_definitions WHERE entity_key = $1`,
        [entityKey],
      );
      const ins = await pool.query(
        `INSERT INTO custom_field_definitions
           (entity_key, field_key, label, field_type, options, required, show_in_list, searchable, help_text, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
         RETURNING id,
                   entity_key AS "entityKey",
                   field_key AS "fieldKey",
                   label,
                   field_type AS "fieldType",
                   options,
                   required,
                   show_in_list AS "showInList",
                   searchable,
                   help_text AS "helpText",
                   sort_order AS "sortOrder",
                   is_active AS "isActive"`,
        [
          entityKey,
          fieldKey,
          label,
          fieldType,
          JSON.stringify(options),
          Boolean(req.body?.required),
          Boolean(req.body?.showInList),
          Boolean(req.body?.searchable),
          String(req.body?.helpText ?? "").trim(),
          max.rows[0]?.n ?? 0,
          actor?.id ?? null,
        ],
      );
      res.json({ field: ins.rows[0] });
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(400).json({ error: "A field with this key already exists on this entity." });
        return;
      }
      console.error(e);
      res.status(400).json({ error: "Could not create custom field." });
    }
  });

  app.patch("/api/custom-fields/:id", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canAdmin(actor)) {
      res.status(403).json({ error: "Only admin can update custom fields." });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [];
    let i = 1;
    if (req.body?.label !== undefined) {
      const label = String(req.body.label ?? "").trim();
      if (!label) {
        res.status(400).json({ error: "Label cannot be empty." });
        return;
      }
      sets.push(`label = $${i++}`);
      vals.push(label);
    }
    if (req.body?.fieldType !== undefined) {
      const fieldType = String(req.body.fieldType ?? "").trim();
      if (!isCustomFieldType(fieldType)) {
        res.status(400).json({ error: "Invalid field type." });
        return;
      }
      sets.push(`field_type = $${i++}`);
      vals.push(fieldType);
    }
    if (req.body?.options !== undefined || req.body?.optionsText !== undefined) {
      const options = Array.isArray(req.body?.options)
        ? (req.body.options as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean)
        : String(req.body?.optionsText ?? "")
            .split(/\r?\n|,/)
            .map((x) => x.trim())
            .filter(Boolean);
      sets.push(`options = $${i++}::jsonb`);
      vals.push(JSON.stringify(options));
    }
    if (req.body?.required !== undefined) {
      sets.push(`required = $${i++}`);
      vals.push(Boolean(req.body.required));
    }
    if (req.body?.showInList !== undefined) {
      sets.push(`show_in_list = $${i++}`);
      vals.push(Boolean(req.body.showInList));
    }
    if (req.body?.searchable !== undefined) {
      sets.push(`searchable = $${i++}`);
      vals.push(Boolean(req.body.searchable));
    }
    if (req.body?.helpText !== undefined) {
      sets.push(`help_text = $${i++}`);
      vals.push(String(req.body.helpText ?? "").trim());
    }
    if (req.body?.isActive !== undefined) {
      sets.push(`is_active = $${i++}`);
      vals.push(Boolean(req.body.isActive));
    }
    if (req.body?.sortOrder !== undefined) {
      sets.push(`sort_order = $${i++}`);
      vals.push(Number(req.body.sortOrder) || 0);
    }
    if (sets.length === 1) {
      res.status(400).json({ error: "Nothing to update." });
      return;
    }
    vals.push(id);
    try {
      const upd = await pool.query(
        `UPDATE custom_field_definitions SET ${sets.join(", ")} WHERE id = $${i}::uuid
         RETURNING id,
                   entity_key AS "entityKey",
                   field_key AS "fieldKey",
                   label,
                   field_type AS "fieldType",
                   options,
                   required,
                   show_in_list AS "showInList",
                   searchable,
                   help_text AS "helpText",
                   sort_order AS "sortOrder",
                   is_active AS "isActive"`,
        vals,
      );
      if (!upd.rows[0]) {
        res.status(404).json({ error: "Field not found." });
        return;
      }
      res.json({ field: upd.rows[0] });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not update custom field." });
    }
  });

  app.delete("/api/custom-fields/:id", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canAdmin(actor)) {
      res.status(403).json({ error: "Only admin can delete custom fields." });
      return;
    }
    try {
      const del = await pool.query(`DELETE FROM custom_field_definitions WHERE id = $1::uuid`, [req.params.id]);
      if ((del.rowCount ?? 0) === 0) {
        res.status(404).json({ error: "Field not found." });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not delete custom field." });
    }
  });
}
