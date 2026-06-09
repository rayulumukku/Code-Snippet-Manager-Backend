import jwt from 'jsonwebtoken';

const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh', {
    expiresIn: '7d',
  });
};

// Legacy: kept for backward compatibility
const generateToken = (id) => generateAccessToken(id);

export default generateToken;
export { generateAccessToken, generateRefreshToken };
