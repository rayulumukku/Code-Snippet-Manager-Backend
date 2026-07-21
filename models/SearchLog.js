import mongoose from 'mongoose';

const searchLogSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resultCount: {
      type: Number,
      default: 0,
    },
    languageFilter: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: '30d', // Automatically purge search logs after 30 days
    },
  },
  {
    versionKey: false,
  }
);

searchLogSchema.index({ query: 1 });
searchLogSchema.index({ createdAt: -1 });

const SearchLog = mongoose.model('SearchLog', searchLogSchema);

export default SearchLog;
