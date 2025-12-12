import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import snippetRoutes from './routes/snippetRoutes.js';
import collectionRoutes from './routes/collectionRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import Snippet from './models/Snippet.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/snippets', snippetRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/search', searchRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/code-snippet-manager')
  .then(async () => {
    console.log('MongoDB connected successfully');

    try {
      const collection = mongoose.connection.collection('snippets');
      const indexes = await collection.indexes();
      const textIndex = indexes.find(idx => idx.textIndexVersion);
      if (textIndex) {
        await collection.dropIndex(textIndex.name);
        console.log('Dropped old text index - will be recreated');
      }
 
    } catch (indexError) {
      console.log('Index update skipped:', indexError.message);
    }
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

