import { describe, expect, it } from 'vitest';
import { BRAND_NAME } from '../branding.js';
import {
  BRAND_IDENTITY,
  DEFAULT_CINDY_BUILD_IDENTITY,
  DEFAULT_CINDY_REGION,
  PERSONAL_BRAND_IDENTITY,
  allDeepLinkSchemes,
  allUserDataDirNames,
  brandAppId,
  brandBundleIdPrefix,
  brandExecutableName,
  brandIdentityFor,
  brandUserDataDirName,
  legacyBrandUserDataDirNames,
  legacyDialogueUserDataDirNames,
  resolveCindyBuildIdentity,
  resolveCindyRegion,
} from '../brandIdentity.js';

/**
 * brand-identity 是标识符层单点,消费方(forge / main 常量 / release 脚本)
 * 对格式有硬约束。这里锁住形状与不变量,防止改名/改值时把非法字符或自相
 * 矛盾的配置带上线——这类错误 typecheck 拦不住,只有到 OS 注册/更新链路
 * 运行时才爆炸。
 */
describe('BRAND_IDENTITY invariants', () => {
  it('displayName 与 branding.ts 的 BRAND_NAME 同源', () => {
    expect(BRAND_IDENTITY.displayName).toBe(BRAND_NAME);
  });

  it('cdnPrefix / dbFilePrefix / updaterName 是安全的小写文件名段', () => {
    // 要进 OSS key(大小写敏感)与文件路径,统一小写规避平台差异。
    const fileSafe = /^[a-z0-9][a-z0-9-]*$/;
    expect(BRAND_IDENTITY.cdnPrefix).toMatch(fileSafe);
    expect(BRAND_IDENTITY.dbFilePrefix).toMatch(fileSafe);
    for (const prefix of BRAND_IDENTITY.legacyDbFilePrefixes) {
      expect(prefix).toMatch(fileSafe);
    }
    expect(BRAND_IDENTITY.updaterName).toMatch(fileSafe);
  });

  it('executableName / userDataDirName 是安全的文件名段(允许首字母大写)', () => {
    // executableName 首字母大写是产品决策(Cindy.exe,同 Discord/Slack 惯例):
    // Windows 进程匹配大小写不敏感,mac Mach-O 名对用户不可见;OSS key 等大小写
    // 敏感场景一律走小写的 cdnPrefix,不用本字段。userDataDirName 同理
    // (Electron productName 惯例)。区域值不含空格(owner 决策,双装路径安全)。
    const dirSafe = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
    expect(BRAND_IDENTITY.executableName).toMatch(dirSafe);
    expect(BRAND_IDENTITY.userDataDirName).toMatch(dirSafe);
    for (const region of ['cn', 'global'] as const) {
      expect(BRAND_IDENTITY.executableNameByRegion[region]).toMatch(dirSafe);
      expect(BRAND_IDENTITY.userDataDirNameByRegion[region]).toMatch(dirSafe);
    }
    for (const dir of BRAND_IDENTITY.legacyUserDataDirNames) {
      expect(dir).toMatch(dirSafe);
    }
  });

  it('系统身份与数据目录两区互不相同;exe 名两区同值(显示名统一决策)', () => {
    // userData 目录 / appId 撞名会让两区共库、共系统身份,必须保持分离。
    // exe 名(安装目录 / .app / 快捷方式)2026-07-26 起 cn/global 同值
    // 'Cindy':owner 决策显示名统一,放弃文件层双装隔离(见
    // executableNameByRegion doc)。cdnPrefix 两区共用是 owner 决策:
    // 发布渠道靠不同 OSS bucket 区分,不靠路径前缀。
    expect(BRAND_IDENTITY.executableNameByRegion.cn)
      .toBe(BRAND_IDENTITY.executableNameByRegion.global);
    expect(BRAND_IDENTITY.userDataDirNameByRegion.cn)
      .not.toBe(BRAND_IDENTITY.userDataDirNameByRegion.global);
  });

  it('cn 区域值 = 基线标量字段(dev / legacy 消费点与 cn 构建同一身份)', () => {
    expect(BRAND_IDENTITY.executableNameByRegion.cn).toBe(BRAND_IDENTITY.executableName);
    expect(BRAND_IDENTITY.userDataDirNameByRegion.cn).toBe(
      BRAND_IDENTITY.userDataDirName,
    );
  });

  it('scheme 符合 RFC 3986(字母开头,字母/数字/+/-/. 组成)且主 scheme 不在 legacy 里', () => {
    const schemeRe = /^[a-z][a-z0-9+.-]*$/;
    expect(BRAND_IDENTITY.primaryScheme).toMatch(schemeRe);
    for (const s of BRAND_IDENTITY.legacySchemes) {
      expect(s).toMatch(schemeRe);
    }
    expect(BRAND_IDENTITY.legacySchemes).not.toContain(BRAND_IDENTITY.primaryScheme);
  });

  it('appId 两区都是反向域名格式且互不相同(cn/global 可并存的系统身份)', () => {
    const rdnRe = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/;
    expect(BRAND_IDENTITY.appIdByRegion.cn).toMatch(rdnRe);
    expect(BRAND_IDENTITY.appIdByRegion.global).toMatch(rdnRe);
    expect(BRAND_IDENTITY.appIdByRegion.cn).not.toBe(BRAND_IDENTITY.appIdByRegion.global);
  });

  it('legacy userData / DB 前缀不含当前值(历史表只放旧值)', () => {
    expect(BRAND_IDENTITY.legacyUserDataDirNames).not.toContain(
      BRAND_IDENTITY.userDataDirName,
    );
    expect(BRAND_IDENTITY.legacyDbFilePrefixes).not.toContain(
      BRAND_IDENTITY.dbFilePrefix,
    );
  });

  it('身份翻转后 legacy 数组必须携带 xdt-maker 旧值(兼容锚,只增不减)', () => {
    expect(BRAND_IDENTITY.legacySchemes).toContain('xdt-maker');
    expect(BRAND_IDENTITY.legacyUserDataDirNames).toContain('xdt-maker');
    expect(BRAND_IDENTITY.legacyDbFilePrefixes).toContain('xdt-maker');
  });

  it('档案与内嵌数组已冻结,消费方无法运行时篡改', () => {
    expect(Object.isFrozen(BRAND_IDENTITY)).toBe(true);
    expect(Object.isFrozen(BRAND_IDENTITY.appIdByRegion)).toBe(true);
    expect(Object.isFrozen(BRAND_IDENTITY.executableNameByRegion)).toBe(true);
    expect(Object.isFrozen(BRAND_IDENTITY.userDataDirNameByRegion)).toBe(true);
    expect(Object.isFrozen(BRAND_IDENTITY.legacyUserDataDirNamesByRegion)).toBe(true);
    for (const names of Object.values(BRAND_IDENTITY.legacyUserDataDirNamesByRegion)) {
      expect(Object.isFrozen(names)).toBe(true);
    }
    expect(Object.isFrozen(BRAND_IDENTITY.legacyDialogueUserDataDirNamesByRegion)).toBe(true);
    for (const names of Object.values(BRAND_IDENTITY.legacyDialogueUserDataDirNamesByRegion)) {
      expect(Object.isFrozen(names)).toBe(true);
    }
    expect(Object.isFrozen(BRAND_IDENTITY.legacySchemes)).toBe(true);
    expect(Object.isFrozen(BRAND_IDENTITY.legacyUserDataDirNames)).toBe(true);
    expect(Object.isFrozen(BRAND_IDENTITY.legacyDbFilePrefixes)).toBe(true);
  });
});

