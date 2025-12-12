import jwt from 'jsonwebtoken';

const generateToken = (id) => {
  const options = {};
  const exp = process.env.JWT_EXPIRE;

  
  if (exp && exp.toLowerCase() !== 'none') {
    options.expiresIn = exp; 
  }

  return jwt.sign({ id }, process.env.JWT_SECRET, options);
};

export default generateToken;

