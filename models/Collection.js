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

const Collection = mongoose.model('Collection', collectionSchema);

export default Collection;