describe('区域解析与派生', () => {
  it('resolveCindyRegion:空值 → 默认 global;合法值归一化;非法值抛错', () => {
    expect(resolveCindyRegion(undefined)).toBe('global');
    expect(resolveCindyRegion(null)).toBe('global');
    expect(resolveCindyRegion('')).toBe('global');
    expect(resolveCindyRegion('  ')).toBe('global');
    expect(resolveCindyRegion('cn')).toBe('cn');
    expect(resolveCindyRegion('global')).toBe('global');
    expect(resolveCindyRegion('GLOBAL')).toBe('global');
    expect(() => resolveCindyRegion('us')).toThrow(/Invalid Cindy region/);
  });

  it('brandAppId / brandBundleIdPrefix 按区域取值,默认 global', () => {
    expect(DEFAULT_CINDY_REGION).toBe('global');
    expect(brandAppId()).toBe('com.xd.cindy');
    expect(brandAppId('global')).toBe('com.xd.cindy');
    expect(brandBundleIdPrefix('cn')).toBe('com.xd.cindycn');
    expect(brandBundleIdPrefix('global')).toBe('com.xd.cindy');
  });

  it('brandExecutableName / brandUserDataDirName 按区域取值,默认 global', () => {
    expect(brandExecutableName()).toBe('Cindy');
    // global 与 cn 同值(2026-07-26 显示名统一决策);dev 仍独立。
    expect(brandExecutableName('global')).toBe('Cindy');
    expect(brandExecutableName('dev')).toBe('CindyDev');
    expect(brandUserDataDirName()).toBe('CindyGlobal');
    expect(brandUserDataDirName('global')).toBe('CindyGlobal');
    expect(brandUserDataDirName('cn')).toBe('Cindy');
  });
});

