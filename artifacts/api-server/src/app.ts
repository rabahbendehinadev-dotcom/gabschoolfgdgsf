import path from "path";
import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const uploadsDir = path.join(process.cwd(), "uploads");

// Static web files are copied to /app/public by the Dockerfile builder stage.
// In production the CWD is /app/artifacts/api-server, so we go up two levels.
const publicDir = path.resolve(process.cwd(), "../../public");

const app: Express = express();

app.set("trust proxy", true);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Local uploads (multer temp dir) ───────────────────────────────────────
app.use("/uploads", express.static(uploadsDir));

// ── API routes ─────────────────────────────────────────────────────────────
app.use("/api", router);

// Do not expose implementation details for malformed security/admin mutations
// (or any other API exception). Route handlers may still return their own
// domain errors; this is the final safe boundary for uncaught validation/DB errors.
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isValidationError = !!error && typeof error === "object" && (error as { name?: string }).name === "ZodError";
  res.status(isValidationError ? 400 : 500).json({
    message: isValidationError ? "Invalid request" : "Unable to complete the request",
  });
});

// ── Serve Vite-built frontend (production only) ────────────────────────────
// In development, Vite's dev server handles the frontend.
// In production (Docker), the built files live in /app/public.
if (process.env.NODE_ENV === "production") {
  app.use(express.static(publicDir));
  // SPA fallback — all non-API routes serve index.html
  app.get("*path", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

export default app;
