import {
  RegExpMatcher,
  TextCensor,
  englishDataset,
  englishRecommendedTransformers
} from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const censor = new TextCensor();

/**
 * Checks if a string contains profanity
 * @param {string} text - The text to check
 * @returns {boolean} - True if profanity is found
 */
export const hasProfanity = (text) => {
  if (!text || typeof text !== 'string') return false;
  return matcher.hasMatch(text);
};

/**
 * Censors profanity in a string
 * @param {string} text - The text to censor
 * @returns {string} - The censored text
 */
export const censorProfanity = (text) => {
  if (!text || typeof text !== 'string') return text;
  const matches = matcher.getAllMatches(text);
  return censor.applyTo(text, matches);
};

/**
 * Validates an object's fields for profanity
 * @param {Object} data - The data object to check
 * @param {Array<string>} fields - The fields to check
 * @returns {string|null} - Error message if profanity found, otherwise null
 */
export const validateProfanity = (data, fields) => {
  for (const field of fields) {
    if (data[field] && hasProfanity(data[field])) {
      return `Profanity detected in ${field}. Please use appropriate language.`;
    }
  }
  return null;
};
