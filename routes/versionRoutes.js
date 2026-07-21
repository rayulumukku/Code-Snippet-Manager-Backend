import express from 'express';
import mongoose from 'mongoose';
import Snippet from '../models/Snippet.js';
import SnippetVersion from '../models/SnippetVersion.js';
import { protect, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// ─── GET SNIPPET VERSION HISTORY ──────────────────────────────────────────────
router.get('/:id/history', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    const snippet = await Snippet.findById(id);
    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    if (!snippet.isPublic && req.user?._id?.toString() !== snippet.author.toString()) {
      return res.status(403).json({ message: 'Not authorized to view history' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const versions = await SnippetVersion.find({ snippet: id })
      .sort({ versionNumber: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'username avatar')
      .lean();

    const total = await SnippetVersion.countDocuments({ snippet: id });

    res.json({
      versions,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      currentSnippet: {
        _id: snippet._id,
        title: snippet.title,
        code: snippet.code,
        language: snippet.language,
        updatedAt: snippet.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get snippet history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET SPECIFIC VERSION DETAILS ──────────────────────────────────────────────
router.get('/:id/history/:versionId', optionalAuth, async (req, res) => {
  try {
    const { id, versionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(versionId)) {
      return res.status(404).json({ message: 'Invalid ID' });
    }

    const snippet = await Snippet.findById(id);
    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    if (!snippet.isPublic && req.user?._id?.toString() !== snippet.author.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this version' });
    }

    const version = await SnippetVersion.findById(versionId).populate('createdBy', 'username avatar');
    if (!version || version.snippet.toString() !== id) {
      return res.status(404).json({ message: 'Version snapshot not found' });
    }

    res.json(version);
  } catch (error) {
    console.error('Get version detail error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── RESTORE PREVIOUS VERSION ──────────────────────────────────────────────────
router.post('/:id/restore/:versionId', protect, async (req, res) => {
  try {
    const { id, versionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(versionId)) {
      return res.status(404).json({ message: 'Invalid ID' });
    }

    const snippet = await Snippet.findById(id);
    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    if (snippet.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only snippet owner can restore versions' });
    }

    const targetVersion = await SnippetVersion.findById(versionId);
    if (!targetVersion || targetVersion.snippet.toString() !== id) {
      return res.status(404).json({ message: 'Target version not found' });
    }

    // Save current pre-restore state as a snapshot first
    const latestVersionDoc = await SnippetVersion.findOne({ snippet: id }).sort({ versionNumber: -1 });
    const nextVer = (latestVersionDoc?.versionNumber || 0) + 1;

    await SnippetVersion.create({
      snippet: id,
      versionNumber: nextVer,
      title: snippet.title,
      code: snippet.code,
      description: snippet.description || '',
      language: snippet.language,
      tags: snippet.tags || [],
      changeSummary: `Pre-restore snapshot before applying v${targetVersion.versionNumber}`,
      createdBy: req.user._id,
    });

    // Update snippet with target version content
    const restoredSnippet = await Snippet.findByIdAndUpdate(
      id,
      {
        title: targetVersion.title,
        code: targetVersion.code,
        description: targetVersion.description,
        language: targetVersion.language,
        tags: targetVersion.tags,
      },
      { new: true }
    ).populate('author', 'username avatar');

    // Create entry for restore action
    await SnippetVersion.create({
      snippet: id,
      versionNumber: nextVer + 1,
      title: restoredSnippet.title,
      code: restoredSnippet.code,
      description: restoredSnippet.description || '',
      language: restoredSnippet.language,
      tags: restoredSnippet.tags || [],
      changeSummary: `Restored from version v${targetVersion.versionNumber}`,
      createdBy: req.user._id,
      isRestorePoint: true,
    });

    res.json({
      message: `Successfully restored snippet to version v${targetVersion.versionNumber}`,
      snippet: restoredSnippet,
    });
  } catch (error) {
    console.error('Restore version error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
