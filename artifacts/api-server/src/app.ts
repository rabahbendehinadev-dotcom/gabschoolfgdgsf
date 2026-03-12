import path from "path";
import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const uploadsDir = path.join(process.cwd(), "uploads");

const app: Express = express();

app.set("trust proxy", true);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(uploadsDir));

app.use("/api", router);

export default app;
