import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    snippet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Snippet',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: Prevents duplicate favoriting & optimizes fast lookups
favoriteSchema.index({ user: 1, snippet: 1 }, { unique: true });
favoriteSchema.index({ user: 1, createdAt: -1 });
favoriteSchema.index({ snippet: 1 });

const Favorite = mongoose.model('Favorite', favoriteSchema);

export default Favorite;
