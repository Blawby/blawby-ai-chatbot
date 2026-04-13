type IntakeTitleMetadata = {
  title?: unknown;
  intake_title?: unknown;
  intakeTitle?: unknown;
  description?: unknown;
  opposing_party?: unknown;
  opposingParty?: unknown;
  on_behalf_of?: unknown;
  onBehalfOf?: unknown;
  name?: unknown;
};

const trimString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeTitle = (value: string): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 80 ? normalized.slice(0, 80).trim() : normalized;
};

const descriptionFallback = (description: string): string => {
  const sentence = description.split(/[.!?]\s/)[0]?.trim() || description;
  const words = sentence.split(/\s+/).filter(Boolean).slice(0, 8);
  return normalizeTitle(words.join(' '));
};

export const resolveIntakeTitle = (
  metadata: IntakeTitleMetadata | null | undefined,
  fallback = 'Untitled intake'
): string => {
  const title = trimString(metadata?.title)
    || trimString(metadata?.intake_title)
    || trimString(metadata?.intakeTitle);
  if (title) return normalizeTitle(title);

  const description = trimString(metadata?.description);
  if (description) {
    const descriptionTitle = descriptionFallback(description);
    if (descriptionTitle) return descriptionTitle;
  }

  const representedParty = trimString(metadata?.on_behalf_of) || trimString(metadata?.onBehalfOf);
  const contactName = trimString(metadata?.name);
  const opposingParty = trimString(metadata?.opposing_party) || trimString(metadata?.opposingParty);
  if (representedParty && opposingParty) return normalizeTitle(`${representedParty} matter with ${opposingParty}`);
  if (representedParty) return normalizeTitle(`${representedParty} intake`);
  if (contactName) return normalizeTitle(`${contactName} intake`);

  return normalizeTitle(trimString(fallback));
};
