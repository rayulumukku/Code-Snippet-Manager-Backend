import express from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Snippet from '../models/Snippet.js';
import Collection from '../models/Collection.js';
import { protect, optionalAuth } from '../middleware/auth.js';

const router = express.Router();


router.get('/', optionalAuth, async (req, res) => {
  try {
    const { language, tags, author } = req.query;
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

    if (language) {
      query.language = language;
    }
    if (tags) {

      const tagArray = Array.isArray(tags)
        ? tags
        : String(tags)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
      if (tagArray.length) {
        query.tags = { $in: tagArray };
      }
    }

    if (author) {
      if (mongoose.Types.ObjectId.isValid(author)) {
        query.author = new mongoose.Types.ObjectId(author);
      } else {
        return res.status(400).json({ message: 'Invalid author id' });
      }
    }

    const skip = (safePage - 1) * safeLimit;

    const snippets = await Snippet.find(query)
      .populate('author', 'username')
      .populate({
        path: 'forkedFrom',
        select: 'title author',
        populate: {
          path: 'author',
          select: 'username'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Snippet.countDocuments(query);

    res.json({
      snippets,
      totalPages: Math.ceil(total / safeLimit),
      currentPage: safePage,
      total,
    });
  } catch (error) {
    console.error('Get snippets error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});


router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const snippet = await Snippet.findById(req.params.id)
      .populate('author', 'username')
      .populate('forkedFrom', 'title author');

    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

   
    if (!snippet.isPublic && (!req.user || snippet.author._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }

  
    snippet.views += 1;
    await snippet.save();

    res.json(snippet);
  } catch (error) {
    console.error('Get snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.post(
  '/',
  protect,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('code').notEmpty().withMessage('Code is required'),
    body('language').notEmpty().withMessage('Language is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const snippet = await Snippet.create({
        ...req.body,
        author: req.user._id,
      });

      const populatedSnippet = await Snippet.findById(snippet._id)
        .populate('author', 'username');

      res.status(201).json(populatedSnippet);
    } catch (error) {
      console.error('Create snippet error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);


router.put('/:id', protect, async (req, res) => {
  try {
    const snippet = await Snippet.findById(req.params.id);

    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

   
    if (snippet.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this snippet' });
    }

    const updatedSnippet = await Snippet.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('author', 'username');

    res.json(updatedSnippet);
  } catch (error) {
    console.error('Update snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.delete('/:id', protect, async (req, res) => {
  try {
    const snippet = await Snippet.findById(req.params.id);

    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

   
    if (snippet.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this snippet' });
    }

   
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


router.post('/:id/fork', protect, async (req, res) => {
  try {
    const originalSnippet = await Snippet.findById(req.params.id)
      .populate('author', 'username');

    if (!originalSnippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    if (!originalSnippet.isPublic) {
      return res.status(403).json({ message: 'Cannot fork private snippet' });
    }

    
    const forkedSnippet = await Snippet.create({
      title: `${originalSnippet.title} (forked)`,
      description: originalSnippet.description,
      code: originalSnippet.code,
      language: originalSnippet.language,
      tags: originalSnippet.tags,
      isPublic: true, // Forked snippets are public by default
      author: req.user._id,
      forkedFrom: originalSnippet._id,
    });

   
    originalSnippet.forkCount += 1;
    await originalSnippet.save();

    const populatedSnippet = await Snippet.findById(forkedSnippet._id)
      .populate('author', 'username')
      .populate('forkedFrom', 'title author');

    res.status(201).json(populatedSnippet);
  } catch (error) {
    console.error('Fork snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/:id/forks', async (req, res) => {
  try {
    const forks = await Snippet.find({ forkedFrom: req.params.id })
      .populate('author', 'username')
      .select('author createdAt')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      forks: forks.map(fork => ({
        username: fork.author?.username || 'Unknown',
        forkedAt: fork.createdAt
      })),
      total: forks.length
    });
  } catch (error) {
    console.error('Get forks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

