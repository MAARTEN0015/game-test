/**
 * msgpack.js
 * Much more efficient and lightweight MsgPack.
 * Only job is to encode and decode.
 */

class MsgPack {
	constructor(initialSize = 1024) {
		this.buffer = new Uint8Array(initialSize);
		this.view = new DataView(this.buffer.buffer);
		this.pos = 0;
		this.te = new TextEncoder();
		this.td = new TextDecoder();
	}

	ensure(size) {
		if (this.buffer.length < this.pos + size) {
			let newSize = this.buffer.length * 2;
			while (newSize < this.pos + size) newSize *= 2;
			const newBuf = new Uint8Array(newSize);
			newBuf.set(this.buffer);
			this.buffer = newBuf;
			this.view = new DataView(this.buffer.buffer);
		}
	}

	writeU8(val) {
		this.ensure(1);
		this.view.setUint8(this.pos, val);
		this.pos += 1;
	}

	write(buf) {
		this.ensure(buf.length);
		this.buffer.set(buf, this.pos);
		this.pos += buf.length;
	}

	encode(data) {
		this.pos = 0;
		this.encodeValue(data);
		return this.buffer.subarray(0, this.pos);
	}

	encodeValue(val) {
		if (val === null || val === undefined) {
			return this.writeU8(0xc0);
		}
		if (typeof val === 'boolean') {
			return this.writeU8(val ? 0xc3 : 0xc2);
		}
		if (typeof val === 'number') {
			return this.encodeNumber(val);
		}
		if (typeof val === 'bigint') {
			return this.encodeBigInt(val);
		}
		if (typeof val === 'string') {
			return this.encodeString(val);
		}
		if (Array.isArray(val) || ArrayBuffer.isView(val)) {
			return this.encodeArray(val);
		}
		if (val instanceof Date) {
			return this.encodeDate(val);
		}
		if (val instanceof Object) {
			return this.encodeObject(val);
		}
		throw new Error(`Unsupported type: ${typeof val}`);
	}

	encodeNumber(num) {
		if (Number.isInteger(num)) {
			if (num >= 0 && num < 0x80) {
				return this.writeU8(num);
			}
			if (num < 0 && num >= -0x20) {
				return this.writeU8(0xe0 | (num + 0x20));
			}
			if (num > 0 && num <= 0xff) {
				this.writeU8(0xcc);
				return this.writeU8(num);
			}
			if (num >= -0x80 && num <= 0x7f) {
				this.writeU8(0xd0);
				return this.writeU8(num & 0xff);
			}
			if (num > 0 && num <= 0xffff) {
				this.writeU8(0xcd);
				this.ensure(2);
				this.view.setUint16(this.pos, num);
				this.pos += 2;
				return;
			}
			if (num >= -0x8000 && num <= 0x7fff) {
				this.writeU8(0xd1);
				this.ensure(2);
				this.view.setInt16(this.pos, num);
				this.pos += 2;
				return;
			}
			if (num > 0 && num <= 0xffffffff) {
				this.writeU8(0xce);
				this.ensure(4);
				this.view.setUint32(this.pos, num);
				this.pos += 4;
				return;
			}
			if (num >= -0x80000000 && num <= 0x7fffffff) {
				this.writeU8(0xd2);
				this.ensure(4);
				this.view.setInt32(this.pos, num);
				this.pos += 4;
				return;
			}
			return this.encodeBigInt(BigInt(num));
		}
		this.ensure(9);
		this.writeU8(0xcb);
		this.view.setFloat64(this.pos, num);
		this.pos += 8;
	}

	encodeBigInt(bi) {
		const unsigned = bi >= 0n;
		const tag = unsigned ? 0xcf : 0xd3;
		this.ensure(9);
		this.writeU8(tag);
		if (unsigned) {
			this.view.setBigUint64(this.pos, bi);
		} else {
			this.view.setBigInt64(this.pos, bi);
		}
		this.pos += 8;
	}

	encodeString(str) {
		const bytes = this.te.encode(str);
		const len = bytes.length;
		if (len < 0x20) {
			this.writeU8(0xa0 | len);
		} else if (len < 0x100) {
			this.writeU8(0xd9);
			this.writeU8(len);
		} else if (len < 0x10000) {
			this.writeU8(0xda);
			this.ensure(2);
			this.view.setUint16(this.pos, len);
			this.pos += 2;
		} else {
			this.writeU8(0xdb);
			this.ensure(4);
			this.view.setUint32(this.pos, len);
			this.pos += 4;
		}
		return this.write(bytes);
	}

