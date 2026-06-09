import express from 'express';
import Snippet from '../models/Snippet.js';
import Collection from '../models/Collection.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q, language, tags, author, type = 'snippets', page = 1, limit = 20 } = req.query;

    if (type === 'snippets') {
      // Build the privacy filter
      const privacyFilter = req.user
        ? { $or: [{ isPublic: true }, { author: req.user._id }] }
        : { isPublic: true };

      // Build the search filter
      const searchFilter = {};
      if (q) searchFilter.$text = { $search: q };
      if (language) searchFilter.language = language;
      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim());
        searchFilter.tags = { $in: tagArray };
      }
      if (author) searchFilter.author = author;

      // Merge filters properly with $and to avoid $or collisions
      let query;
      if (Object.keys(searchFilter).length > 0) {
        query = { $and: [privacyFilter, searchFilter] };
      } else {
        query = privacyFilter;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const snippets = await Snippet.find(query)
        .populate('author', 'username avatar')
        .sort(q ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await Snippet.countDocuments(query);

      return res.json({
        type: 'snippets',
        results: snippets,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        total,
      });
    }

    if (type === 'collections') {
      // Build the privacy filter
      const privacyFilter = req.user
        ? { $or: [{ isPublic: true }, { owner: req.user._id }] }
        : { isPublic: true };

      // Build the search filter
      let searchFilter = null;
      if (q) {
        searchFilter = {
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
          ],
        };
      }

      // Merge properly with $and
      const query = searchFilter
        ? { $and: [privacyFilter, searchFilter] }
        : privacyFilter;

      const collections = await Collection.find(query)
        .populate('owner', 'username')
        .populate('snippets', 'title language')
        .sort({ createdAt: -1 })
        .lean();

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
