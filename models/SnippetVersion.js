import mongoose from 'mongoose';

const snippetVersionSchema = new mongoose.Schema(
  {
    snippet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Snippet',
      required: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    language: {
      type: String,
      required: true,
    },
    tags: [
      {
        type: String,
      },
    ],
    changeSummary: {
      type: String,
      default: 'Updated snippet content',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isRestorePoint: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Indexes for fast history timeline lookups
snippetVersionSchema.index({ snippet: 1, versionNumber: -1 });
snippetVersionSchema.index({ snippet: 1, createdAt: -1 });

const SnippetVersion = mongoose.model('SnippetVersion', snippetVersionSchema);

export default SnippetVersion;
