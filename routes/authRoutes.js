import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Snippet from '../models/Snippet.js';
import { generateAccessToken, generateRefreshToken } from '../utils/generateToken.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Rate limiter for auth routes: max 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── REGISTER ────────────────────────────────────────────────────────────────
router.post(
  '/register',
  authLimiter,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{}|;':",.<>?])/)
      .withMessage('Password must contain at least one number and one special character'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, email, password } = req.body;

      const userExists = await User.findOne({
        $or: [{ email }, { username }],
      });

      if (userExists) {
        if (userExists.email === email.toLowerCase()) {
          return res.status(400).json({ message: 'Email already in use' });
        }
        return res.status(400).json({ message: 'Username already taken' });
      }

      const user = await User.create({ username, email, password });

      const accessToken = generateAccessToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      // Persist refresh token
      user.refreshToken = refreshToken;
      await user.save();

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        token: accessToken,
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Server error during registration' });
    }
  }
);

// ─── LOGIN ───────────────────────────────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const accessToken = generateAccessToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      user.refreshToken = refreshToken;
      await user.save();

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        token: accessToken,
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error during login' });
    }
  }
);

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ message: 'No refresh token' });
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh';
    let decoded;
    try {
      decoded = jwt.verify(token, refreshSecret);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: 'Refresh token revoked' });
    }

    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save();

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ token: newAccessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
router.post('/logout', protect, async (req, res) => {
  try {
    req.user.refreshToken = null;
    await req.user.save();
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET CURRENT USER ────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const snippetCount = await Snippet.countDocuments({ author: req.user._id });
    const publicSnippetCount = await Snippet.countDocuments({ author: req.user._id, isPublic: true });

    res.json({
      _id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      bio: req.user.bio,
      avatar: req.user.avatar,
      website: req.user.website,
      githubUrl: req.user.githubUrl,
      snippetCount,
      publicSnippetCount,
      createdAt: req.user.createdAt,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── UPDATE PROFILE ──────────────────────────────────────────────────────────
router.put(
  '/profile',
  protect,
  [
    body('username')
      .optional()
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('bio').optional().trim().isLength({ max: 300 }).withMessage('Bio must be under 300 characters'),
    body('website').optional().trim().isURL({ require_protocol: false }).withMessage('Invalid website URL'),
    body('currentPassword').optional(),
    body('newPassword')
      .optional()
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters')
      .matches(/^(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{}|;':",.<>?])/)
      .withMessage('New password must contain at least one number and one special character'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const { username, bio, website, githubUrl, currentPassword, newPassword } = req.body;

      // Update username if provided and not taken
      if (username && username !== user.username) {
        const taken = await User.findOne({ username });
        if (taken) return res.status(400).json({ message: 'Username already taken' });
        user.username = username;
      }

      if (bio !== undefined) user.bio = bio;
      if (website !== undefined) user.website = website;
      if (githubUrl !== undefined) user.githubUrl = githubUrl;

      // Change password flow
      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ message: 'Current password is required to set a new password' });
        }
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
          return res.status(400).json({ message: 'Current password is incorrect' });
        }
        user.password = newPassword;
      }

      await user.save();

      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        website: user.website,
        githubUrl: user.githubUrl,
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// ─── PUBLIC PROFILE ──────────────────────────────────────────────────────────
router.get('/profile/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select(
      'username bio avatar website githubUrl createdAt'
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    const snippets = await Snippet.find({ author: user._id, isPublic: true })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('title language tags views likeCount createdAt');

    const totalSnippets = await Snippet.countDocuments({ author: user._id, isPublic: true });

    res.json({
      user,
      snippets,
      totalSnippets,
    });
  } catch (error) {
    console.error('Get public profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
