import express from 'express';
import mongoose from 'mongoose';
import Snippet from '../models/Snippet.js';
import Collection from '../models/Collection.js';
import User from '../models/User.js';
import SearchLog from '../models/SearchLog.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── MAIN SEARCH ENDPOINT ──────────────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  const startTime = Date.now();
  try {
    const {
      q,
      language,
      tags,
      author,
      dateFrom,
      dateTo,
      sort = 'relevance',
      type = 'snippets',
    } = req.query;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const skip = (page - 1) * limit;

    const trimmedQ = typeof q === 'string' ? q.trim() : '';

    if (type === 'snippets') {
      const privacyFilter = req.user
        ? { $or: [{ isPublic: true }, { author: new mongoose.Types.ObjectId(req.user._id) }] }
        : { isPublic: true };

      const searchConditions = [];

      // Query matching logic ($text search + regex symbol fallback)
      if (trimmedQ) {
        const escaped = escapeRegex(trimmedQ);
        searchConditions.push({
          $or: [
            { $text: { $search: trimmedQ } },
            { title: { $regex: escaped, $options: 'i' } },
            { tags: { $regex: '^' + escaped, $options: 'i' } },
            { code: { $regex: escaped, $options: 'i' } },
          ],
        });
      }

      if (language) searchConditions.push({ language });

      if (tags) {
        const tagArray = Array.isArray(tags)
          ? tags
          : String(tags).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        if (tagArray.length > 0) {
          searchConditions.push({ tags: { $in: tagArray } });
        }
      }

      if (author) {
        if (mongoose.Types.ObjectId.isValid(author)) {
          searchConditions.push({ author: new mongoose.Types.ObjectId(author) });
        } else {
          // Author passed as username
          const matchedUser = await User.findOne({ username: author }).select('_id');
          if (matchedUser) {
            searchConditions.push({ author: matchedUser._id });
          } else {
            return res.json({
              type: 'snippets',
              results: [],
              total: 0,
              currentPage: page,
              totalPages: 0,
              executionTimeMs: Date.now() - startTime,
            });
          }
        }
      }

      // Date Range Filter
      if (dateFrom || dateTo) {
        const dateQuery = {};
        if (dateFrom) dateQuery.$gte = new Date(dateFrom);
        if (dateTo) dateQuery.$lte = new Date(dateTo);
        searchConditions.push({ createdAt: dateQuery });
      }

      const finalQuery = searchConditions.length > 0
        ? { $and: [privacyFilter, ...searchConditions] }
        : privacyFilter;

      // Sorting strategy
      let sortOptions = { createdAt: -1 };
      if (sort === 'relevance' && trimmedQ) {
        sortOptions = { score: { $meta: 'textScore' }, createdAt: -1 };
      } else if (sort === 'oldest') {
        sortOptions = { createdAt: 1 };
      } else if (sort === 'views') {
        sortOptions = { views: -1 };
      } else if (sort === 'likes') {
        sortOptions = { likeCount: -1 };
      } else if (sort === 'forks') {
        sortOptions = { forkCount: -1 };
      } else if (sort === 'newest') {
        sortOptions = { createdAt: -1 };
      }

      const snippets = await Snippet.find(finalQuery)
        .populate('author', 'username avatar')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Snippet.countDocuments(finalQuery);

      const userId = req.user?._id?.toString();
      const enriched = snippets.map((s) => ({
        ...s,
        isLiked: userId ? (s.likes || []).some((id) => id.toString() === userId) : false,
      }));

      // Asynchronously log search query for analytics
      if (trimmedQ) {
        SearchLog.create({
          query: trimmedQ,
          user: req.user ? req.user._id : null,
          resultCount: total,
          languageFilter: language || null,
        }).catch((err) => console.error('Failed to log search:', err));
      }

      return res.json({
        type: 'snippets',
        results: enriched,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        executionTimeMs: Date.now() - startTime,
      });
    }

    if (type === 'collections') {
      const privacyFilter = req.user
        ? { $or: [{ isPublic: true }, { owner: new mongoose.Types.ObjectId(req.user._id) }] }
        : { isPublic: true };

      const searchConditions = [];

      if (trimmedQ) {
        const escaped = escapeRegex(trimmedQ);
        searchConditions.push({
          $or: [
            { $text: { $search: trimmedQ } },
            { name: { $regex: escaped, $options: 'i' } },
            { description: { $regex: escaped, $options: 'i' } },
          ],
        });
      }

      const finalQuery = searchConditions.length > 0
        ? { $and: [privacyFilter, ...searchConditions] }
        : privacyFilter;

      const collections = await Collection.find(finalQuery)
        .populate('owner', 'username avatar')
        .populate('snippets', 'title language')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Collection.countDocuments(finalQuery);

      return res.json({
        type: 'collections',
        results: collections,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        executionTimeMs: Date.now() - startTime,
      });
    }

    res.status(400).json({ message: 'Invalid search type' });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── SEARCH SUGGESTIONS (AUTOCOMPLETE) ─────────────────────────────────────────
router.get('/suggestions', optionalAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.json({ titles: [], tags: [], authors: [] });
    }

    const trimmed = q.trim().toLowerCase();
    const escaped = escapeRegex(trimmed);

    const privacyFilter = req.user
      ? { $or: [{ isPublic: true }, { author: req.user._id }] }
      : { isPublic: true };

    const [matchingSnippets, matchingAuthors] = await Promise.all([
      Snippet.find({
        $and: [
          privacyFilter,
          {
            $or: [
              { title: { $regex: escaped, $options: 'i' } },
              { tags: { $regex: '^' + escaped, $options: 'i' } },
            ],
          },
        ],
      })
        .select('title tags')
        .limit(10)
        .lean(),

      User.find({ username: { $regex: '^' + escaped, $options: 'i' } })
        .select('username avatar')
        .limit(5)
        .lean(),
    ]);

    const titleSet = new Set();
    const tagSet = new Set();

    matchingSnippets.forEach((s) => {
      if (s.title && s.title.toLowerCase().includes(trimmed)) {
        titleSet.add(s.title);
      }
      (s.tags || []).forEach((t) => {
        if (t.toLowerCase().includes(trimmed)) {
          tagSet.add(t);
        }
      });
    });

    res.json({
      titles: Array.from(titleSet).slice(0, 5),
      tags: Array.from(tagSet).slice(0, 5),
      authors: matchingAuthors.map((u) => ({ username: u.username, avatar: u.avatar })),
    });
  } catch (error) {
    console.error('Search suggestions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── TRENDING SEARCHES ─────────────────────────────────────────────────────────
router.get('/trending', async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const trending = await SearchLog.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: '$query', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json(trending.map((t) => ({ term: t._id, count: t.count })));
  } catch (error) {
    console.error('Get trending search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
