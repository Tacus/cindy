import { describe, expect, it } from 'vitest';
import { PERSONAL_BRAND_IDENTITY } from '@cindy/maker-shared/brand-identity';
import { resolveRegionUserDataDirName } from '../regionUserData';

/**
 * 同机双装的核心不变量:保持已发布的 cn=Cindy、global=CindyGlobal 映射，数据库 /
 * 登录态 / 单实例锁 / sessionData 随 userData 目录天然隔离。此模块跑在 main 入口
 * 最早期，回归 = 两个区域的包共库串台(P0)，所以把所有象限全部锁死。
 */
describe('resolveRegionUserDataDirName', () => {
  const ARGV = ['Cindy.exe'] as const;

  it('packaged + global → 覆写为 CindyGlobal(与 cn 分库)', () => {
    expect(
      resolveRegionUserDataDirName({ isPackaged: true, region: 'global', argv: ARGV }),
    ).toBe('CindyGlobal');
  });

  it('packaged + cn → null(区域目录名 = productName 默认,保持原生行为)', () => {
    expect(
      resolveRegionUserDataDirName({ isPackaged: true, region: 'cn', argv: ARGV }),
    ).toBeNull();
  });

  it('dev(非 packaged)按区域选择正式 profile，隔离沙箱再基于它派生', () => {
    expect(
      resolveRegionUserDataDirName({ isPackaged: false, region: 'cn', argv: ARGV }),
    ).toBeNull();
    expect(
      resolveRegionUserDataDirName({ isPackaged: false, region: 'global', argv: ARGV }),
    ).toBe('CindyGlobal');
    expect(
      resolveRegionUserDataDirName({ isPackaged: false, region: 'dev', argv: ARGV }),
    ).toBe('CindyDev');
  });

  it('显式 Chromium --user-data-dir 时不覆写,尊重调用方', () => {
    expect(
      resolveRegionUserDataDirName({
        isPackaged: true,
        region: 'global',
        argv: ['Cindy.exe', '--smoke-test', '--user-data-dir=C:\\tmp\\xdt-smoke-x'],
      }),
    ).toBeNull();
    expect(
      resolveRegionUserDataDirName({
        isPackaged: true,
        region: 'global',
        argv: ['Cindy.exe', '--user-data-dir', 'C:\\tmp\\xdt-smoke-x'],
      }),
    ).toBeNull();
  });

  it('XDT_USER_DATA_DIR 仍保留区域默认 profile 作为隔离 epoch 基线', () => {
    expect(
      resolveRegionUserDataDirName({
        isPackaged: false,
        region: 'global',
        argv: ARGV,
        envUserDataDir: '/tmp/custom-profile',
      }),
    ).toBe('CindyGlobal');
  });
});

/**
 * 个人构建身份(fork-local)与官方安装**共享同一份数据目录**(2026-10-13 owner
 * 裁决):cn 落回官方 productName 默认目录(返回 null),global / dev 显式覆写为官方
 * 同名目录 —— 个人构建因此直接读到官方的登录态 / 项目 / 任务;单实例锁与官方互斥,
 * 约定不同时运行。要跑隔离实验用显式 --user-data-dir,那条路径仍优先。
 */
describe('个人构建身份的 userData 目录(共享官方 profile)', () => {
  const ARGV = ['CindyPersonal.exe'] as const;

  it('packaged 下三个区域都落在官方同名目录', () => {
    expect(
      resolveRegionUserDataDirName({
        isPackaged: true,
        region: 'cn',
        argv: ARGV,
        identity: PERSONAL_BRAND_IDENTITY,
      }),
    ).toBeNull();
    expect(
      resolveRegionUserDataDirName({
        isPackaged: true,
        region: 'global',
        argv: ARGV,
        identity: PERSONAL_BRAND_IDENTITY,
      }),
    ).toBe('CindyGlobal');
    expect(
      resolveRegionUserDataDirName({
        isPackaged: true,
        region: 'dev',
        argv: ARGV,
        identity: PERSONAL_BRAND_IDENTITY,
      }),
    ).toBe('CindyDev');
  });

  it('显式 --user-data-dir 仍优先,个人身份也不例外', () => {
    expect(
      resolveRegionUserDataDirName({
        isPackaged: true,
        region: 'global',
        argv: ['CindyPersonal.exe', '--user-data-dir=C:\\tmp\\personal-smoke'],
        identity: PERSONAL_BRAND_IDENTITY,
      }),
    ).toBeNull();
  });
});
