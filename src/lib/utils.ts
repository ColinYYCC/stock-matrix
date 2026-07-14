import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 把多个 Tailwind 类名合并成一个字符串，自动去重和冲突解决 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
