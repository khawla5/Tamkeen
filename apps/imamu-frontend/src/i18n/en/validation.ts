export const validation = {
  // generic
  required: 'Required',
  fieldRequired: 'This field is required',

  // email
  emailRequired: 'Email is required',
  emailInvalid: 'Enter a valid email',

  // password
  passwordRequired: 'Password is required',
  passwordMin: 'At least 8 characters',
  passwordUppercase: 'Needs an uppercase letter',
  passwordLowercase: 'Needs a lowercase letter',
  passwordNumber: 'Needs a number',
  passwordHint: '8+ chars, uppercase, lowercase, number',

  // role
  roleRequired: 'Pick a role to continue',

  // contact
  phoneInvalid: 'Enter a valid phone number',
  urlInvalid: 'Enter a valid URL',

  // length helpers (named by char count for clarity)
  min2: 'At least 2 characters',
  min3: 'At least 3 characters',
  min4: 'At least 4 characters',
  min10: 'At least 10 characters',
  min20: 'At least 20 characters',
  max120: 'Max 120 characters',
  max500: 'Max 500 characters',
  max1000: 'Max 1000 characters',
  max2000: 'Max 2000 characters',

  // CV
  gpaFormat: 'Format: 3.85 (0–4)',
  educationMin: 'Add at least one education entry',
  skillsMin: 'Add at least one skill',

  // Post Opportunity
  opportunityTypeRequired: 'Choose an opportunity type',
  requiredSkillsMin: 'Add at least one required skill',
  deadlineInvalid: 'Pick a valid deadline',
  numberPositive: 'Must be a positive number',

  // Profile editor
  invalidYear: 'Enter a valid year (e.g. 2026)',

  // Reset password
  passwordMismatch: 'Passwords do not match',
}
