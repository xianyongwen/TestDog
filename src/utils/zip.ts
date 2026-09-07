// 极简 stored（无压缩）ZIP 写入器，支持 UTF-8 文件名。
// 仅用于前端打包 .testcase 文本文件；结构遵循 PKZIP APPNOTE，多字节整数均为小端。
// 已用 macOS ditto / Archive Utility（双击解压）与 Python zipfile 验证：含中文路径名可正确还原。

const enc = new TextEncoder();

const crcTable: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 打包一组文件为 ZIP（stored，无压缩）。文件名可含路径分隔符 `/`，支持 UTF-8（中文）。 */
export function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const entries = files.map((f) => {
    const name = enc.encode(f.name);
    return { name, data: f.data, crc: crc32(f.data) };
  });

  let total = 0;
  for (const e of entries) total += 30 + e.name.length + e.data.length; // 本地文件头 30B + 名 + 数据
  for (const e of entries) total += 46 + e.name.length;                  // 中央目录头 46B + 名
  total += 22;                                                           // EOCD 22B

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let p = 0;
  const offsets: number[] = [];
  const FLAG_UTF8 = 0x0800; // bit11：文件名按 UTF-8 编码
  const MOD_DATE = 0x0021;  // 1980-01-01（DOS 日期下限）
  const MOD_TIME = 0x0000;

  for (const e of entries) {
    offsets.push(p);
    dv.setUint32(p, 0x04034b50, true); p += 4; // 本地文件头签名
    dv.setUint16(p, 20, true); p += 2;         // 所需版本
    dv.setUint16(p, FLAG_UTF8, true); p += 2;  // 标志位
    dv.setUint16(p, 0, true); p += 2;          // 压缩方法：stored
    dv.setUint16(p, MOD_TIME, true); p += 2;
    dv.setUint16(p, MOD_DATE, true); p += 2;
    dv.setUint32(p, e.crc, true); p += 4;
    dv.setUint32(p, e.data.length, true); p += 4; // 压缩后大小
    dv.setUint32(p, e.data.length, true); p += 4; // 原始大小
    dv.setUint16(p, e.name.length, true); p += 2;
    dv.setUint16(p, 0, true); p += 2;             // 额外字段长度
    out.set(e.name, p); p += e.name.length;
    out.set(e.data, p); p += e.data.length;
  }

  const cdOffset = p;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    dv.setUint32(p, 0x02014b50, true); p += 4; // 中央目录头签名
    dv.setUint16(p, 20, true); p += 2;         // 制作版本
    dv.setUint16(p, 20, true); p += 2;         // 所需版本
    dv.setUint16(p, FLAG_UTF8, true); p += 2;
    dv.setUint16(p, 0, true); p += 2;          // 压缩方法：stored
    dv.setUint16(p, MOD_TIME, true); p += 2;
    dv.setUint16(p, MOD_DATE, true); p += 2;
    dv.setUint32(p, e.crc, true); p += 4;
    dv.setUint32(p, e.data.length, true); p += 4;
    dv.setUint32(p, e.data.length, true); p += 4;
    dv.setUint16(p, e.name.length, true); p += 2;
    dv.setUint16(p, 0, true); p += 2;          // 额外字段
    dv.setUint16(p, 0, true); p += 2;          // 注释
    dv.setUint16(p, 0, true); p += 2;          // 起始盘号
    dv.setUint16(p, 0, true); p += 2;          // 内部属性
    dv.setUint32(p, 0, true); p += 4;          // 外部属性
    dv.setUint32(p, offsets[i], true); p += 4; // 本地头偏移
    out.set(e.name, p); p += e.name.length;
  }
  const cdSize = p - cdOffset;

  dv.setUint32(p, 0x06054b50, true); p += 4;        // EOCD 签名
  dv.setUint16(p, 0, true); p += 2;                 // 当前盘号
  dv.setUint16(p, 0, true); p += 2;                 // 中央目录所在盘
  dv.setUint16(p, entries.length, true); p += 2;    // 本盘记录数
  dv.setUint16(p, entries.length, true); p += 2;    // 总记录数
  dv.setUint32(p, cdSize, true); p += 4;
  dv.setUint32(p, cdOffset, true); p += 4;
  dv.setUint16(p, 0, true); p += 2;                 // 注释长度

  return out;
}