	encodeArray(arr) {
		const len = arr.length;
		if (len < 0x10) {
			this.writeU8(0x90 | len);
		} else if (len < 0x10000) {
			this.writeU8(0xdc);
			this.ensure(2);
			this.view.setUint16(this.pos, len);
			this.pos += 2;
		} else {
			this.writeU8(0xdd);
			this.ensure(4);
			this.view.setUint32(this.pos, len);
			this.pos += 4;
		}
		for (let v of arr) this.encodeValue(v);
	}

	encodeObject(obj) {
		const entries = Object.entries(obj);
		const len = entries.length;
		if (len < 0x10) {
			this.writeU8(0x80 | len);
		} else if (len < 0x10000) {
			this.writeU8(0xde);
			this.ensure(2);
			this.view.setUint16(this.pos, len);
			this.pos += 2;
		} else {
			this.writeU8(0xdf);
			this.ensure(4);
			this.view.setUint32(this.pos, len);
			this.pos += 4;
		}
		for (let [k, v] of entries) {
			this.encodeString(k);
			this.encodeValue(v);
		}
	}

	encodeDate(date) {
		const ms = date.getTime();
		const sec = Math.floor(ms / 1000);
		const ns = (ms % 1000) * 1e6;
		if (ns === 0 && sec < 0x100000000) {
			this.writeU8(0xd6);
			this.writeU8(0xff);
			this.ensure(4);
			this.view.setUint32(this.pos, sec);
			this.pos += 4;
		} else {
			this.writeU8(0xc7);
			this.writeU8(12);
			this.writeU8(0xff);
			this.ensure(12);
			this.view.setUint32(this.pos, ns);
			this.pos += 4;
			this.view.setBigInt64(this.pos, BigInt(sec));
			this.pos += 8;
		}
	}

	decode(buffer) {
		if (!(buffer instanceof Uint8Array)) buffer = new Uint8Array(buffer);
		this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		this.pos = 0;
		this.buffer = buffer;
		return this.parseValue();
	}

	readU8() { return this.view.getUint8(this.pos++); }

	parseValue() {
		const byte = this.readU8();
		if (byte < 0x80) return byte;
		if (byte < 0x90) return this.parseMap(byte & 0x0f);
		if (byte < 0xa0) return this.parseArray(byte & 0x0f);
		if (byte < 0xc0) return this.parseString(byte & 0x1f);
		switch (byte) {
			case 0xc0: return null;
			case 0xc2: return false;
			case 0xc3: return true;
			case 0xca: return this.parseFloat(4);
			case 0xcb: return this.parseFloat(8);
			case 0xcc: return this.readU8();
			case 0xcd: return this.parseUint(2);
			case 0xce: return this.parseUint(4);
			case 0xcf: return this.parseUint(8);
			case 0xd0: return this.parseInt(1);
			case 0xd1: return this.parseInt(2);
			case 0xd2: return this.parseInt(4);
			case 0xd3: return this.parseInt(8);
			case 0xd9: return this.parseString(this.readU8());
			case 0xda: return this.parseString(this.parseUint(2));
			case 0xdb: return this.parseString(this.parseUint(4));
			case 0xdc: return this.parseArray(this.parseUint(2));
			case 0xdd: return this.parseArray(this.parseUint(4));
			case 0xde: return this.parseMap(this.parseUint(2));
			case 0xdf: return this.parseMap(this.parseUint(4));
			default:
				if (byte >= 0xe0) return (byte - 0x100);
				throw new Error(`Unknown byte: 0x${byte.toString(16)}`);
		}
	}

	parseUint(bytes) {
		let val = 0;
		for (let i = 0; i < bytes; i++) val = (val << 8) | this.readU8();
		return val;
	}

	parseInt(bytes) {
		let val = this.parseUint(bytes);
		const max = 1 << ((bytes * 8) - 1);
		return val >= max ? val - (max << 1) : val;
	}

	parseFloat(bytes) {
		let v = bytes === 4 ? this.view.getFloat32(this.pos) : this.view.getFloat64(this.pos);
		this.pos += bytes;
		return v;
	}

	parseString(len) {
		const start = this.pos;
		this.pos += len;
		const slice = this.buffer.subarray(start, start + len);
		return this.td.decode(slice);
	}

	parseArray(len) {
		const arr = [];
		for (let i = 0; i < len; i++) arr.push(this.parseValue());
		return arr;
	}

	parseMap(len) {
		const obj = {};
		for (let i = 0; i < len; i++) {
			const key = this.parseValue();
			obj[key] = this.parseValue();
		}
		return obj;
	}
}

const msgpack = new MsgPack();
export default msgpack;