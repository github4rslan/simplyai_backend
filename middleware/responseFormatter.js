export const responseFormatter = (req, res, next) => {
  res.success = (message = "OK", data = null, meta) => {
    const payload = {
      success: true,
      message,
      data,
      requestId: req.requestId,
    };

    if (meta) {
      payload.meta = meta;
    }

    return res.json(payload);
  };

  res.fail = (statusCode = 400, message = "Request failed", details) => {
    const payload = {
      success: false,
      message,
      requestId: req.requestId,
    };

    if (details) {
      payload.details = details;
    }

    return res.status(statusCode).json(payload);
  };

  next();
};

