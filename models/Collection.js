import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    snippets: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Snippet',
      },
    ],
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

collectionSchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 3 }, default_language: 'english' }
);
collectionSchema.index({ isPublic: 1, createdAt: -1 });
collectionSchema.index({ owner: 1, createdAt: -1 });

const Collection = mongoose.model('Collection', collectionSchema);

export default Collection;

