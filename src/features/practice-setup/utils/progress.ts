export interface PracticeSetupProgressInputs {
  name?: string | null;
  description?: string | null;
  website?: string | null;
  contactPhone?: string | null;
  businessEmail?: string | null;
  introMessage?: string | null;
  accentColor?: string | null;
  hasServices: boolean;
  hasAddress: boolean;
  hasLogo: boolean;
  hasPayouts: boolean;
}

export interface PracticeSetupProgressResult {
  completionScore: number;
  missingFields: string[];
}

export const calculatePracticeSetupProgress = (
  inputs: PracticeSetupProgressInputs
): PracticeSetupProgressResult => {
  const weightedChecks: Array<[string, boolean, number]> = [
    ['name', Boolean(inputs.name?.trim()), 10],
    ['description', Boolean(inputs.description?.trim()), 15],
    ['services', inputs.hasServices, 20],
    ['website', Boolean(inputs.website?.trim()), 5],
    ['contactPhone', Boolean(inputs.contactPhone?.trim()), 10],
    ['businessEmail', Boolean(inputs.businessEmail?.trim()), 10],
    ['address', inputs.hasAddress, 15],
    ['introMessage', Boolean(inputs.introMessage?.trim()), 15],
    ['accentColor', Boolean(inputs.accentColor?.trim()), 5],
    ['logo', inputs.hasLogo, 5],
    ['payouts', inputs.hasPayouts, 5],
  ];

  const totalWeight = weightedChecks.reduce((sum, [, , weight]) => sum + weight, 0);
  const earnedWeight = weightedChecks.reduce((sum, [, done, weight]) => sum + (done ? weight : 0), 0);

  return {
    completionScore: Math.round((earnedWeight / totalWeight) * 100),
    missingFields: weightedChecks.filter(([, done]) => !done).map(([field]) => field),
  };
};
