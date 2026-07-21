import express from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Snippet from '../models/Snippet.js';
import Collection from '../models/Collection.js';
import User from '../models/User.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import { validateProfanity } from '../utils/profanityFilter.js';

const router = express.Router();

// Allowlist for snippet fields to prevent field injection attacks
const SNIPPET_ALLOWED_FIELDS = ['title', 'description', 'code', 'language', 'tags', 'isPublic'];

function pickAllowedFields(body, allowedFields) {
  return allowedFields.reduce((acc, key) => {
    if (key in body) acc[key] = body[key];
    return acc;
  }, {});
}

// ─── GET ALL SNIPPETS ─────────────────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { language, tags, author, sort = 'newest' } = req.query;
    const query = {};

    const page = Number.parseInt(req.query.page ?? 1, 10);
    const limit = Number.parseInt(req.query.limit ?? 20, 10);
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 100 ? limit : 20;

    if (req.user && req.user._id) {
      query.$or = [
        { isPublic: true },
        { author: new mongoose.Types.ObjectId(req.user._id) }
      ];
    } else {
      query.isPublic = true;
    }

    if (language) query.language = language;

    if (tags) {
      const tagArray = Array.isArray(tags)
        ? tags
        : String(tags).split(',').map((t) => t.trim()).filter(Boolean);
      if (tagArray.length) query.tags = { $in: tagArray };
    }

    if (author) {
      if (mongoose.Types.ObjectId.isValid(author)) {
        query.author = new mongoose.Types.ObjectId(author);
      } else {
        return res.status(400).json({ message: 'Invalid author id' });
      }
    }

    // Sort options
    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      views: { views: -1 },
      likes: { likeCount: -1 },
      forks: { forkCount: -1 },
    };
    const sortQuery = sortOptions[sort] || sortOptions.newest;

    const skip = (safePage - 1) * safeLimit;

    const snippets = await Snippet.find(query)
      .populate('author', 'username avatar')
      .populate({
        path: 'forkedFrom',
        select: 'title author',
        populate: { path: 'author', select: 'username' }
      })
      .sort(sortQuery)
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Snippet.countDocuments(query);

    // Add isLiked field if user is authenticated
    const userId = req.user?._id?.toString();
    const enriched = snippets.map(s => ({
      ...s,
      isLiked: userId ? (s.likes || []).some(id => id.toString() === userId) : false,
    }));

    res.json({
      snippets: enriched,
      totalPages: Math.ceil(total / safeLimit),
      currentPage: safePage,
      total,
    });
  } catch (error) {
    console.error('Get snippets error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── MY SNIPPETS ──────────────────────────────────────────────────────────────
router.get('/my', protect, async (req, res) => {
  try {
    const { sort = 'newest' } = req.query;
    const page = Number.parseInt(req.query.page ?? 1, 10);
    const limit = Number.parseInt(req.query.limit ?? 20, 10);
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 100 ? limit : 20;

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      views: { views: -1 },
      likes: { likeCount: -1 },
    };
    const sortQuery = sortOptions[sort] || sortOptions.newest;

    const query = { author: req.user._id };
    const skip = (safePage - 1) * safeLimit;

    const snippets = await Snippet.find(query)
      .populate('author', 'username avatar')
      .sort(sortQuery)
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Snippet.countDocuments(query);
    const userId = req.user._id.toString();
    const enriched = snippets.map(s => ({
      ...s,
      isLiked: (s.likes || []).some(id => id.toString() === userId),
    }));

    res.json({
      snippets: enriched,
      totalPages: Math.ceil(total / safeLimit),
      currentPage: safePage,
      total,
    });
  } catch (error) {
    console.error('Get my snippets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET POPULAR TAGS ─────────────────────────────────────────────────────────
router.get('/tags', async (req, res) => {
  try {
    const { limit = 50, search } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

    const pipeline = [
      { $match: { isPublic: true, tags: { $exists: true, $not: { $size: 0 } } } },
      { $unwind: '$tags' },
    ];

    if (search && typeof search === 'string' && search.trim()) {
      pipeline.push({
        $match: { tags: { $regex: search.trim().toLowerCase(), $options: 'i' } },
      });
    }

    pipeline.push(
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: parsedLimit }
    );

    const result = await Snippet.aggregate(pipeline);
    res.json(result.map(r => ({ tag: r._id, count: r.count })));
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET SINGLE SNIPPET ───────────────────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    // Atomic view increment + return updated doc
    const snippet = await Snippet.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    )
      .populate('author', 'username avatar')
      .populate({
        path: 'forkedFrom',
        select: 'title author',
        populate: { path: 'author', select: 'username' }
      });

    if (!snippet) return res.status(404).json({ message: 'Snippet not found' });

    if (!snippet.isPublic && (!req.user || snippet.author._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const userId = req.user?._id?.toString();
    const plain = snippet.toObject();
    plain.isLiked = userId ? (plain.likes || []).some(id => id.toString() === userId) : false;

    res.json(plain);
  } catch (error) {
    console.error('Get snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── CREATE SNIPPET ───────────────────────────────────────────────────────────
router.post(
  '/',
  protect,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('code').notEmpty().withMessage('Code is required'),
    body('language').notEmpty().withMessage('Language is required'),
    body('tags').optional().isArray({ max: 10 }).withMessage('Tags must be an array with at most 10 items'),
    body('tags.*').optional().isString().trim().isLength({ max: 30 }).withMessage('Each tag must be 30 characters or less'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const profanityError = validateProfanity(req.body, ['title', 'description', 'tags']);
      if (profanityError) return res.status(400).json({ message: profanityError });

      // Sanitize: only allow whitelisted fields
      const safeData = pickAllowedFields(req.body, SNIPPET_ALLOWED_FIELDS);

      const snippet = await Snippet.create({ ...safeData, author: req.user._id });
      const populated = await Snippet.findById(snippet._id).populate('author', 'username avatar');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create snippet error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// ─── UPDATE SNIPPET ───────────────────────────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    const snippet = await Snippet.findById(req.params.id);
    if (!snippet) return res.status(404).json({ message: 'Snippet not found' });

    if (snippet.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this snippet' });
    }

    const profanityError = validateProfanity(req.body, ['title', 'description', 'tags']);
    if (profanityError) return res.status(400).json({ message: profanityError });

    const safeData = pickAllowedFields(req.body, SNIPPET_ALLOWED_FIELDS);

    const updated = await Snippet.findByIdAndUpdate(req.params.id, safeData, {
      new: true,
      runValidators: true,
    }).populate('author', 'username avatar');

    res.json(updated);
  } catch (error) {
    console.error('Update snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── DELETE SNIPPET ───────────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    const snippet = await Snippet.findById(req.params.id);
    if (!snippet) return res.status(404).json({ message: 'Snippet not found' });

    if (snippet.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this snippet' });
    }

    // Clean up references in collections
    await Collection.updateMany(
      { snippets: req.params.id },
      { $pull: { snippets: req.params.id } }
    );

    await Snippet.findByIdAndDelete(req.params.id);
    res.json({ message: 'Snippet deleted successfully' });
  } catch (error) {
    console.error('Delete snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── FORK SNIPPET ─────────────────────────────────────────────────────────────
router.post('/:id/fork', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    const original = await Snippet.findById(req.params.id).populate('author', 'username');
    if (!original) return res.status(404).json({ message: 'Snippet not found' });
    if (!original.isPublic) return res.status(403).json({ message: 'Cannot fork private snippet' });

    const forked = await Snippet.create({
      title: `${original.title} (forked)`,
      description: original.description,
      code: original.code,
      language: original.language,
      tags: original.tags,
      isPublic: true,
      author: req.user._id,
      forkedFrom: original._id,
    });

    // Atomic increment of forkCount
    await Snippet.findByIdAndUpdate(original._id, { $inc: { forkCount: 1 } });

    const populated = await Snippet.findById(forked._id)
      .populate('author', 'username avatar')
      .populate('forkedFrom', 'title author');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Fork snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET FORKS ────────────────────────────────────────────────────────────────
router.get('/:id/forks', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    const forks = await Snippet.find({ forkedFrom: req.params.id })
      .populate('author', 'username')
      .select('author createdAt')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      forks: forks.map(f => ({ username: f.author?.username || 'Unknown', forkedAt: f.createdAt })),
      total: forks.length,
    });
  } catch (error) {
    console.error('Get forks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── LIKE SNIPPET ─────────────────────────────────────────────────────────────
router.post('/:id/like', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    const snippet = await Snippet.findById(req.params.id);
    if (!snippet) return res.status(404).json({ message: 'Snippet not found' });

    if (!snippet.isPublic && snippet.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Cannot like private snippet' });
    }

    const alreadyLiked = snippet.likes.some(id => id.toString() === req.user._id.toString());
    if (alreadyLiked) {
      return res.status(400).json({ message: 'Already liked' });
    }

    await Snippet.findByIdAndUpdate(req.params.id, {
      $addToSet: { likes: req.user._id },
      $inc: { likeCount: 1 },
    });

    res.json({ message: 'Liked', likeCount: snippet.likeCount + 1, isLiked: true });
  } catch (error) {
    console.error('Like snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── UNLIKE SNIPPET ───────────────────────────────────────────────────────────
router.delete('/:id/like', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    const snippet = await Snippet.findById(req.params.id);
    if (!snippet) return res.status(404).json({ message: 'Snippet not found' });

    const liked = snippet.likes.some(id => id.toString() === req.user._id.toString());
    if (!liked) return res.status(400).json({ message: 'Not liked yet' });

    await Snippet.findByIdAndUpdate(req.params.id, {
      $pull: { likes: req.user._id },
      $inc: { likeCount: -1 },
    });

    res.json({ message: 'Unliked', likeCount: Math.max(0, snippet.likeCount - 1), isLiked: false });
  } catch (error) {
    console.error('Unlike snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
