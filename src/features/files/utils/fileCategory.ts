import { isImageFile } from '@/shared/utils/fileTypeUtils';

export type FileCategory = 'all' | 'documents' | 'images' | 'other';
export type AssociationFilter = 'all' | 'matters' | 'intakes';

const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/rtf',
]);

const DOCUMENT_MIME_PREFIXES = [
  'application/vnd.openxmlformats-',
  'application/vnd.oasis.opendocument',
  'application/vnd.ms-',
  'text/',
];

export const categorizeMime = (mimeType: string | null | undefined): Exclude<FileCategory, 'all'> => {
  const mime = (mimeType ?? '').toLowerCase();
  if (isImageFile(mime)) return 'images';
  if (DOCUMENT_MIMES.has(mime)) return 'documents';
  if (DOCUMENT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return 'documents';
  return 'other';
};

export type FolderKind = 'matter' | 'intake' | 'loose';

export interface DerivedFolder {
  id: string;
  label: string;
  kind: FolderKind;
  count: number;
  matterId?: string | null;
  intakeUuid?: string | null;
}

export interface OrgFile {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  publicUrl: string | null;
  uploadId: string;
  createdAt: string | null;
  matterId: string | null;
  matterTitle: string | null;
  intakeUuid: string | null;
  intakeTitle: string | null;
}

export const folderForFile = (file: OrgFile): { id: string; label: string; kind: FolderKind } => {
  if (file.matterId) {
    return {
      id: `matter:${file.matterId}`,
      label: file.matterTitle?.trim() || 'Untitled matter',
      kind: 'matter',
    };
  }
  if (file.intakeUuid) {
    return {
      id: `intake:${file.intakeUuid}`,
      label: file.intakeTitle?.trim()
        ? `Intake — ${file.intakeTitle.trim()}`
        : 'Intake',
      kind: 'intake',
    };
  }
  return { id: 'loose', label: 'Loose files', kind: 'loose' };
};

export const deriveFolders = (files: OrgFile[]): DerivedFolder[] => {
  const map = new Map<string, DerivedFolder>();
  for (const file of files) {
    const base = folderForFile(file);
    const existing = map.get(base.id);
    if (existing) {
      existing.count += 1;
      continue;
    }
    map.set(base.id, {
      id: base.id,
      label: base.label,
      kind: base.kind,
      count: 1,
      matterId: file.matterId ?? null,
      intakeUuid: file.intakeUuid ?? null,
    });
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.kind === b.kind) return a.label.localeCompare(b.label);
    if (a.kind === 'loose') return 1;
    if (b.kind === 'loose') return -1;
    if (a.kind === 'matter') return -1;
    return 1;
  });
};
