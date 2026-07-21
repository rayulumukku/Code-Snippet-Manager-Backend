import express from 'express';
import mongoose from 'mongoose';
import Favorite from '../models/Favorite.js';
import Snippet from '../models/Snippet.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// ─── GET USER FAVORITES ───────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const skip = (page - 1) * limit;

    const favorites = await Favorite.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'snippet',
        populate: { path: 'author', select: 'username avatar' },
      })
      .lean();

    const total = await Favorite.countDocuments({ user: req.user._id });

    // Filter out null snippets if any snippet was deleted
    const snippets = favorites
      .map((f) => f.snippet)
      .filter(Boolean)
      .map((s) => ({
        ...s,
        isFavorited: true,
        isLiked: (s.likes || []).some((id) => id.toString() === req.user._id.toString()),
      }));

    res.json({
      snippets,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET FAVORITED SNIPPET IDS (FAST HYDRATION) ─────────────────────────────
router.get('/ids', protect, async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user._id }).select('snippet').lean();
    const ids = favorites.map((f) => f.snippet.toString());
    res.json(ids);
  } catch (error) {
    console.error('Get favorite IDs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── FAVORITE SNIPPET ─────────────────────────────────────────────────────────
router.post('/:snippetId', protect, async (req, res) => {
  try {
    const { snippetId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(snippetId)) {
      return res.status(400).json({ message: 'Invalid snippet ID' });
    }

    const snippet = await Snippet.findById(snippetId);
    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    if (!snippet.isPublic && snippet.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Cannot favorite private snippet' });
    }

    const existing = await Favorite.findOne({ user: req.user._id, snippet: snippetId });
    if (existing) {
      return res.status(400).json({ message: 'Snippet already favorited' });
    }

    await Favorite.create({ user: req.user._id, snippet: snippetId });
    const updated = await Snippet.findByIdAndUpdate(
      snippetId,
      { $inc: { favoriteCount: 1 } },
      { new: true }
    );

    res.status(201).json({
      message: 'Snippet favorited',
      isFavorited: true,
      favoriteCount: updated.favoriteCount,
    });
  } catch (error) {
    console.error('Favorite snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── UNFAVORITE SNIPPET ───────────────────────────────────────────────────────
router.delete('/:snippetId', protect, async (req, res) => {
  try {
    const { snippetId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(snippetId)) {
      return res.status(400).json({ message: 'Invalid snippet ID' });
    }

    const favorite = await Favorite.findOneAndDelete({ user: req.user._id, snippet: snippetId });
    if (!favorite) {
      return res.status(404).json({ message: 'Favorite not found' });
    }

    const updated = await Snippet.findByIdAndUpdate(
      snippetId,
      { $inc: { favoriteCount: -1 } },
      { new: true }
    );

    res.json({
      message: 'Snippet unfavorited',
      isFavorited: false,
      favoriteCount: Math.max(0, updated?.favoriteCount || 0),
    });
  } catch (error) {
    console.error('Unfavorite snippet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
