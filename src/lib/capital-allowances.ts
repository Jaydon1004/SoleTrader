import type { CapitalAsset, TaxYearConfig } from "@/types/database";

export interface CapitalAllowanceAssetLine {
  assetId: number;
  name: string;
  poolType: CapitalAsset["pool_type"];
  allowableCost: number;
  aiaClaim: number;
  poolAddition: number;
  disposalValue: number;
}

export interface CapitalAllowancePool {
  openingValue: number;
  additions: number;
  disposals: number;
  balancingCharge: number;
  writingDownAllowance: number;
  closingValue: number;
}

export interface CapitalAllowanceSchedule {
  taxYear: string;
  aiaLimit: number;
  aiaClaim: number;
  aiaRemaining: number;
  mainPool: CapitalAllowancePool;
  specialPool: CapitalAllowancePool;
  totalAllowance: number;
  balancingCharge: number;
  netAllowance: number;
  assetLines: CapitalAllowanceAssetLine[];
}

const round = (value: number) => Number(value.toFixed(2));
const inYear = (date: string | null, config: TaxYearConfig) =>
  Boolean(date && date >= config.year_start && date <= config.year_end);

function emptyPool(): CapitalAllowancePool {
  return {
    openingValue: 0,
    additions: 0,
    disposals: 0,
    balancingCharge: 0,
    writingDownAllowance: 0,
    closingValue: 0,
  };
}

export function calculateCapitalAllowanceSchedules(
  assets: CapitalAsset[],
  configs: TaxYearConfig[],
): CapitalAllowanceSchedule[] {
  let mainClosing = 0;
  let specialClosing = 0;
  const schedules: CapitalAllowanceSchedule[] = [];
  const orderedConfigs = [...configs].sort((left, right) =>
    left.year_start.localeCompare(right.year_start),
  );
  const activeAssets = assets.filter((asset) => !asset.deleted_at);

  for (const config of orderedConfigs) {
    const mainPool = emptyPool();
    const specialPool = emptyPool();
    mainPool.openingValue = mainClosing;
    specialPool.openingValue = specialClosing;
    let aiaRemaining = config.aia_limit;
    let aiaClaim = 0;
    const lines = new Map<number, CapitalAllowanceAssetLine>();

    for (const asset of activeAssets
      .filter((candidate) => inYear(candidate.purchase_date, config))
      .sort(
        (left, right) =>
          left.purchase_date.localeCompare(right.purchase_date) ||
          left.id - right.id,
      )) {
      const allowableCost =
        (asset.purchase_price * asset.business_percent) / 100;
      const assetAia =
        asset.claim_method === "aia"
          ? Math.min(allowableCost, aiaRemaining)
          : 0;
      const poolAddition = allowableCost - assetAia;
      aiaRemaining -= assetAia;
      aiaClaim += assetAia;
      const pool = asset.pool_type === "special" ? specialPool : mainPool;
      pool.additions += poolAddition;
      lines.set(asset.id, {
        assetId: asset.id,
        name: asset.name,
        poolType: asset.pool_type,
        allowableCost: round(allowableCost),
        aiaClaim: round(assetAia),
        poolAddition: round(poolAddition),
        disposalValue: 0,
      });
    }

    for (const asset of activeAssets.filter((candidate) =>
      inYear(candidate.disposal_date, config),
    )) {
      const maximumDisposalValue =
        (asset.purchase_price * asset.business_percent) / 100;
      const disposalValue = Math.min(
        (asset.disposal_proceeds * asset.business_percent) / 100,
        maximumDisposalValue,
      );
      const pool = asset.pool_type === "special" ? specialPool : mainPool;
      pool.disposals += disposalValue;
      const existing = lines.get(asset.id);
      lines.set(
        asset.id,
        existing
          ? { ...existing, disposalValue: round(disposalValue) }
          : {
              assetId: asset.id,
              name: asset.name,
              poolType: asset.pool_type,
              allowableCost: 0,
              aiaClaim: 0,
              poolAddition: 0,
              disposalValue: round(disposalValue),
            },
      );
    }

    const finishPool = (pool: CapitalAllowancePool, rate: number) => {
      const beforeDisposals = pool.openingValue + pool.additions;
      pool.balancingCharge = Math.max(0, pool.disposals - beforeDisposals);
      const afterDisposals = Math.max(0, beforeDisposals - pool.disposals);
      pool.writingDownAllowance = (afterDisposals * rate) / 100;
      pool.closingValue = afterDisposals - pool.writingDownAllowance;
      Object.keys(pool).forEach((key) => {
        const field = key as keyof CapitalAllowancePool;
        pool[field] = round(pool[field]);
      });
    };

    finishPool(mainPool, config.main_pool_wda_percent);
    finishPool(specialPool, config.special_rate_wda_percent);
    mainClosing = mainPool.closingValue;
    specialClosing = specialPool.closingValue;
    const balancingCharge =
      mainPool.balancingCharge + specialPool.balancingCharge;
    const totalAllowance =
      aiaClaim +
      mainPool.writingDownAllowance +
      specialPool.writingDownAllowance;
    schedules.push({
      taxYear: config.tax_year,
      aiaLimit: config.aia_limit,
      aiaClaim: round(aiaClaim),
      aiaRemaining: round(aiaRemaining),
      mainPool,
      specialPool,
      totalAllowance: round(totalAllowance),
      balancingCharge: round(balancingCharge),
      netAllowance: round(totalAllowance - balancingCharge),
      assetLines: [...lines.values()],
    });
  }
  return schedules;
}
