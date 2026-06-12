export default {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      issuePrefixes: ['JIRA-'],
    },
  },
  rules: {
    'type-empty': [2, 'never'], // Type is mandatory
    'scope-empty': [2, 'never'], // Scope is mandatory
    'subject-empty': [2, 'never'], // Subject is mandatory
    'footer-leading-blank': [2, 'always'],
    'references-empty': [0, 'never'], // Footer is optional, so references can be empty
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore'],
    ],
  },
};
