import type { MatterStatus } from '@/shared/types/matterStatus';

export const MATTER_STATUS_BADGE_CLASS: Record<MatterStatus, string> = {
  first_contact: 'bg-[#3A2A12] text-[#FBBF24] ring-[#854D0E]/80',
  intake_pending: 'bg-sky-950/55 text-sky-300 ring-sky-700/70',
  conflict_check: 'bg-violet-950/55 text-violet-300 ring-violet-700/70',
  conflicted: 'bg-[#3B1216] text-[#F87171] ring-[#7F1D1D]/80',
  eligibility: 'bg-cyan-950/55 text-cyan-300 ring-cyan-700/70',
  referred: 'bg-[#252B35] text-[#94A3B8] ring-[#334155]/80',
  consultation_scheduled: 'bg-blue-950/55 text-blue-300 ring-blue-700/70',
  declined: 'bg-[#3B1216] text-[#F87171] ring-[#7F1D1D]/80',
  engagement_draft: 'bg-[#252B35] text-[#94A3B8] ring-[#334155]/80',
  engagement_sent: 'bg-violet-950/55 text-violet-300 ring-violet-700/70',
  engagement_accepted: 'bg-[#123524] text-[#4ADE80] ring-[#166534]/80',
  engagement_pending: 'bg-[#3A2A12] text-[#FBBF24] ring-[#854D0E]/80',
  active: 'bg-[#123524] text-[#4ADE80] ring-[#166534]/80',
  pleadings_filed: 'bg-cyan-950/55 text-cyan-300 ring-cyan-700/70',
  discovery: 'bg-blue-950/55 text-blue-300 ring-blue-700/70',
  mediation: 'bg-violet-950/55 text-violet-300 ring-violet-700/70',
  pre_trial: 'bg-violet-950/55 text-violet-300 ring-violet-700/70',
  trial: 'bg-[#3B1216] text-[#F87171] ring-[#7F1D1D]/80',
  order_entered: 'bg-[#123524] text-[#4ADE80] ring-[#166534]/80',
  appeal_pending: 'bg-[#3A2A12] text-[#FBBF24] ring-[#854D0E]/80',
  closed: 'bg-[#252B35] text-[#94A3B8] ring-[#334155]/80'
};

export const MATTER_STATUS_DOT_CLASS: Record<MatterStatus, string> = {
  first_contact: 'text-amber-600 dark:text-amber-400',
  intake_pending: 'text-sky-600 dark:text-sky-400',
  conflict_check: 'text-violet-600 dark:text-violet-400',
  conflicted: 'text-rose-600 dark:text-rose-400',
  eligibility: 'text-cyan-600 dark:text-cyan-400',
  referred: 'text-slate-600 dark:text-slate-400',
  consultation_scheduled: 'text-blue-600 dark:text-blue-400',
  declined: 'text-rose-600 dark:text-rose-400',
  engagement_draft: 'text-slate-600 dark:text-slate-400',
  engagement_sent: 'text-violet-600 dark:text-violet-400',
  engagement_accepted: 'text-emerald-600 dark:text-emerald-400',
  engagement_pending: 'text-amber-600 dark:text-amber-400',
  active: 'text-emerald-600 dark:text-emerald-400',
  pleadings_filed: 'text-cyan-600 dark:text-cyan-400',
  discovery: 'text-blue-600 dark:text-blue-400',
  mediation: 'text-violet-600 dark:text-violet-400',
  pre_trial: 'text-violet-600 dark:text-violet-400',
  trial: 'text-rose-600 dark:text-rose-400',
  order_entered: 'text-emerald-600 dark:text-emerald-400',
  appeal_pending: 'text-amber-600 dark:text-amber-400',
  closed: 'text-slate-600 dark:text-slate-400'
};
