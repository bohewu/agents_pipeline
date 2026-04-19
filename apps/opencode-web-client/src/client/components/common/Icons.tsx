import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
};

function SvgIcon({ size = 16, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function PanelLeftIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9 4.5v15" />
    </SvgIcon>
  );
}

export function PanelRightIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M15 4.5v15" />
    </SvgIcon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 7.5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    </SvgIcon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </SvgIcon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </SvgIcon>
  );
}

export function GitBranchIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="7" cy="6" r="2.5" />
      <circle cx="17" cy="18" r="2.5" />
      <circle cx="17" cy="6" r="2.5" />
      <path d="M9.5 6h4a3 3 0 0 1 3 3v4" />
      <path d="M7 8.5v5a4.5 4.5 0 0 0 4.5 4.5H14.5" />
    </SvgIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-1.98 1.74l-.1.76a2 2 0 0 1-1.48 1.67l-.73.21a2 2 0 0 1-2.1-.55l-.57-.5a2 2 0 0 0-2.83.11l-.31.31a2 2 0 0 0-.11 2.83l.5.57a2 2 0 0 1 .55 2.1l-.21.73a2 2 0 0 1-1.67 1.48l-.76.1A2 2 0 0 0 2 12.22v.44a2 2 0 0 0 1.74 1.98l.76.1a2 2 0 0 1 1.67 1.48l.21.73a2 2 0 0 1-.55 2.1l-.5.57a2 2 0 0 0 .11 2.83l.31.31a2 2 0 0 0 2.83.11l.57-.5a2 2 0 0 1 2.1-.55l.73.21a2 2 0 0 1 1.48 1.67l.1.76A2 2 0 0 0 11.78 22h.44a2 2 0 0 0 1.98-1.74l.1-.76a2 2 0 0 1 1.48-1.67l.73-.21a2 2 0 0 1 2.1.55l.57.5a2 2 0 0 0 2.83-.11l.31-.31a2 2 0 0 0 .11-2.83l-.5-.57a2 2 0 0 1-.55-2.1l.21-.73a2 2 0 0 1 1.67-1.48l.76-.1A2 2 0 0 0 22 12.22v-.44a2 2 0 0 0-1.74-1.98l-.76-.1a2 2 0 0 1-1.67-1.48l-.21-.73a2 2 0 0 1 .55-2.1l.5-.57a2 2 0 0 0-.11-2.83l-.31-.31a2 2 0 0 0-2.83-.11l-.57.5a2 2 0 0 1-2.1.55l-.73-.21a2 2 0 0 1-1.48-1.67l-.1-.76A2 2 0 0 0 12.22 2Z" />
      <circle cx="12" cy="12" r="3.2" />
    </SvgIcon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

export function DiffIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8 5v14" />
      <path d="M8 8 5.5 5.5 8 3" />
      <path d="M8 16 5.5 18.5 8 21" />
      <path d="M16 5v14" />
      <path d="M16 8 18.5 5.5 16 3" />
      <path d="M16 16 18.5 18.5 16 21" />
    </SvgIcon>
  );
}

export function FilesIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8 4.5h7l3 3V18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
      <path d="M15 4.5V8h3" />
      <path d="M9 11h6" />
      <path d="M9 15h6" />
    </SvgIcon>
  );
}

export function UsageIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 18V11" />
      <path d="M12 18V7" />
      <path d="M19 18V4" />
    </SvgIcon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3.5 18 6v5.5c0 4.1-2.7 6.9-6 8-3.3-1.1-6-3.9-6-8V6z" />
      <path d="m9.5 11.5 1.5 1.5 3-3.5" />
    </SvgIcon>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 12h3l2.5-5 4 10 2.5-5H20" />
    </SvgIcon>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </SvgIcon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </SvgIcon>
  );
}

export function SquareIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M6 15V7a2 2 0 0 1 2-2h8" />
    </SvgIcon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m5 12 4 4 10-10" />
    </SvgIcon>
  );
}
