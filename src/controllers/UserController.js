// ============================================================================
// src/controllers/UserController.js — User HTTP Handlers
// ============================================================================
// Handles profile retrieval, updates, and user search endpoints.
// ============================================================================

const { asyncHandler } = require('../middleware/errorHandler');

class UserController {
  constructor(userService) {
    this._userService = userService;
  }

  /**
   * GET /api/v1/users/me
   */
  getProfile = asyncHandler(async (req, res) => {
    const user = this._userService.getProfile(req.user.userId);

    res.status(200).json({
      success: true,
      data: { user },
    });
  });

  /**
   * PATCH /api/v1/users/profile
   */
  updateProfile = asyncHandler(async (req, res) => {
    const updated = this._userService.updateProfile(req.user.userId, req.body);

    res.status(200).json({
      success: true,
      data: { user: updated.toJSON ? updated.toJSON() : updated },
    });
  });

  /**
   * GET /api/v1/users/search?q=...&limit=20
   */
  search = asyncHandler(async (req, res) => {
    const { q, limit } = req.query;

    const users = this._userService.searchUsers(q, req.user.userId, limit);

    res.status(200).json({
      success: true,
      data: { users, count: users.length },
    });
  });

  /**
   * GET /api/v1/users/online
   */
  getOnlineUsers = asyncHandler(async (req, res) => {
    const users = this._userService.getOnlineUsers();

    res.status(200).json({
      success: true,
      data: { users, count: users.length },
    });
  });
}

module.exports = UserController;
