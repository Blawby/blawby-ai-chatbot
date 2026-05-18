// Files-specific paging helpers shared by the Files page and upload destination picker.
// This is not a replacement for broader list hooks; these callers need raw arrays from
// both matter and intake sources with identical page-size behavior.
import { listMatters, type BackendMatter } from '@/features/matters/services/mattersApi';
import { listIntakes, type IntakeListItem } from '@/features/intake/api/intakesApi';
import { ORG_FILES_FAN_OUT_LIMIT } from '@/features/files/constants';

export const listAllFileMatters = async (
  practiceId: string,
  signal?: AbortSignal,
): Promise<BackendMatter[]> => {
  const matters: BackendMatter[] = [];
  let page = 1;
  while (true) {
    const pageItems = await listMatters(practiceId, { page, limit: ORG_FILES_FAN_OUT_LIMIT, signal });
    matters.push(...pageItems);
    if (pageItems.length < ORG_FILES_FAN_OUT_LIMIT) break;
    page += 1;
  }
  return matters;
};

export const listAllFileIntakes = async (
  practiceId: string,
  signal?: AbortSignal,
): Promise<IntakeListItem[]> => {
  const intakes: IntakeListItem[] = [];
  let page = 1;
  while (true) {
    const pageResult = await listIntakes(practiceId, { page, limit: ORG_FILES_FAN_OUT_LIMIT }, { signal });
    intakes.push(...pageResult.intakes);
    if (pageResult.intakes.length < ORG_FILES_FAN_OUT_LIMIT) break;
    page += 1;
  }
  return intakes;
};
