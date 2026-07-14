/**
 * 二分平衡树图布局算法
 *
 * 把一组带 value（权重值）的 items 放进一个矩形区域里，
 * 每个item分到的面积和它的 value 成正比。
 *
 * 算法思路：
 * 1. 把 items 按 value 降序排
 * 2. 找一个分割点，让左右两半的 value 总和尽量接近 50/50
 * 3. 沿长边方向把矩形切成两半
 * 4. 递归处理每一半
 *
 * 相比简单的"切片法"（每次只切一个出来），二分平衡法的布局更均匀。
 */
import type { Bounds, TreemapInput, TreemapRect } from "@/types/heatmap";

/** 按 value 降序排列，过滤掉 value <= 0 的项 */
export function sortTreemapItems<T>(items: TreemapInput<T>[]): TreemapInput<T>[] {
  return [...items]
    .filter((entry) => entry.value > 0)
    .sort((left, right) => right.value - left.value);
}

/** 计算 items 的 value 总和 */
export function totalTreemapValue<T>(items: TreemapInput<T>[]): number {
  let total = 0;
  for (const entry of items) {
    total += entry.value;
  }
  return total;
}

/**
 * 找到使前后两半 value 总和最接近 50/50 的分割点
 *
 * 遍历所有可能的分割位置，找到累计 value 最接近总量一半的那个。
 */
export function findBalancedSplitIndex<T>(items: TreemapInput<T>[]): number {
  if (items.length <= 1) {
    return items.length;
  }

  const target = totalTreemapValue(items) / 2;
  let cumulative = 0;
  let bestIndex = 1;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let index = 1; index < items.length; index += 1) {
    cumulative += items[index - 1].value;
    const diff = Math.abs(target - cumulative);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  }

  return bestIndex;
}

/**
 * 沿长边方向按比例把一个矩形切成两半
 *
 * 如果矩形更宽就竖着切，更高就横着切。
 */
export function splitBounds(bounds: Bounds, ratio: number) {
  const splitVertically = bounds.width >= bounds.height;

  if (splitVertically) {
    const leftWidth = bounds.width * ratio;
    return {
      first: { x: bounds.x, y: bounds.y, width: leftWidth, height: bounds.height },
      second: {
        x: bounds.x + leftWidth,
        y: bounds.y,
        width: Math.max(0, bounds.width - leftWidth),
        height: bounds.height,
      },
    };
  }

  const topHeight = bounds.height * ratio;
  return {
    first: { x: bounds.x, y: bounds.y, width: bounds.width, height: topHeight },
    second: {
      x: bounds.x,
      y: bounds.y + topHeight,
      width: bounds.width,
      height: Math.max(0, bounds.height - topHeight),
    },
  };
}

/** 给矩形四周留出 gap 间距 */
export function insetRect<T>(rect: TreemapRect<T>, gap: number): TreemapRect<T> {
  const inset = gap / 2;
  return {
    ...rect,
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - gap),
    height: Math.max(0, rect.height - gap),
  };
}

/**
 * 二分平衡树图布局主函数
 *
 * @param items 待布局的 items 列表（每个带 value 权重值）
 * @param x 起始 x 坐标
 * @param y 起始 y 坐标
 * @param width 可用宽度
 * @param height 可用高度
 * @param gap 每个色块之间的间距（像素）
 * @returns 每个 item 对应的矩形坐标列表
 */
export function binaryTreemap<T>(
  items: TreemapInput<T>[],
  x: number,
  y: number,
  width: number,
  height: number,
  gap = 0
): TreemapRect<T>[] {
  const sortedItems = sortTreemapItems(items);

  function layout(entries: TreemapInput<T>[], bounds: Bounds): TreemapRect<T>[] {
    // 边界太小直接跳过
    if (entries.length === 0 || bounds.width <= 1 || bounds.height <= 1) {
      return [];
    }

    // 只有一个元素，占满整个区域
    if (entries.length === 1) {
      return [
        insetRect(
          {
            item: entries[0].item,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          },
          gap
        ),
      ];
    }

    const splitIndex = findBalancedSplitIndex(entries);
    const firstEntries = entries.slice(0, splitIndex);
    const secondEntries = entries.slice(splitIndex);

    // 如果分割后某一半为空，退化为均匀平铺
    if (firstEntries.length === 0 || secondEntries.length === 0) {
      return entries.map((entry, index) =>
        insetRect(
          {
            item: entry.item,
            x: bounds.x,
            y: bounds.y + (bounds.height / entries.length) * index,
            width: bounds.width,
            height: bounds.height / entries.length,
          },
          gap
        )
      );
    }

    const total = totalTreemapValue(entries);
    const firstRatio = totalTreemapValue(firstEntries) / total;
    const { first, second } = splitBounds(bounds, firstRatio);

    // 递归处理两半
    return [...layout(firstEntries, first), ...layout(secondEntries, second)];
  }

  return layout(sortedItems, { x, y, width, height }).filter(
    (rect) => rect.width > 1 && rect.height > 1
  );
}
