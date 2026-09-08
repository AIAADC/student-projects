import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSafeRelativePath } from "./github-files.js";
import { isIgnoredSkillEntry } from "./skill-ignore.js";

/**
 * 最小 ZIP 写入器(store 模式,无压缩):归档用,零依赖。
 * 只支持文件条目(目录不产生单独条目),路径按 POSIX 排序保证确定性。
 * 输出可通过标准 zip 工具与本文档测试内的自校验读取器解出。
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date): number {
  return ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
}

function dosDate(date: Date): number {
  return (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
}

function u16(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff];
}

function u32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

/** 把目录打包成 zip 字节(store 模式)。文件按 POSIX 相对路径排序。 */
export async function zipDirectory(dir: string, mtime: Date = new Date()): Promise<Uint8Array> {
  const files = await collectFiles(dir);
  const chunks: Uint8Array[] = [];
  const central: number[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const rel = path.relative(dir, f).split(path.sep).join("/");
    const bytes = await readFile(f);
    const crc = crc32(bytes);
    const name = enc.encode(rel);
    const head: number[] = [];
    head.push(...u32(LOCAL_SIG), ...u16(20), ...u16(0), ...u16(0), ...u16(dosTime(mtime)), ...u16(dosDate(mtime)));
    head.push(...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(name.length), ...u16(0));
    chunks.push(new Uint8Array(head), name, bytes);
    const cd: number[] = [];
    cd.push(...u32(CENTRAL_SIG), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(dosTime(mtime)), ...u16(dosDate(mtime)));
    cd.push(...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset));
    central.push(...cd, ...name);
    offset += head.length + name.length + bytes.length;
  }
  const centralBytes = new Uint8Array(central);
  chunks.push(centralBytes);
  const eocd: number[] = [];
  eocd.push(...u32(EOCD_SIG), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length));
  eocd.push(...u32(centralBytes.length), ...u32(offset), ...u16(0));
  chunks.push(new Uint8Array(eocd));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** 递归收集目录下全部文件(跳过目录本身与 IGNORED_SKILL_ENTRIES;忽略无权限/损坏项)。 */
async function collectFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string): Promise<void> => {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      if (isIgnoredSkillEntry(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(p);
      } else if (e.isFile()) {
        out.push(p);
      }
    }
  };
  await walk(dir);
  return out.sort();
}

/** 读取 zip 的文件条目(仅 store 模式),测试自校验用。返回 POSIX 相对路径 → 内容。 */
export async function zipEntries(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const map = new Map<string, Uint8Array>();
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const readU16 = (o: number) => dv.getUint16(o, true);
  const readU32 = (o: number) => dv.getUint32(o, true);
  // 定位 EOCD:从尾部找签名
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (readU32(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip 缺少 EOCD");
  const count = readU16(eocd + 10);
  let off = readU32(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (readU32(off) !== CENTRAL_SIG) throw new Error("zip 中央目录损坏 @" + off);
    const nameLen = readU16(off + 28);
    const extraLen = readU16(off + 30);
    const commentLen = readU16(off + 32);
    const localOff = readU32(off + 42);
    const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
    if (readU32(localOff) !== LOCAL_SIG) throw new Error("zip 本地头损坏 @" + localOff);
    const nameLenL = readU16(localOff + 26);
    const extraLenL = readU16(localOff + 28);
    const size = readU32(localOff + 18);
    const dataStart = localOff + 30 + nameLenL + extraLenL;
    map.set(name, buf.subarray(dataStart, dataStart + size));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return map;
}

/** 把 store 模式 zip 解到 dest(拒绝 .. / 绝对路径)。 */
export async function unzipDirectory(buf: Uint8Array, dest: string): Promise<void> {
  const entries = await zipEntries(buf);
  for (const [rel, bytes] of entries) {
    if (!isSafeRelativePath(rel)) throw new Error("zip 含非法路径: " + rel);
    const full = path.join(dest, ...rel.split("/"));
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }
}

