import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** 按钮的样式选项（只保留项目实际用到的 variant/size，需要时再加） */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
};

/** 各 variant 对应的 Tailwind 类名 */
const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/85",
  outline:
    "border-border bg-background hover:bg-muted/70 hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/55",
  ghost: "hover:bg-muted/60 hover:text-foreground dark:hover:bg-muted/40",
};

/** 各 size 对应的 Tailwind 类名 */
const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "h-8 gap-1.5 px-2.5",
  sm: "h-7 gap-1 rounded-md px-2.5 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
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
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}
