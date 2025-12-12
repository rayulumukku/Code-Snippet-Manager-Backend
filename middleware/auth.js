import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      if (!process.env.JWT_SECRET) {
        req.user = null;
        return next();
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      try {
        req.user = await User.findById(decoded.id).select('-password');
        if (!req.user) {
          req.user = null;
        }
      } catch (dbError) {
        console.error('Database error in optionalAuth:', dbError);
        req.user = null;
      }
    } catch (error) {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
};

