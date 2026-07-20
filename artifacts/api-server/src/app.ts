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

// ── Serve Vite-built frontend (production only) ────────────────────────────
// In development, Vite's dev server handles the frontend.
// In production (Docker), the built files live in /app/public.
if (process.env.NODE_ENV === "production") {
  app.use(express.static(publicDir));
  // SPA fallback — all non-API routes serve index.html
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

export default app;