describe('派生 helper', () => {
  it('allDeepLinkSchemes 主 scheme 恒为首位且包含全部 legacy', () => {
    expect(allDeepLinkSchemes()).toEqual(['cindy', 'xdt-maker']);
  });

  it('allUserDataDirNames 本区域目录名恒为首位 + 全部历史值,且不含另一区域', () => {
    expect(allUserDataDirNames()).toEqual(['CindyGlobal']);
    expect(allUserDataDirNames('cn')).toEqual(['Cindy', 'xdt-maker']);
    // global 的匹配集不含 cn 的 Cindy / xdt-maker：orphan-reaper 按路径认领
    // 进程，跨区域匹配会误杀另一个安装的进程。
    expect(allUserDataDirNames('global')).toEqual(['CindyGlobal']);
  });

  it('legacyBrandUserDataDirNames 只返回品牌翻转前的共享 mToc 来源', () => {
    expect(legacyBrandUserDataDirNames()).toEqual(['xdt-maker']);
  });

  it('dialogue cwd 迁移来源按区域保留旧品牌目录', () => {
    expect(legacyDialogueUserDataDirNames()).toEqual([]);
    expect(legacyDialogueUserDataDirNames('cn')).toEqual(['xdt-maker']);
    expect(legacyDialogueUserDataDirNames('global')).toEqual([]);
    expect(legacyDialogueUserDataDirNames('dev')).toEqual([]);
  });

  it('helper 接受显式档案参数(历史身份回放用)', () => {
    const legacyLike = {
      ...BRAND_IDENTITY,
      primaryScheme: 'xdt-maker',
      legacySchemes: [],
      userDataDirNameByRegion: { cn: 'xdt-maker', global: 'xdt-maker', dev: 'xdt-maker' },
      legacyUserDataDirNames: [],
      legacyUserDataDirNamesByRegion: { cn: [], global: [], dev: [] },
      legacyDialogueUserDataDirNamesByRegion: { cn: [], global: [], dev: [] },
      dbFilePrefix: 'xdt-maker',
      legacyDbFilePrefixes: [],
    };
    expect(allDeepLinkSchemes(legacyLike)).toEqual(['xdt-maker']);
    expect(allUserDataDirNames('cn', legacyLike)).toEqual(['xdt-maker']);
  });
});

/**
 * 个人构建身份(fork-local,`CINDY_BUILD_IDENTITY=personal`)是官方身份的叠加层:
 * 默认关闭时官方行为逐字符不变;开启时必须与官方身份在同机并存互不干扰 ——
 * exe / appId / userData / 深链 scheme 全部带 personal 限定且与官方无交集。
 */
