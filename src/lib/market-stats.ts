/**
 * 涨跌统计的共享算术模块
 *
 * 服务端组装（market-data.ts）与客户端筛选重算（market-heatmap.tsx）
 * 用的是同一套业务规则，此前在两侧各写一份（连平盘阈值都抄两遍），
 * 收敛到这里：规矩只写一遍，两边都来抄答案。
 */

/** 平盘阈值：涨跌幅绝对值 < 0.1% 视为平盘 */
export const flatThreshold = 0.1;

/**
 * 加权平均涨跌幅（按 value 权重，跳过无数据的股票）。
 * 没有任何有效数据时返回 NaN（"没有答案"，不冒充 0）：
 * 服务端靠它触发兜底逻辑，客户端显示前自行转成 0。
 */
export function weightedAverageChange(
  stocks: ReadonlyArray<{ value: number; changePct: number }>
): number {
  let weightedSum = 0;
  let totalValue = 0;
  for (const stock of stocks) {
    const changePct = stock.changePct;
    if (Number.isNaN(changePct)) continue; // 跳过无数据的股票
    weightedSum += changePct * stock.value;
    totalValue += stock.value;
  }
  return totalValue > 0 ? weightedSum / totalValue : Number.NaN;
}

/** 遍历股票列表，累计涨/平/跌家数与成交额（阈值 flatThreshold；无数据 NaN 落入平盘分支） */
export function summarizeStocks(
  stocks: ReadonlyArray<{ changePct: number; turnoverAmount: number }>
): {
  advanceCount: number;
  flatCount: number;
  declineCount: number;
  turnoverAmount: number;
} {
  let advanceCount = 0;
  let flatCount = 0;
  let declineCount = 0;
  let turnoverAmount = 0;
  for (const stock of stocks) {
    const changePct = stock.changePct;
    if (changePct > flatThreshold) advanceCount += 1;
    else if (changePct < -flatThreshold) declineCount += 1;
    else flatCount += 1; // NaN 也落在这里：无数据时按平盘计，不误导用户
    turnoverAmount += stock.turnoverAmount;
  }
  return { advanceCount, flatCount, declineCount, turnoverAmount };
}

/**
 * 按子板块（二级行业）分组：组内按市值降序，返回市值降序的组列表。
 * 没有子板块的股票回退挂在一级行业名下。
 */
export function groupStocksBySubBoard<
  T extends { code: string; boardName: string; subBoardName: string; value: number; changePct: number },
>(stocks: T[]) {
  const subBoardMap = new Map<string, T[]>();
  for (const stock of stocks) {
    const key = stock.subBoardName || stock.boardName;
    const current = subBoardMap.get(key) ?? [];
    current.push(stock);
    subBoardMap.set(key, current);
  }
  return Array.from(subBoardMap.entries())
    .map(([name, children]) => ({
      name,
      boardName: children[0]?.boardName ?? "",
      stockCount: children.length,
      value: children.reduce((sum, child) => sum + child.value, 0),
      // 板块标题涨跌幅：无有效数据时按 0% 显示（保持原有展示行为）
      changePct: weightedAverageChange(children) || 0,
      children: [...children].sort((left, right) => right.value - left.value),
    }))
    .sort((left, right) => right.value - left.value);
}
