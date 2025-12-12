import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post(
  '/register',
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
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
        return res.status(400).json({ message: 'User already exists' });
      }

      const user = await User.create({
        username,
        email,
        password,
      });

      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id),
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Server error during registration' });
    }
  }
);


router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Please provide a valid email'),
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

      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id),
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error during login' });
    }
  }
);


router.get('/me', protect, async (req, res) => {
  try {
    res.json({
      _id: req.user._id,
      username: req.user.username,
      email: req.user.email,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