describe('个人构建身份', () => {
  it('解析:空值默认官方;official / personal 认;非法值 fail closed', () => {
    expect(DEFAULT_CINDY_BUILD_IDENTITY).toBe('official');
    expect(resolveCindyBuildIdentity()).toBe('official');
    expect(resolveCindyBuildIdentity('')).toBe('official');
    expect(resolveCindyBuildIdentity(' Personal ')).toBe('personal');
    expect(resolveCindyBuildIdentity('official')).toBe('official');
    expect(() => resolveCindyBuildIdentity('fork')).toThrow(/Invalid Cindy build identity/);
  });

  it('brandIdentityFor:缺省 / 官方 → 官方档案;personal → 个人档案', () => {
    expect(brandIdentityFor()).toBe(BRAND_IDENTITY);
    expect(brandIdentityFor('official')).toBe(BRAND_IDENTITY);
    expect(brandIdentityFor('personal')).toBe(PERSONAL_BRAND_IDENTITY);
  });

  it('标识符与官方无交集(exe / appId),数据目录与官方逐区域同值(共享 profile)', () => {
    for (const region of ['cn', 'global', 'dev'] as const) {
      expect(PERSONAL_BRAND_IDENTITY.executableNameByRegion[region]).not.toBe(
        BRAND_IDENTITY.executableNameByRegion[region],
      );
      expect(PERSONAL_BRAND_IDENTITY.appIdByRegion[region]).not.toBe(
        BRAND_IDENTITY.appIdByRegion[region],
      );
      // 2026-10-13 owner 裁决:个人构建直接读官方数据(项目 / 任务 / 登录),
      // 数据目录故意与官方同值;隔离实验走显式 --user-data-dir(不经本档案)。
      expect(PERSONAL_BRAND_IDENTITY.userDataDirNameByRegion[region]).toBe(
        BRAND_IDENTITY.userDataDirNameByRegion[region],
      );
    }
    expect(PERSONAL_BRAND_IDENTITY.userDataDirNameByRegion.cn).toBe('Cindy');
    expect(PERSONAL_BRAND_IDENTITY.userDataDirNameByRegion.global).toBe('CindyGlobal');
    expect(PERSONAL_BRAND_IDENTITY.userDataDirNameByRegion.dev).toBe('CindyDev');
    expect(PERSONAL_BRAND_IDENTITY.userDataDirName).toBe(BRAND_IDENTITY.userDataDirName);
    expect(PERSONAL_BRAND_IDENTITY.executableName).toBe('CindyPersonal');
  });

  it('深链不含官方 scheme,legacy 迁移集为空(不导入官方 / 老数据)', () => {
    expect(PERSONAL_BRAND_IDENTITY.primaryScheme).toBe('cindy-personal');
    expect(allDeepLinkSchemes(PERSONAL_BRAND_IDENTITY)).toEqual(['cindy-personal']);
    for (const scheme of allDeepLinkSchemes(PERSONAL_BRAND_IDENTITY)) {
      expect(allDeepLinkSchemes()).not.toContain(scheme);
    }
    // 共享 profile 后进程匹配集仍按官方目录名(= 本构建实际使用的目录)。
    expect(allUserDataDirNames('cn', PERSONAL_BRAND_IDENTITY)).toEqual(['Cindy']);
    expect(allUserDataDirNames('global', PERSONAL_BRAND_IDENTITY)).toEqual(['CindyGlobal']);
    expect(allUserDataDirNames('dev', PERSONAL_BRAND_IDENTITY)).toEqual(['CindyDev']);
    expect(legacyBrandUserDataDirNames(PERSONAL_BRAND_IDENTITY)).toEqual([]);
    expect(legacyDialogueUserDataDirNames('cn', PERSONAL_BRAND_IDENTITY)).toEqual([]);
    expect(PERSONAL_BRAND_IDENTITY.legacyDbFilePrefixes).toEqual([]);
  });

  it('文件名段合法;profile 内共用的前缀与官方同值(cindy / cindy-updater)', () => {
    const dirSafe = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
    expect(PERSONAL_BRAND_IDENTITY.executableName).toMatch(dirSafe);
    expect(PERSONAL_BRAND_IDENTITY.userDataDirName).toMatch(dirSafe);
    for (const region of ['cn', 'global', 'dev'] as const) {
      expect(PERSONAL_BRAND_IDENTITY.executableNameByRegion[region]).toMatch(dirSafe);
      expect(PERSONAL_BRAND_IDENTITY.userDataDirNameByRegion[region]).toMatch(dirSafe);
    }
    // 前缀与官方同值:dbFilePrefix 同值才能找到共享 profile 里的官方库文件。
    expect(PERSONAL_BRAND_IDENTITY.dbFilePrefix).toBe(BRAND_IDENTITY.dbFilePrefix);
    expect(PERSONAL_BRAND_IDENTITY.updaterName).toBe(BRAND_IDENTITY.updaterName);
  });
});
