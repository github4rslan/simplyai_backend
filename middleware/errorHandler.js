export class ApiError extends Error {
  constructor(statusCode = 500, message = "Internal Server Error", details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const notFoundHandler = (req, res, next) => {
  next(
    new ApiError(
      404,
      `Route ${req.method} ${req.originalUrl} not found`,
      "Not Found"
    )
  );
};

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const requestId = req.requestId;

  const errorPayload = {
    success: false,
    message: err.message || "Something went wrong",
    requestId,
  };

  if (err.details) {
    errorPayload.details = err.details;
  }

  if (process.env.NODE_ENV !== "production") {
    errorPayload.stack = err.stack;
  }

  console.error(
    `❌ [${requestId || "no-id"}] ${req.method} ${req.originalUrl} -> ${
      statusCode
    }: ${err.message}`
  );

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json(errorPayload);
};

