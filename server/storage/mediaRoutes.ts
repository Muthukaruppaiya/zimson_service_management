import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { isS3StorageEnabled } from "./config";
import { absoluteLocalPath } from "./fileStorage";
import { s3GetObjectStream, s3PresignedGetUrl } from "./s3Client";

/**
 * Serves uploaded files:
 * - S3: redirect to short-lived presigned URL (private bucket)
 * - Local: stream from uploads/
 */
export function registerMediaRoutes(app: Express): void {
  app.get("/api/media/{*key}", async (req, res) => {
    const key = String((req.params as { key?: string | string[] }).key ?? "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (!key || key.includes("..")) {
      res.status(400).json({ error: "Invalid media path." });
      return;
    }

    try {
      if (isS3StorageEnabled()) {
        const redirect = (process.env.S3_MEDIA_REDIRECT ?? "true").trim().toLowerCase() !== "false";
        if (redirect) {
          const url = await s3PresignedGetUrl(key, Number(process.env.S3_PRESIGN_SECONDS ?? 3600));
          res.redirect(302, url);
          return;
        }
        const obj = await s3GetObjectStream(key);
        if (obj.ContentType) res.setHeader("Content-Type", obj.ContentType);
        if (obj.ContentLength != null) res.setHeader("Content-Length", String(obj.ContentLength));
        res.setHeader("Cache-Control", "private, max-age=300");
        const body = obj.Body;
        if (!body || typeof (body as NodeJS.ReadableStream).pipe !== "function") {
          res.status(404).end();
          return;
        }
        (body as NodeJS.ReadableStream).pipe(res);
        return;
      }

      const storagePath = `api/media/${key}`;
      const abs = absoluteLocalPath(storagePath);
      if (!abs || !fs.existsSync(abs)) {
        res.status(404).json({ error: "File not found." });
        return;
      }
      res.sendFile(abs);
    } catch (e) {
      console.error("[media]", key, e);
      res.status(404).json({ error: "File not found." });
    }
  });

}
