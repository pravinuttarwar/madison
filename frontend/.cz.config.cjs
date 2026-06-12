module.exports = {
  types: [
    { value: 'feat', name: 'feat:     A new feature' },
    { value: 'fix', name: 'fix:      A bug fix' },
    { value: 'docs', name: 'docs:     Documentation only changes' },
    {
      value: 'style',
      name: 'style:    Changes that do not affect the meaning of the code (white-space, formatting, etc.)',
    },
    {
      value: 'refactor',
      name: 'refactor: A code change that neither fixes a bug nor adds a feature',
    },
    {
      value: 'test',
      name: 'test:     Adding missing tests or correcting existing tests',
    },
    {
      value: 'chore',
      name: `chore:    Other changes that don't modify src or test files`,
    },
  ],
  scopes: [
    { name: 'api' },
    { name: 'ui' },
    { name: 'auth' },
    { name: 'tests' },
    { name: 'build' },
    { name: 'config' },
  ],
  allowCustomScopes: true,
  allowBreakingChanges: ['feat', 'fix'],
  footerPrefix: 'Refs',
  // body, breaking, and footer are optional by default - users can leave them empty
  // type, scope, and subject are mandatory
  messages: {
    type: "Select the type of change that you're committing: (required)",
    scope:
      'What is the scope of this change (e.g., component or file name): (required)',
    customScope: 'Denote the scope of this change: (required)',
    subject:
      'Write a short, imperative description of the change: (required)\n',
    body: "Provide a longer description of the change (optional). Use '|' to break into new lines:\n",
    breaking: 'List any breaking changes (optional):\n',
    footer:
      'List Jira ticket IDs associated with this change (e.g., JIRA-123). Use "Refs JIRA-123" format:\n',
    confirmCommit: 'Are you sure you want to proceed with the commit above?',
  },
  subjectLimit: 72,
};
