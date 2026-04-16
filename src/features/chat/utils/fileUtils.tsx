import {
	DocumentIcon,
	TableCellsIcon,
	MusicalNoteIcon,
	VideoCameraIcon
} from "@heroicons/react/24/outline";
import { Icon } from '@/shared/ui/Icon';
import { FileAttachment } from '../../../../worker/types';
import type { VNode } from 'preact';

export const formatDocumentIconSize = (bytes: number): string => {
	if (bytes < 0) return '0 B';
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	const clampedIndex = Math.min(i, sizes.length - 1);
	return `${parseFloat((bytes / Math.pow(k, clampedIndex)).toFixed(1))} ${sizes[clampedIndex]}`;
};

export const getDocumentIcon = (file: FileAttachment): VNode => {
	// Get file extension
	const ext = file.name.split('.').pop()?.toLowerCase();
	
	// PDF icon
	if (file.type === 'application/pdf' || ext === 'pdf') {
		return (
			<Icon icon={DocumentIcon} className="w-4 h-4 text-input-placeholder"  />
		);
	}

	// Word document icon
	if (file.type === 'application/msword' ||
		file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		ext === 'doc' || ext === 'docx') {
		return (
			<Icon icon={DocumentIcon} className="w-4 h-4 text-input-placeholder"  />
		);
	}

	// Excel spreadsheet icon
	if (file.type === 'application/vnd.ms-excel' ||
		file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
		ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
		return (
			<Icon icon={TableCellsIcon} className="w-4 h-4 text-input-placeholder"  />
		);
	}

	// Audio file icon
	if (file.type?.startsWith('audio/')) {
		return (
			<Icon icon={MusicalNoteIcon} className="w-4 h-4 text-input-placeholder"  />
		);
	}

	// Video file icon
	if (file.type?.startsWith('video/')) {
		return (
			<Icon icon={VideoCameraIcon} className="w-4 h-4 text-input-placeholder"  />
		);
	}

	// Default file icon
	return (
		<Icon icon={DocumentIcon} className="w-4 h-4 text-input-placeholder"  />
	);
};

