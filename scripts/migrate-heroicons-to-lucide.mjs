#!/usr/bin/env node
/**
 * One-shot migration: rewrite every Heroicons import in src/ to lucide-react.
 *
 * Strategy:
 *   1. Find each `import { ... } from '@heroicons/react/...'` block.
 *   2. Map Heroicon names to Lucide names via NAME_MAP.
 *   3. Coalesce all Heroicons imports in a file into a single
 *      `import { ... } from 'lucide-react'` block (keeping any existing
 *      lucide-react import and merging).
 *   4. Rewrite identifier usages throughout the file (JSX elements,
 *      `icon={Foo}` props, type references) using NAME_MAP.
 *
 * Aliases like `CheckCircleIcon as CheckCircleIconSolid` are preserved by mapping
 * the LHS through NAME_MAP and keeping the RHS as a local alias.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');

const NAME_MAP = {
  AdjustmentsHorizontalIcon: 'SlidersHorizontal',
  ArrowDownCircleIcon: 'ArrowDownCircle',
  ArrowDownIcon: 'ArrowDown',
  ArrowDownTrayIcon: 'Download',
  ArrowLeftIcon: 'ArrowLeft',
  ArrowPathIcon: 'RefreshCw',
  ArrowTopRightOnSquareIcon: 'ExternalLink',
  ArrowUpCircleIcon: 'ArrowUpCircle',
  ArrowUpIcon: 'ArrowUp',
  ArrowUpTrayIcon: 'Upload',
  ArrowUturnLeftIcon: 'Undo2',
  BriefcaseIcon: 'Briefcase',
  CameraIcon: 'Camera',
  ChartBarIcon: 'BarChart3',
  ChatBubbleLeftRightIcon: 'MessagesSquare',
  ChatBubbleOvalLeftEllipsisIcon: 'MessageSquare',
  CheckBadgeIcon: 'BadgeCheck',
  CheckCircleIcon: 'CheckCircle2',
  CheckIcon: 'Check',
  ChevronDownIcon: 'ChevronDown',
  ChevronLeftIcon: 'ChevronLeft',
  ChevronRightIcon: 'ChevronRight',
  ChevronUpIcon: 'ChevronUp',
  ClipboardDocumentCheckIcon: 'ClipboardCheck',
  ClipboardDocumentIcon: 'Clipboard',
  ClipboardDocumentListIcon: 'ClipboardList',
  ClipboardIcon: 'Clipboard',
  ClockIcon: 'Clock',
  Cog6ToothIcon: 'Settings',
  Cog8ToothIcon: 'Settings',
  CogIcon: 'Settings',
  DocumentDuplicateIcon: 'Copy',
  DocumentIcon: 'File',
  DocumentTextIcon: 'FileText',
  EllipsisHorizontalIcon: 'MoreHorizontal',
  EllipsisVerticalIcon: 'MoreVertical',
  EnvelopeIcon: 'Mail',
  ExclamationCircleIcon: 'AlertCircle',
  ExclamationTriangleIcon: 'AlertTriangle',
  EyeIcon: 'Eye',
  EyeSlashIcon: 'EyeOff',
  FaceSmileIcon: 'Smile',
  FolderIcon: 'Folder',
  FolderOpenIcon: 'FolderOpen',
  GlobeAltIcon: 'Globe',
  HomeIcon: 'Home',
  IdentificationIcon: 'IdCard',
  InboxStackIcon: 'Inbox',
  InboxIcon: 'Inbox',
  InformationCircleIcon: 'Info',
  LinkIcon: 'Link',
  ListBulletIcon: 'List',
  LockClosedIcon: 'Lock',
  LockOpenIcon: 'LockOpen',
  MagnifyingGlassIcon: 'Search',
  MinusIcon: 'Minus',
  PaperAirplaneIcon: 'Send',
  PaperClipIcon: 'Paperclip',
  PencilIcon: 'Pencil',
  PencilSquareIcon: 'SquarePen',
  PhoneIcon: 'Phone',
  PhotoIcon: 'Image',
  PlayIcon: 'Play',
  PlusCircleIcon: 'PlusCircle',
  PlusIcon: 'Plus',
  PrinterIcon: 'Printer',
  PuzzlePieceIcon: 'Puzzle',
  QuestionMarkCircleIcon: 'HelpCircle',
  ReceiptPercentIcon: 'Receipt',
  ScaleIcon: 'Scale',
  ServerIcon: 'Server',
  ShieldCheckIcon: 'ShieldCheck',
  SparklesIcon: 'Sparkles',
  StopIcon: 'Square',
  Squares2X2Icon: 'LayoutGrid',
  StarIcon: 'Star',
  SunIcon: 'Sun',
  TableCellsIcon: 'Table',
  TagIcon: 'Tag',
  TrashIcon: 'Trash2',
  UserCircleIcon: 'CircleUser',
  UserGroupIcon: 'Users',
  UserIcon: 'User',
  UserPlusIcon: 'UserPlus',
  UsersIcon: 'Users',
  VideoCameraIcon: 'Video',
  XCircleIcon: 'XCircle',
  XMarkIcon: 'X',
  Bars3Icon: 'Menu',
  BellIcon: 'Bell',
  BellAlertIcon: 'BellRing',
  BookOpenIcon: 'BookOpen',
  BookmarkIcon: 'Bookmark',
  Bars3BottomLeftIcon: 'PanelLeft',
  ArrowsPointingOutIcon: 'Maximize',
  ArrowsPointingInIcon: 'Minimize',
  ArrowRightOnRectangleIcon: 'LogOut',
  ArrowLeftOnRectangleIcon: 'LogIn',
  ArrowRightIcon: 'ArrowRight',
  ChatBubbleBottomCenterTextIcon: 'MessageCircle',
  Cog: 'Settings',
  CreditCardIcon: 'CreditCard',
  CurrencyDollarIcon: 'DollarSign',
  HashtagIcon: 'Hash',
  HandRaisedIcon: 'Hand',
  KeyIcon: 'Key',
  MapPinIcon: 'MapPin',
  MicrophoneIcon: 'Mic',
  MoonIcon: 'Moon',
  PauseIcon: 'Pause',
  ShareIcon: 'Share2',
  ShoppingCartIcon: 'ShoppingCart',
  WrenchIcon: 'Wrench',
  WrenchScrewdriverIcon: 'Wrench',
};

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) {
      yield full;
    }
  }
}

const HEROICON_IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"]@heroicons\/react\/[^'"]+['"]\s*;?/g;
const LUCIDE_IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]\s*;?/;

function parseSpecifiers(block) {
  return block
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((spec) => {
      const m = spec.match(/^([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?$/);
      if (!m) return null;
      return { source: m[1], alias: m[2] };
    })
    .filter(Boolean);
}

let unmappedIcons = new Set();
let touched = 0;

for (const file of walk(ROOT)) {
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('@heroicons/react')) continue;

  const heroSpecsAll = [];
  let importMatch;
  HEROICON_IMPORT_RE.lastIndex = 0;
  while ((importMatch = HEROICON_IMPORT_RE.exec(src)) !== null) {
    heroSpecsAll.push(...parseSpecifiers(importMatch[1]));
  }

  // Build rename pairs: { oldLocal -> newLocal }
  const renames = new Map();
  const lucideNeeded = new Map(); // Lucide source name -> local name to keep
  for (const spec of heroSpecsAll) {
    const lucideSource = NAME_MAP[spec.source];
    if (!lucideSource) {
      unmappedIcons.add(spec.source);
      continue;
    }
    const localName = spec.alias ?? spec.source;
    renames.set(localName, lucideSource);
    // If alias was used, keep the alias as the local name but import lucide source.
    if (spec.alias) {
      lucideNeeded.set(lucideSource, spec.alias);
    } else {
      lucideNeeded.set(lucideSource, lucideSource);
    }
  }

  // Strip the heroicons imports.
  src = src.replace(HEROICON_IMPORT_RE, '');

  // Rename usages (whole-word identifier replacements). Order longest-first to
  // avoid prefix collisions.
  const orderedRenames = [...renames.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [oldLocal, newLocal] of orderedRenames) {
    if (oldLocal === newLocal) continue;
    const re = new RegExp(`\\b${oldLocal}\\b`, 'g');
    src = src.replace(re, newLocal);
  }

  // Merge with existing lucide-react import or add a new one.
  if (lucideNeeded.size > 0) {
    const desired = [...lucideNeeded.entries()].map(([source, local]) =>
      source === local ? source : `${source} as ${local}`
    );

    const existing = src.match(LUCIDE_IMPORT_RE);
    if (existing) {
      const existingSpecs = parseSpecifiers(existing[1]);
      const mergedNames = new Set();
      const merged = [];
      for (const s of existingSpecs) {
        const key = s.alias ? `${s.source} as ${s.alias}` : s.source;
        if (!mergedNames.has(key)) {
          mergedNames.add(key);
          merged.push(key);
        }
      }
      for (const d of desired) {
        if (!mergedNames.has(d)) {
          mergedNames.add(d);
          merged.push(d);
        }
      }
      const replacement = `import { ${merged.join(', ')} } from 'lucide-react';`;
      src = src.replace(LUCIDE_IMPORT_RE, replacement);
    } else {
      const newImport = `import { ${desired.join(', ')} } from 'lucide-react';\n`;
      // Insert after the first import statement, or at top of file.
      const firstImport = src.match(/^(import[^\n]+\n)+/);
      if (firstImport) {
        src = src.replace(firstImport[0], firstImport[0] + newImport);
      } else {
        src = newImport + src;
      }
    }
  }

  // Tidy up resulting blank lines from stripped imports.
  src = src.replace(/\n{3,}/g, '\n\n');

  fs.writeFileSync(file, src, 'utf8');
  touched += 1;
}

console.log(`Migrated ${touched} files.`);
if (unmappedIcons.size) {
  console.log('\nUnmapped Heroicons (left as-is, will fail to compile):');
  for (const n of [...unmappedIcons].sort()) console.log('  -', n);
}
