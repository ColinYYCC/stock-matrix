import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** 按钮的样式选项 */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
};

/** 各 variant 对应的 Tailwind 类名 */
const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/85",
  outline:
    "border-border bg-background hover:bg-muted/70 hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/55",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/75",
  ghost: "hover:bg-muted/60 hover:text-foreground dark:hover:bg-muted/40",
  destructive: "bg-destructive/10 text-destructive hover:bg-destructive/25",
  link: "text-primary underline-offset-4 hover:underline",
};

/** 各 size 对应的 Tailwind 类名 */
const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "h-8 gap-1.5 px-2.5",
  xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
  sm: "h-7 gap-1 rounded-md px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
  lg: "h-9 gap-1.5 px-2.5",
  icon: "size-8",
  "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
  "icon-sm": "size-7 rounded-md",
  "icon-lg": "size-9",
};

/** 通用按钮组件 */
export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}
