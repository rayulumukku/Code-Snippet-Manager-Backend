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

export const hasProfanity = (text) => {
  if (!text || typeof text !== 'string') return false;
  return matcher.hasMatch(text);
};

export const censorProfanity = (text) => {
  if (!text || typeof text !== 'string') return text;
  const matches = matcher.getAllMatches(text);
  return censor.applyTo(text, matches);
};


export const validateProfanity = (data, fields) => {
  for (const field of fields) {
    const value = data[field];
    if (!value) continue;

    if (typeof value === 'string' && hasProfanity(value)) {
      return `Profanity detected in ${field}. Please use appropriate language.`;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && hasProfanity(item)) {
          return `Profanity detected in ${field}. Please use appropriate language.`;
        }
      }
    }
  }
  return null;
};
