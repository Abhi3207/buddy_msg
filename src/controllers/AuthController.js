// ============================================================================
// src/controllers/AuthController.js — Auth HTTP Handlers
// ============================================================================
// Thin controller layer: validates input is already done by middleware,
// delegates to AuthService, and formats the HTTP response.
// ============================================================================

const { asyncHandler } = require('../middleware/errorHandler');

class AuthController {
  constructor(authService) {
    this._authService = authService;
  }

  /**
   * POST /api/v1/auth/register
   */
  register = asyncHandler(async (req, res) => {
    const { username, email, password, displayName } = req.body;

    const result = await this._authService.register({
      username,
      email,
      password,
      displayName,
    });

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        token: result.token,
        refreshToken: result.refreshToken,
      },
    });
  });

  /**
   * POST /api/v1/auth/login
   */
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const result = await this._authService.login({ email, password });

    res.status(200).json({
      success: true,
      data: {
        user: result.user,
        token: result.token,
        refreshToken: result.refreshToken,
      },
    });
  });

  /**
   * POST /api/v1/auth/refresh
   */
  refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    const result = await this._authService.refreshToken(refreshToken);

    res.status(200).json({
      success: true,
      data: {
        token: result.token,
        refreshToken: result.refreshToken,
      },
    });
  });
}

module.exports = AuthController;
