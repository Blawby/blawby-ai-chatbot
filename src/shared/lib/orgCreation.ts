export type CreatedOrg = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
};

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const unwrapCreated = (result: unknown): CreatedOrg | null => {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  const data = (record.data ?? result) as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') return null;
  return {
    id: typeof data.id === 'string' ? data.id : null,
    slug: typeof data.slug === 'string' ? data.slug : null,
    name: typeof data.name === 'string' ? data.name : null,
  };
};
