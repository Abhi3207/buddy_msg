// ============================================================================
// src/services/AuthService.js — Authentication Service
// ============================================================================
// Handles user registration, login, and JWT token management.
// Uses bcrypt for password hashing and JWT for stateless auth tokens.
// ============================================================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../infrastructure/logger');
const eventBus = require('../infrastructure/eventBus');

class AuthService {
  constructor(userRepository) {
    this._userRepo = userRepository;
  }

  /**
   * Register a new user.
   * @param {Object} data — { username, email, password, displayName? }
   * @returns {{ user: Object, token: string }}
   */
  async register({ username, email, password, displayName }) {
    // Check for existing user
    const existingUsername = this._userRepo.findByUsername(username);
    if (existingUsername) {
      const error = new Error('Username already taken');
      error.statusCode = 409;
      throw error;
    }

    const existingEmail = this._userRepo.findByEmail(email);
    if (existingEmail) {
      const error = new Error('Email already registered');
      error.statusCode = 409;
      throw error;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);

    // Create user
    const userData = {
      id: uuidv4(),
      username,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      display_name: displayName || username,
      status: 'offline',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const user = this._userRepo.create(userData);

    // Generate token
    const token = this._generateToken(user);
    const refreshToken = this._generateRefreshToken(user);

    // Emit event
    eventBus.emitEvent('user:registered', { userId: user.id, username: user.username });

    logger.info('User registered', { userId: user.id, username: user.username });

    return {
      user: user.toJSON(),
      token,
      refreshToken,
    };
  }

  /**
   * Login a user.
   * @param {Object} data — { email, password }
   * @returns {{ user: Object, token: string }}
   */
  async login({ email, password }) {
    const user = this._userRepo.findByEmail(email.toLowerCase());
    if (!user) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    // Generate tokens
    const token = this._generateToken(user);
    const refreshToken = this._generateRefreshToken(user);

    // Emit event
    eventBus.emitEvent('user:login', { userId: user.id });

    logger.info('User logged in', { userId: user.id, username: user.username });

    return {
      user: user.toJSON(),
      token,
      refreshToken,
    };
  }

  /**
   * Refresh a JWT token.
   * @param {string} refreshToken
   * @returns {{ token: string, refreshToken: string }}
   */
  refreshToken(refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, config.jwt.secret);
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      const user = this._userRepo.findById(payload.userId);
      if (!user) {
        const error = new Error('User not found');
        error.statusCode = 401;
        throw error;
      }

      return {
        token: this._generateToken(user),
        refreshToken: this._generateRefreshToken(user),
      };
    } catch (err) {
      const error = new Error('Invalid refresh token');
      error.statusCode = 401;
      throw error;
    }
  }

  /**
   * Verify a JWT token and return the payload.
   * @param {string} token
   * @returns {Object} — { userId, username }
   */
  verifyToken(token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret);
      return { userId: payload.userId, username: payload.username };
    } catch (err) {
      const error = new Error('Invalid or expired token');
      error.statusCode = 401;
      throw error;
    }
  }

  /**
   * @private
   */
  _generateToken(user) {
    return jwt.sign(
      { userId: user.id, username: user.username, type: 'access' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }

  /**
   * @private
   */
  _generateRefreshToken(user) {
    return jwt.sign(
      { userId: user.id, type: 'refresh' },
      config.jwt.secret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );
  }
}

module.exports = AuthService;
