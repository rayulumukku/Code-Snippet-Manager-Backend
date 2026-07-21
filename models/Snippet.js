import mongoose from 'mongoose';

const snippetSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    code: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      required: true,
      enum: [
        'javascript',
        'python',
        'java',
        'cpp',
        'c',
        'csharp',
        'ruby',
        'go',
        'rust',
        'php',
        'swift',
        'kotlin',
        'typescript',
        'html',
        'css',
        'sql',
        'json',
        'xml',
        'markdown',
        'shell',
        'other',
      ],
      default: 'javascript',
    },
    tags: {
      type: [String],
      default: [],
      set: (v) => {
        if (!Array.isArray(v)) return [];
        const cleaned = v
          .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
          .filter((t) => t.length > 0 && t.length <= 30);
        return Array.from(new Set(cleaned)).slice(0, 10);
      },
      validate: [
        {
          validator: (v) => Array.isArray(v) && v.length <= 10,
          message: 'A snippet can have at most 10 tags',
        },
      ],
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    forkedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Snippet',
      default: null,
    },
    forkCount: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    likeCount: {
      type: Number,
      default: 0,
    },
    collections: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Collection',
      },
    ],
    favoriteCount: {
      type: Number,
      default: 0,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    pinnedOrder: {
      type: Number,
      default: 0,
    },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

snippetSchema.index(
  { title: 'text', tags: 'text', description: 'text', code: 'text' },
  {
    weights: { title: 10, tags: 8, description: 5, code: 2 },
    default_language: 'english',
    language_override: 'searchLang',
  }
);
snippetSchema.index({ language: 1, isPublic: 1 });
snippetSchema.index({ isPublic: 1, language: 1, createdAt: -1 });
snippetSchema.index({ isPinned: 1, pinnedOrder: 1 });
snippetSchema.index({ author: 1 });
snippetSchema.index({ likeCount: -1 });
snippetSchema.index({ views: -1 });

// Compound sorting indexes for fast list queries
snippetSchema.index({ isPublic: 1, createdAt: -1 });
snippetSchema.index({ author: 1, createdAt: -1 });
snippetSchema.index({ isPublic: 1, views: -1 });
snippetSchema.index({ isPublic: 1, likeCount: -1 });
snippetSchema.index({ isPublic: 1, forkCount: -1 });
snippetSchema.index({ tags: 1 });
snippetSchema.index({ isPublic: 1, tags: 1, createdAt: -1 });

const Snippet = mongoose.model('Snippet', snippetSchema);

export default Snippet;
