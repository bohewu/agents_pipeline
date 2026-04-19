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
