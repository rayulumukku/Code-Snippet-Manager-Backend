import express from 'express';
import Snippet from '../models/Snippet.js';
import Collection from '../models/Collection.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();


router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q, language, tags, author, type = 'snippets', page = 1, limit = 20 } = req.query;

    if (type === 'snippets') {
      const query = {};


      if (req.user) {
        query.$or = [
          { isPublic: true },
          { author: req.user._id }
        ];
      } else {
        query.isPublic = true;
      }

      if (q) {
        query.$text = { $search: q };
      }

      if (language) {
        query.language = language;
      }
      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : tags.split(',');
        query.tags = { $in: tagArray };
      }
      if (author) {
        query.author = author;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      let snippets;
      if (q) {
        snippets = await Snippet.find(query)
          .populate('author', 'username')
          .sort({ score: { $meta: 'textScore' } })
          .skip(skip)
          .limit(parseInt(limit));
      } else {
        snippets = await Snippet.find(query)
          .populate('author', 'username')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit));
      }

      const total = await Snippet.countDocuments(query);

      return res.json({
        type: 'snippets',
        results: snippets,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        total,
      });
    } else if (type === 'collections') {
      const query = {};

   
      if (req.user) {
        query.$or = [
          { isPublic: true },
          { owner: req.user._id }
        ];
      } else {
        query.isPublic = true;
      }

  
      if (q) {
        query.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } }
        ];
      }

      const collections = await Collection.find(query)
        .populate('owner', 'username')
        .populate('snippets', 'title language')
        .sort({ createdAt: -1 });

      return res.json({
        type: 'collections',
        results: collections,
        total: collections.length,
      });
    }

    res.status(400).json({ message: 'Invalid search type' });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

