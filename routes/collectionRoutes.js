import express from 'express';
import { body, validationResult } from 'express-validator';
import Collection from '../models/Collection.js';
import Snippet from '../models/Snippet.js';
import { protect, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', optionalAuth, async (req, res) => {
  try {
    const query = {};

    if (req.user) {
      query.$or = [
        { isPublic: true },
        { owner: req.user._id }
      ];
    } else {
      query.isPublic = true;
    }

    const collections = await Collection.find(query)
      .populate('owner', 'username')
      .populate('snippets', 'title language')
      .sort({ createdAt: -1 });

    res.json(collections);
  } catch (error) {
    console.error('Get collections error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const collection = await Collection.findById(req.params.id)
      .populate('owner', 'username')
      .populate('snippets');

    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }


    if (!collection.isPublic && (!req.user || collection.owner._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(collection);
  } catch (error) {
    console.error('Get collection error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.post(
  '/',
  protect,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const collection = await Collection.create({
        ...req.body,
        owner: req.user._id,
      });

      const populatedCollection = await Collection.findById(collection._id)
        .populate('owner', 'username');

      res.status(201).json(populatedCollection);
    } catch (error) {
      console.error('Create collection error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);


router.put('/:id', protect, async (req, res) => {
  try {
    const collection = await Collection.findById(req.params.id);

    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

   
    if (collection.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this collection' });
    }

    const updatedCollection = await Collection.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('owner', 'username')
      .populate('snippets');

    res.json(updatedCollection);
  } catch (error) {
    console.error('Update collection error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.delete('/:id', protect, async (req, res) => {
  try {
    const collection = await Collection.findById(req.params.id);

    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

   
    if (collection.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this collection' });
    }

    await Collection.findByIdAndDelete(req.params.id);

    res.json({ message: 'Collection deleted successfully' });
  } catch (error) {
    console.error('Delete collection error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.post('/:id/snippets/:snippetId', protect, async (req, res) => {
  try {
    const collection = await Collection.findById(req.params.id);
    const snippet = await Snippet.findById(req.params.snippetId);

    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

 
    if (collection.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to modify this collection' });
    }

  
    if (!snippet.isPublic && snippet.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Cannot add private snippet to collection' });
    }

 
    // Check if trying to add a private snippet to a public collection
    if (!snippet.isPublic && collection.isPublic) {
      return res.status(400).json({ 
        message: 'Private snippets can only be added to private collections. Make your collection private first.' 
      });
    }

  
    if (!collection.snippets.includes(req.params.snippetId)) {
      collection.snippets.push(req.params.snippetId);
      await collection.save();
    }

    const populatedCollection = await Collection.findById(collection._id)
      .populate('owner', 'username')
      .populate('snippets');

    res.json(populatedCollection);
  } catch (error) {
    console.error('Add snippet to collection error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.delete('/:id/snippets/:snippetId', protect, async (req, res) => {
  try {
    const collection = await Collection.findById(req.params.id);

    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

    
    if (collection.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to modify this collection' });
    }

    collection.snippets = collection.snippets.filter(
      (id) => id.toString() !== req.params.snippetId
    );
    await collection.save();

    const populatedCollection = await Collection.findById(collection._id)
      .populate('owner', 'username')
      .populate('snippets');

    res.json(populatedCollection);
  } catch (error) {
    console.error('Remove snippet from collection error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

