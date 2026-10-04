import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

// Intentionally excludes identities, cookies, storage keys and bearer URLs.
export function createVideoPlaybackTrace(req: Request, res: Response) {
  const log = logger.child({
    event: "video-playback",
    requestId: randomUUID(),
    lessonId: Number(req.params.id),
  });
  const requestStarted = performance.now();
  let pendingStage: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function begin(stage: string) {
    const started = performance.now();
    pendingStage = stage;
    log.info({ stage, phase: "start" }, "Playback stage");
    timer = setTimeout(() => {
      log.warn({ stage, phase: "pending", durationMs: Math.round(performance.now() - started) }, "Playback stage still pending");
    }, 5000);
    timer.unref();
    return (phase: "end" | "error" = "end") => {
      clearTimeout(timer);
      pendingStage = null;
      log.info({ stage, phase, durationMs: Math.round(performance.now() - started) }, "Playback stage");
    };
  }

  res.once("close", () => {
    clearTimeout(timer);
    log.info({
      phase: res.writableFinished ? "response" : "disconnected",
      pendingStage,
      statusCode: res.statusCode,
      durationMs: Math.round(performance.now() - requestStarted),
    }, "Playback request finished");
  });

  return {
    begin,
    async run<T>(stage: string, operation: () => PromiseLike<T>): Promise<T> {
      const end = begin(stage);
      try {
        const result = await operation();
        end();
        return result;
      } catch (error) {
        end("error");
        throw error;
      }
    },
  };
}

export function traceVideoAuthentication(
  authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const trace = createVideoPlaybackTrace(req, res);
    res.locals.videoPlaybackTrace = trace;
    const end = trace.begin("authentication");
    let ended = false;
    try {
      await authenticate(req, res, (error) => {
        ended = true;
        end(error ? "error" : "end");
        next(error);
      });
    } catch (error) {
      if (!ended) end("error");
      next(error);
    }
  };
}