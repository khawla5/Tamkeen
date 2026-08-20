export const applications = {
  // Page
  title: 'My Applications',
  subtitle: 'Track every opportunity you\'ve applied to in one place.',

  // Stats / counts
  total: 'Total',
  inProgress: 'In progress',
  decisions: 'Decisions',
  countOne: '{n} application',
  countMany: '{n} applications',

  // Filters
  filterAll: 'All',
  filterInProgress: 'In progress',
  filterDecisions: 'Decisions',

  // Status labels
  statusSubmitted: 'Submitted',
  statusReviewed: 'Reviewed',
  statusShortlisted: 'Shortlisted',
  statusAccepted: 'Accepted',
  statusRejected: 'Not selected',
  statusCvUpdateRequired: 'CV update needed',

  // Card
  appliedOn: 'Applied {date}',
  viewOpportunity: 'View opportunity',

  // Empty state
  emptyTitle: 'No applications yet',
  emptyHint: 'When you apply to an opportunity, it will show up here so you can track its progress.',
  emptyCta: 'Browse opportunities',

  // Filtered empty state
  noResultsTitle: 'No applications in this view',
  noResultsHint: 'Try a different filter or check back as recruiters review your submissions.',

  // Errors
  loadError: 'Couldn\'t load your applications',
  loadErrorRetry: 'Try again',
} as const
