import { randomUUID } from "crypto";

const formatDuration = (startTime) => {
  const diff = process.hrtime.bigint() - startTime;
  return Number(diff) / 1_000_000; // convert to ms
};

export const requestLogger = (req, res, next) => {
  const requestId = randomUUID();
  const startTime = process.hrtime.bigint();
  const { method, originalUrl } = req;

  req.requestId = requestId;
  res.locals.requestId = requestId;

  console.log(
    `➡️  [${requestId}] ${method} ${originalUrl} - ${req.ip || "unknown ip"}`
  );

  res.on("finish", () => {
    const duration = formatDuration(startTime).toFixed(2);
    const status = res.statusCode;
    const contentLength = res.get("content-length") || 0;
    const userLabel = req.user?.id ? `user:${req.user.id}` : "user:anonymous";

    console.log(
      `✅ [${requestId}] ${method} ${originalUrl} -> ${status} (${duration}ms, ${contentLength}b, ${userLabel})`
    );
  });

  res.on("close", () => {
    if (res.writableFinished) {
      return;
    }
    const duration = formatDuration(startTime).toFixed(2);
    console.warn(
      `⚠️  [${requestId}] ${method} ${originalUrl} - connection closed prematurely (${duration}ms)`
    );
  });

  next();
};

