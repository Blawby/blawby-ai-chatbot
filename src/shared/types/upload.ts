export type FileStatus =
 | 'uploading'
 | 'uploaded'
 | 'processing'
 | 'analyzing'
 | 'completed'
 | 'failed';

export interface UploadingFile {
 id: string;
 file: File;
 status: FileStatus;
 progress: number;
 fileId?: string;
 storageKey?: string;
 error?: string;
}
