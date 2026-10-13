/**
 * brandRegion — 本构建的区域身份(cn/global)与区域派生 appId 的运行时单点。
 *
 * 区域在**构建期**经 VITE_CINDY_AUTH_REGION 烘焙(main 走 vite.main.config.ts
 * 的 define,renderer 走标准 Vite env;生产由 desktopClientBuildEnv 注入,dev /
 * 未注入一律默认 global)。运行时不可切换——cn 与 global 是两个可并存的系统身份
 * (com.xd.cindycn / com.xd.cindy,与 mobile 同一套命名)。
 *
 * 构建身份(官方 / 个人 fork)经 **VITE_CINDY_BUILD_IDENTITY** 同样在构建期烘焙,
 * 默认 official(既有构建行为零变化)。个人身份只改标识符层(exe / appId /
 * userData / scheme,见 PERSONAL_BRAND_IDENTITY),区域语义不变。
 *
 * ⚠️ AUMID 三位一体:本文件的 CURRENT_APP_ID 必须与 NSIS appId(forge.config
 * 按同一 region + identity 从 brandAppId() 取值)、快捷方式 AUMID 逐字符一致,
 * 否则 Windows toast 通知被静默丢弃。
 */

import {
  BRAND_IDENTITY,
  allDeepLinkSchemes,
  brandAppId,
  brandExecutableName,
  brandUserDataDirName,
  brandIdentityFor,
  resolveCindyBuildIdentity,
  resolveCindyRegion,
  type BrandIdentity,
  type CindyBuildIdentity,
  type CindyRegion,
} from '@cindy/maker-shared/brand-identity';

/** 本构建的区域(构建期烘焙;dev 默认 global)。 */
export const CURRENT_CINDY_REGION: CindyRegion = resolveCindyRegion(
  import.meta.env?.VITE_CINDY_AUTH_REGION,
);

/** 本构建的身份档案(构建期烘焙;默认官方身份 BRAND_IDENTITY)。 */
export const CURRENT_BRAND_IDENTITY: BrandIdentity = brandIdentityFor(
  import.meta.env?.VITE_CINDY_BUILD_IDENTITY,
);

/** 本构建身份类别(官方 / 个人);需要显式区分构建产物的少数消费点使用。 */
export const CURRENT_BUILD_IDENTITY: CindyBuildIdentity = resolveCindyBuildIdentity(
  import.meta.env?.VITE_CINDY_BUILD_IDENTITY,
);

/** 本构建的系统身份 id(Windows AUMID / macOS bundle id)。 */
export const CURRENT_APP_ID: string = brandAppId(CURRENT_CINDY_REGION, CURRENT_BRAND_IDENTITY);

/** 本构建的可执行文件基名(安装目录 / 快捷方式 / 注册表键名同源)。 */
export const CURRENT_EXECUTABLE_NAME: string = brandExecutableName(
  CURRENT_CINDY_REGION,
  CURRENT_BRAND_IDENTITY,
);

/** 本构建的 userData 目录名(区域 + 身份派生)。 */
export const CURRENT_USER_DATA_DIR_NAME: string = brandUserDataDirName(
  CURRENT_CINDY_REGION,
  CURRENT_BRAND_IDENTITY,
);

/** 本构建注册 / 识别的深链 scheme(个人身份只有 cindy-personal)。 */
export const CURRENT_DEEP_LINK_SCHEMES: readonly string[] = allDeepLinkSchemes(
  CURRENT_BRAND_IDENTITY,
);

/** 本构建是否使用官方身份(个人构建才为 false)。 */
export const IS_OFFICIAL_BUILD_IDENTITY: boolean =
  CURRENT_BRAND_IDENTITY === BRAND_IDENTITY;
