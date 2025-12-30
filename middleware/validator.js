import { body, param, query, validationResult } from "express-validator";

/**
 * Middleware to handle validation errors
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array(),
    });
  }
  next();
};

/**
 * Validation rules for common fields
 */
export const commonValidators = {
  email: body("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  password: body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),

  id: param("id")
    .notEmpty()
    .withMessage("ID is required")
    .isUUID()
    .withMessage("ID must be a valid UUID"),

  optionalId: param("id")
    .optional()
    .isUUID()
    .withMessage("ID must be a valid UUID"),
};

/**
 * Validation rules for authentication endpoints
 */
export const authValidators = {
  register: [
    body("email").isEmail().withMessage("Please provide a valid email address").normalizeEmail(),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    body("firstName")
      .trim()
      .notEmpty()
      .withMessage("First name is required")
      .isLength({ min: 1, max: 100 })
      .withMessage("First name must be between 1 and 100 characters"),
    body("lastName")
      .trim()
      .notEmpty()
      .withMessage("Last name is required")
      .isLength({ min: 1, max: 100 })
      .withMessage("Last name must be between 1 and 100 characters"),
    body("phone").optional().isMobilePhone().withMessage("Please provide a valid phone number"),
    handleValidationErrors,
  ],

  login: [
    body("email").isEmail().withMessage("Please provide a valid email address").normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
    handleValidationErrors,
  ],

  changePassword: [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters long"),
    handleValidationErrors,
  ],

  forgotPassword: [
    body("email").isEmail().withMessage("Please provide a valid email address").normalizeEmail(),
    handleValidationErrors,
  ],

  resetPassword: [
    body("token").notEmpty().withMessage("Reset token is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    handleValidationErrors,
  ],
};

/**
 * Validation rules for plan endpoints
 */
export const planValidators = {
  create: [
    body("name").trim().notEmpty().withMessage("Plan name is required"),
    body("price").optional().isFloat({ min: 0 }).withMessage("Price must be a positive number"),
    body("interval")
      .optional()
      .isIn(["month", "year"])
      .withMessage("Interval must be 'month' or 'year'"),
    body("is_free").optional().isBoolean().withMessage("is_free must be a boolean"),
    body("active").optional().isBoolean().withMessage("active must be a boolean"),
    handleValidationErrors,
  ],

  update: [
    param("id").notEmpty().withMessage("Plan ID is required"),
    body("name").optional().trim().notEmpty().withMessage("Plan name cannot be empty"),
    body("price").optional().isFloat({ min: 0 }).withMessage("Price must be a positive number"),
    handleValidationErrors,
  ],

  getById: [param("id").notEmpty().withMessage("Plan ID is required"), handleValidationErrors],
};

/**
 * Validation rules for questionnaire endpoints
 */
export const questionnaireValidators = {
  create: [
    body("title").trim().notEmpty().withMessage("Questionnaire title is required"),
    body("questions").isArray().withMessage("Questions must be an array"),
    handleValidationErrors,
  ],

  update: [
    param("id").notEmpty().withMessage("Questionnaire ID is required"),
    body("title").optional().trim().notEmpty().withMessage("Questionnaire title cannot be empty"),
    handleValidationErrors,
  ],
};

/**
 * Validation rules for user endpoints
 */
export const userValidators = {
  updateProfile: [
    body("firstName")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("First name must be between 1 and 100 characters"),
    body("lastName")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Last name must be between 1 and 100 characters"),
    body("phone").optional().isMobilePhone().withMessage("Please provide a valid phone number"),
    handleValidationErrors,
  ],
};

/**
 * Generic validation for pagination
 */
export const paginationValidators = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  handleValidationErrors,
];

