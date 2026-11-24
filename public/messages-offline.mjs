// \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t, n) => () => {
	if (n) throw n[0];
	try {
		return e && (t = e(e = 0)), t;
	} catch (e) {
		throw n = [e], e;
	}
}, s = (e, t) => () => (t || (e((t = { exports: {} }).exports, t, t.exports), e = null), t.exports), c = (e, n) => {
	let r = {};
	for (var i in e) t(r, i, {
		get: e[i],
		enumerable: !0
	});
	return n || t(r, Symbol.toStringTag, { value: "Module" }), r;
}, l = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, u = (n, r, o) => (o = n == null ? {} : e(i(n)), l(r || !n || !n.__esModule || !a.call(n, "default") ? t(o, "default", {
	value: n,
	enumerable: !0
}) : o, n)), d = /* @__PURE__ */ s(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.parse = s, e.stringifySetCookie = c, e.serialize = c, e.stringifySetCookie = c, e.serialize = c;
	var t = /^[\u0021-\u003A\u003C\u003E-\u007E]+$/, n = /^[\u0021-\u003A\u003C-\u007E]*$/, r = /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i, i = /^[\u0020-\u003A\u003D-\u007E]*$/, a = Object.prototype.toString, o = /* @__PURE__ */ (() => {
		let e = function() {};
		return e.prototype = Object.create(null), e;
	})();
	function s(e, t) {
		let n = new o(), r = e.length;
		if (r < 2) return n;
		let i = t?.decode || f, a = 0;
		do {
			let t = u(e, a, r);
			if (t === -1) break;
			let o = l(e, a, r);
			if (t > o) {
				a = e.lastIndexOf(";", t - 1) + 1;
				continue;
			}
			let s = d(e, a, t);
			n[s] === void 0 && (n[s] = i(d(e, t + 1, o))), a = o + 1;
		} while (a < r);
		return n;
	}
	function c(e, a, o) {
		let s = typeof e == "object" ? e : {
			...o,
			name: e,
			value: String(a)
		}, c = (typeof a == "object" ? a : o)?.encode || encodeURIComponent;
		if (!t.test(s.name)) throw TypeError(`argument name is invalid: ${s.name}`);
		let l = s.value ? c(s.value) : "";
		if (!n.test(l)) throw TypeError(`argument val is invalid: ${s.value}`);
		let u = s.name + "=" + l;
		if (s.maxAge !== void 0) {
			if (!Number.isInteger(s.maxAge)) throw TypeError(`option maxAge is invalid: ${s.maxAge}`);
			u += "; Max-Age=" + s.maxAge;
		}
		if (s.domain) {
			if (!r.test(s.domain)) throw TypeError(`option domain is invalid: ${s.domain}`);
			u += "; Domain=" + s.domain;
		}
		if (s.path) {
			if (!i.test(s.path)) throw TypeError(`option path is invalid: ${s.path}`);
			u += "; Path=" + s.path;
		}
		if (s.expires) {
			if (!p(s.expires) || !Number.isFinite(s.expires.valueOf())) throw TypeError(`option expires is invalid: ${s.expires}`);
			u += "; Expires=" + s.expires.toUTCString();
		}
		if (s.httpOnly && (u += "; HttpOnly"), s.secure && (u += "; Secure"), s.partitioned && (u += "; Partitioned"), s.priority) switch (typeof s.priority == "string" ? s.priority.toLowerCase() : void 0) {
			case "low":
				u += "; Priority=Low";
				break;
			case "medium":
				u += "; Priority=Medium";
				break;
			case "high":
				u += "; Priority=High";
				break;
			default: throw TypeError(`option priority is invalid: ${s.priority}`);
		}
		if (s.sameSite) switch (typeof s.sameSite == "string" ? s.sameSite.toLowerCase() : s.sameSite) {
			case !0:
			case "strict":
				u += "; SameSite=Strict";
				break;
			case "lax":
				u += "; SameSite=Lax";
				break;
			case "none":
				u += "; SameSite=None";
				break;
			default: throw TypeError(`option sameSite is invalid: ${s.sameSite}`);
		}
		return u;
	}
	function l(e, t, n) {
		let r = e.indexOf(";", t);
		return r === -1 ? n : r;
	}
	function u(e, t, n) {
		let r = e.indexOf("=", t);
		return r < n ? r : -1;
	}
	function d(e, t, n) {
		let r = t, i = n;
		do {
			let t = e.charCodeAt(r);
			if (t !== 32 && t !== 9) break;
		} while (++r < i);
		for (; i > r;) {
			let t = e.charCodeAt(i - 1);
			if (t !== 32 && t !== 9) break;
			i--;
		}
		return e.slice(r, i);
	}
	function f(e) {
		if (e.indexOf("%") === -1) return e;
		try {
			return decodeURIComponent(e);
		} catch {
			return e;
		}
	}
	function p(e) {
		return a.call(e) === "[object Date]";
	}
}));
// node_modules/@supabase/ssr/dist/module/utils/helpers.js
function f(e) {
	let t = p.parse(e);
	return Object.keys(t ?? {}).map((e) => ({
		name: e,
		value: t[e]
	}));
}
var p, ee = o((() => {
	p = /* @__PURE__ */ u(d());
})), te = o((() => {}));
// node_modules/@supabase/ssr/dist/module/utils/chunker.js
async function ne(e, t) {
	let n = await t(e);
	if (n) return n;
	let r = [];
	for (let n = 0;; n++) {
		let i = await t(`${e}.${n}`);
		if (!i) break;
		r.push(i);
	}
	return r.length > 0 ? r.join("") : null;
}
var re = o((() => {}));
// node_modules/@supabase/ssr/dist/module/utils/base64url.js
function ie(e) {
	let t = [], n = (e) => {
		t.push(String.fromCodePoint(e));
	}, r = {
		utf8seq: 0,
		codepoint: 0
	}, i = 0, a = 0;
	for (let t = 0; t < e.length; t += 1) {
		let o = e.charCodeAt(t), s = oe[o];
		if (s > -1) for (i = i << 6 | s, a += 6; a >= 8;) ae(i >> a - 8 & 255, r, n), a -= 8;
		else if (s === -2) continue;
		else throw Error(`Invalid Base64-URL character "${e.at(t)}" at position ${t}`);
	}
	return t.join("");
}
function ae(e, t, n) {
	if (t.utf8seq === 0) {
		if (e <= 127) {
			n(e);
			return;
		}
		for (let n = 1; n < 6; n += 1) if (!(e >> 7 - n & 1)) {
			t.utf8seq = n;
			break;
		}
		if (t.utf8seq === 2) t.codepoint = e & 31;
		else if (t.utf8seq === 3) t.codepoint = e & 15;
		else if (t.utf8seq === 4) t.codepoint = e & 7;
		else throw Error("Invalid UTF-8 sequence");
		--t.utf8seq;
	} else if (t.utf8seq > 0) {
		if (e <= 127) throw Error("Invalid UTF-8 sequence");
		t.codepoint = t.codepoint << 6 | e & 63, --t.utf8seq, t.utf8seq === 0 && n(t.codepoint);
	}
}
var m, h, oe, se = o((() => {
	m = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split(""), h = " 	\n\r=".split(""), oe = (() => {
		let e = Array(128);
		for (let t = 0; t < e.length; t += 1) e[t] = -1;
		for (let t = 0; t < h.length; t += 1) e[h[t].charCodeAt(0)] = -2;
		for (let t = 0; t < m.length; t += 1) e[m[t].charCodeAt(0)] = t;
		return e;
	})();
})), ce = o((() => {
	ee(), te(), re(), se();
})), le = o((() => {})), ue = o((() => {})), de = o((() => {})), fe = o((() => {
	le(), ue(), de(), ce();
})), pe = /* @__PURE__ */ c({
	continuationState: () => _,
	continuing: () => b,
	enrollContinuation: () => ve,
	markRetired: () => he,
	recoverContinuation: () => ye,
	retireContinuation: () => ge
});
function g() {
	return S ||= new Promise((e, t) => {
		let n = indexedDB.open("algt-chat-continuation-v1", 1);
		n.onupgradeneeded = () => n.result.createObjectStore("guard"), n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
	}).catch((e) => {
		throw S = void 0, e;
	}), S;
}
async function _() {
	let e = (await g()).transaction("guard").objectStore("guard");
	return new Promise((t, n) => {
		let r = e.get("current");
		r.onsuccess = () => t(r.result ?? x), r.onerror = () => n(r.error);
	});
}
async function me(e) {
	let t = (await g()).transaction("guard", "readwrite"), n = t.objectStore("guard");
	return new Promise((r, i) => {
		let a, o = n.get("current");
		o.onsuccess = () => {
			try {
				n.put(e(o.result ?? x), "current");
			} catch (e) {
				a = e, t.abort();
			}
		}, t.oncomplete = () => r(), t.onabort = () => i(a ?? t.error), t.onerror = () => i(t.error);
	});
}
function he(e) {
	try {
		localStorage.setItem("algt-chat-retired/" + e, "1");
	} catch {}
}
function v(e) {
	if (localStorage.getItem("algt-chat-retired/" + e)) throw Error("Sign in again to unlock messages.");
}
function ge(e) {
	return !e || typeof indexedDB > "u" ? Promise.resolve() : (he(e), me((t) => t.enrollment && t.enrollment.session !== e ? t : {
		epoch: crypto.randomUUID(),
		retired: e
	}));
}
async function _e(e, t) {
	if (!/^sb-[a-zA-Z0-9_-]+-auth-token$/.test(e)) throw Error("Local ERP session is unavailable.");
	v(t.session);
	let n = new Map(f(document.cookie).map((e) => [e.name, e.value])), r = await ne(e, (e) => n.get(e));
	if (!r) throw Error("Sign in online to unlock cached messages.");
	let i = JSON.parse(r.startsWith("base64-") ? ie(r.slice(7)) : r);
	if (typeof i.access_token != "string" || typeof i.refresh_token != "string" || !i.refresh_token) throw Error("The local ERP session is incomplete.");
	let a = i.access_token.split(".");
	if (a.length !== 3 || !a[2]) throw Error("The local ERP session is incomplete.");
	let o = JSON.parse(ie(a[1]));
	if (o.sub !== t.account || typeof o.session_id != "string") throw Error("The ERP account changed.");
	if (Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", C(o.session_id))), (e) => e.toString(16).padStart(2, "0")).join("") !== t.session) throw Error("The ERP session changed. Sign in online.");
	let s = C(JSON.stringify([i.refresh_token, a[2]]));
	try {
		return await crypto.subtle.importKey("raw", s, "HKDF", !1, ["deriveKey"]);
	} finally {
		s.fill(0);
	}
}
async function y(e) {
	return crypto.subtle.deriveKey({
		name: "HKDF",
		hash: "SHA-256",
		salt: e.salt,
		info: C("ALGT ERP offline chat v1/" + e.account + "/" + e.session)
	}, await _e(e.cookieName, e), {
		name: "AES-KW",
		length: 256
	}, !1, ["wrapKey", "unwrapKey"]);
}
async function ve(e, t, n, r, i) {
	let a = {
		...t,
		cookieName: n,
		salt: crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(32)),
		wrapped: /* @__PURE__ */ new ArrayBuffer(0)
	};
	a.wrapped = await crypto.subtle.wrapKey("raw", r, await y(a), "AES-KW"), i.throwIfAborted(), await me((n) => {
		if (i.throwIfAborted(), v(t.session), n.epoch !== e || n.retired === t.session) throw Error("The ERP session changed during offline enrollment.");
		return {
			epoch: n.enrollment?.session === t.session ? n.epoch : crypto.randomUUID(),
			enrollment: a
		};
	});
}
async function b(e, t) {
	v(e);
	let n = await _();
	if (n.enrollment?.session !== e || n.enrollment.account !== t) throw Error("The local ERP session was retired.");
	await crypto.subtle.unwrapKey("raw", n.enrollment.wrapped, await y(n.enrollment), "AES-KW", "AES-GCM", !1, ["decrypt"]), v(e);
}
async function ye() {
	let e = await _(), t = e.enrollment;
	if (!t) throw Error("Connect and open Messages with your ERP account to enable offline access.");
	let n = await crypto.subtle.unwrapKey("raw", t.wrapped, await y(t), "AES-KW", "AES-GCM", !1, ["encrypt", "decrypt"]), r = await _();
	if (v(t.session), r.epoch !== e.epoch || r.enrollment?.session !== t.session) throw Error("The local ERP session changed.");
	return {
		binding: {
			account: t.account,
			session: t.session,
			expectedProfile: t.expectedProfile
		},
		key: n
	};
}
var x, S, C, w = o((() => {
	fe(), x = { epoch: "initial" }, C = (e) => new TextEncoder().encode(e);
}));
// src/features/messages/offline-session.ts
w();
var T = new AbortController();
function E(e) {
	return e ? AbortSignal.any([T.signal, e]) : T.signal;
}
var D, O;
function be(e) {
	D !== e && Ce(), D = e;
}
function k() {
	return D;
}
function xe(e, t, n) {
	if (!t || t !== D) throw Error("The messaging session changed.");
	(O?.account !== e || O.session !== t) && (O = {
		account: e,
		session: t,
		key: n
	});
}
function A(e, t) {
	if (O?.account !== e || O.session !== t) throw Error("Sign in online with this ERP account to unlock this device.");
	return O.key;
}
function Se() {
	O = void 0;
}
function Ce() {
	let e = D;
	if (e && typeof localStorage < "u") {
		try {
			localStorage.setItem("algt-chat-retired/" + e, "1");
		} catch {}
		Promise.resolve().then(() => (w(), pe)).then((t) => t.retireContinuation(e)).catch(() => {});
	}
	T.abort(), T = new AbortController(), D = void 0, Se();
}
var j = "/api/mobile/communications/v1";
// src/features/messages/client.ts
function M(e, t) {
	let n = new Headers(t.headers), r = k();
	r && n.set("X-ERP-Communication-Session", r);
	let i = E(t.signal ?? void 0);
	return i.throwIfAborted(), fetch(e, {
		...t,
		headers: n,
		signal: i
	});
}
var N = class extends Error {
	constructor(e, t) {
		super(t), this.status = e;
	}
};
async function P(e) {
	if (!e.ok) {
		let t = await e.json().catch(() => null);
		throw new N(e.status, t?.error?.message || "The ERP could not complete this request.");
	}
	return e;
}
async function F(e, t = {}, n) {
	let r = await (await P(await M(j, {
		method: "POST",
		credentials: "same-origin",
		cache: "no-store",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			op: e,
			args: t
		}),
		signal: n
	}))).json();
	if (r.success !== !0) throw Error("The ERP did not confirm this operation.");
	return r.data;
}
var I = /* @__PURE__ */ new Map();
async function L(e, t, n, r) {
	if (r = E(r), n) return F(e, {
		...t,
		clientMutationId: n
	}, r);
	let i = new TextEncoder().encode(JSON.stringify([
		k(),
		e,
		t
	])), a = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", i)), (e) => e.toString(16).padStart(2, "0")).join(""), o = I.get(a) ?? crypto.randomUUID();
	I.set(a, o);
	try {
		let n = await F(e, {
			...t,
			clientMutationId: o
		}, r);
		return I.delete(a), n;
	} catch (e) {
		throw e instanceof N && e.status < 500 && I.delete(a), e;
	}
}
var we = class extends Error {
	constructor(e) {
		super("This attachment upload expired or failed. Retry the draft to reserve a new upload."), this.uploadId = e;
	}
};
async function Te(e, t, n) {
	let r = await F("chat.uploadStatus", { uploadId: e }, n);
	if (r?.uploadId !== e || r.conversationId !== t || !Number.isSafeInteger(r.byteLength) || r.byteLength < 1 || r.byteLength > 52428800 || ![
		"reserved",
		"verified",
		"attached",
		"failed"
	].includes(r.state) || r.terminal !== void 0 && typeof r.terminal != "boolean" || r.terminal && r.state === "attached" || r.terminal === !1 && r.state === "failed") throw Error("The ERP could not confirm this attachment upload.");
	return {
		...r,
		terminal: r.state === "failed" || r.terminal === !0
	};
}
async function Ee(e, t, n, r, i) {
	if (!t.size || t.size > 52428800) throw Error("Each file must contain data and be 50 MiB or smaller.");
	let a = (t.type || "application/octet-stream").split(";")[0], { uploadId: o } = await L("chat.uploadBegin", {
		conversationId: e,
		filename: t.name,
		mime: a,
		byteLength: t.size,
		...n && { kind: "voice" }
	}, r, i), s = await Te(o, e, i);
	if (s.byteLength !== t.size) throw Error("The reserved attachment size changed.");
	if (s.terminal) throw new we(o);
	if (s.state === "reserved") {
		let e = await (await P(await M(j + "/uploads/" + encodeURIComponent(o), {
			method: "POST",
			credentials: "same-origin",
			cache: "no-store",
			headers: { "Content-Type": a },
			body: t,
			signal: i
		}))).json();
		if (!e.success || !["verified", "attached"].includes(e.data?.state)) throw Error("File verification is incomplete.");
	}
	return o;
}
// src/features/messages/vault.ts
var De = "algt-messages-v1";
function R(e) {
	return new Promise((t, n) => {
		e.onsuccess = () => t(e.result), e.onerror = () => n(e.error);
	});
}
var z;
function B() {
	if (!z) {
		let e = indexedDB.open(De, 1);
		e.onupgradeneeded = () => {
			e.result.createObjectStore("keys"), e.result.createObjectStore("records");
		}, z = R(e).catch((e) => {
			throw z = void 0, e;
		});
	}
	return z;
}
async function V(e, t) {
	let n = (await B()).transaction(e, "readwrite"), r = new Promise((e, t) => {
		n.oncomplete = () => e(), n.onabort = () => t(n.error), n.onerror = () => t(n.error);
	});
	return t(n.objectStore(e)), r;
}
async function Oe(e, t, n, r) {
	let i = JSON.stringify([
		"algt-chat-upload-retry-v1",
		e,
		t,
		n.id,
		n.uploadKey,
		r
	]), a = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(i)));
	a[6] = a[6] & 15 | 128, a[8] = a[8] & 63 | 128;
	let o = Array.from(a.subarray(0, 16), (e) => e.toString(16).padStart(2, "0")).join("");
	return `${o.slice(0, 8)}-${o.slice(8, 12)}-${o.slice(12, 16)}-${o.slice(16, 20)}-${o.slice(20)}`;
}
var ke = class {
	constructor(e, t, n, r = !1) {
		this.account = e, this.session = t, this.profileId = n, this.enforceDeviceEpoch = r;
	}
	async current() {
		this.enforceDeviceEpoch && await b(this.session, this.account);
	}
	path(e) {
		return this.account + "/" + e;
	}
	async encrypt(e, t) {
		let n = this.path(e), r = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(12)), i = A(this.account, this.session), a = await crypto.subtle.encrypt({
			name: "AES-GCM",
			iv: r,
			additionalData: new TextEncoder().encode(n)
		}, i, t);
		if (A(this.account, this.session) !== i) throw Error("The messaging session changed.");
		return await this.current(), {
			iv: r,
			cipher: a
		};
	}
	async bytes(e, t) {
		let n = await this.encrypt(e, t);
		await V("records", (t) => {
			t.put(n, this.path(e));
		});
	}
	async readBytes(e) {
		let t = this.path(e), n = await R((await B()).transaction("records").objectStore("records").get(t));
		if (!n) return null;
		let r = A(this.account, this.session), i = await crypto.subtle.decrypt({
			name: "AES-GCM",
			iv: n.iv,
			additionalData: new TextEncoder().encode(t)
		}, r, n.cipher);
		if (A(this.account, this.session) !== r) throw Error("The messaging session changed.");
		return await this.current(), i;
	}
	async put(e, t) {
		await this.bytes(e, new TextEncoder().encode(JSON.stringify(t)).buffer);
	}
	async get(e) {
		let t = await this.readBytes(e);
		return t ? JSON.parse(new TextDecoder().decode(t)) : null;
	}
	async list(e) {
		let t = this.path(e);
		return (await R((await B()).transaction("records").objectStore("records").getAllKeys(IDBKeyRange.bound(t, t + "￿")))).map((e) => String(e).slice(this.account.length + 1));
	}
	async clear(e) {
		let t = this.path(e);
		await V("records", (e) => {
			e.delete(IDBKeyRange.bound(t, t + "￿"));
		});
	}
	async drop(e) {
		await V("records", (t) => {
			t.delete(this.path(e));
		});
	}
	async reconcile(e, t) {
		let n = new Map(e.map((e) => [e.id, e.changeSeq])), r = (await this.list("cache/")).filter((e) => e.endsWith("/history"));
		for (let e of r) {
			t.throwIfAborted();
			let r = await this.get(e);
			r && (!n.has(r.conversation.id) || n.get(r.conversation.id) !== r.conversation.changeSeq) && await this.clear("cache/" + r.conversation.id + "/");
		}
	}
	async intents(e) {
		let t = await this.list("out/" + e + "/");
		return (await Promise.all(t.map((e) => this.get(e)))).filter((e) => !!e).sort((e, t) => e.createdAt.localeCompare(t.createdAt));
	}
	async persistIntent(e, t, n) {
		if (t.length !== e.uploads.length || t.some((e) => !e.size || e.size > 52428800)) throw Error("Each file must contain data and be 50 MiB or smaller.");
		for (let [n, r] of t.entries()) await this.bytes("payload/" + e.id + "/" + e.uploads[n].id, await r.arrayBuffer());
		let r = "out/" + e.conversationId + "/" + e.id, i = await this.encrypt(r, new TextEncoder().encode(JSON.stringify(e)).buffer);
		await V("records", (t) => {
			t.add(i, this.path(r)), n && t.delete(this.path(n));
			for (let n of e.uploads) t.delete(this.path("compose-file/" + e.conversationId + "/" + n.id));
		});
	}
	save(e) {
		return this.put("out/" + e.conversationId + "/" + e.id, e);
	}
	async remove(e) {
		await this.drop("out/" + e.conversationId + "/" + e.id), await this.clear("payload/" + e.id + "/");
	}
	async send(e, t) {
		if (t = E(t), k() !== this.session || e.session !== this.session || e.state !== "queued") throw Error("Review this device draft before sending.");
		let [n, r, i] = await Promise.all([
			F("communications.profile", {}, t),
			F("chat.conversation", {
				conversationId: e.conversationId,
				mode: "participant"
			}, t),
			F("policy.status", {}, t)
		]);
		if (n.profileId !== this.profileId || !n.chat.configured || !n.chat.eligible || !i.accepted || !i.currentVersion || i.currentVersion !== e.termsVersion || r.id !== e.conversationId) throw Error("Review your session, access and terms before sending.");
		let a = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Set(), s = async (n) => {
			let r = await Promise.all(e.uploads.map(async (t, r) => {
				let i = n.get(r);
				return i === void 0 ? t : (o.add(r), {
					...t,
					uploadKey: await Oe(this.session, e.id, t, i)
				});
			}));
			t.throwIfAborted(), e = {
				...e,
				uploadSession: this.session,
				preparedArgs: void 0,
				uploads: r
			}, await this.save(e);
		};
		if (e.preparedArgs) try {
			await L("chat.send", e.preparedArgs, e.id, t), await this.remove(e);
			return;
		} catch (n) {
			if (!(n instanceof N) || n.status !== 404 || !e.uploads.length || e.uploadSession !== this.session) throw n;
			let i = e.preparedArgs.uploadIds;
			if (!Array.isArray(i) || i.length !== e.uploads.length) throw n;
			let o = /* @__PURE__ */ new Map();
			for (let [e, s] of i.entries()) {
				if (typeof s != "string") throw n;
				let i = await Te(s, r.id, t);
				if (i.terminal) o.set(e, s);
				else if (i.state === "verified") a.set(e, s);
				else throw n;
			}
			if (!o.size) throw n;
			await s(o);
		}
		e.uploadSession !== this.session && await s(new Map(e.uploads.map((e, t) => [t, ""])));
		let c = {
			conversationId: r.id,
			...e.body && { body: e.body },
			mentionProfileIds: e.mentions,
			...e.replyId && { replyToMessageId: e.replyId }
		};
		e.dmsToken && (c.dmsRef = await F("chat.resolveDmsReference", { token: e.dmsToken }, t));
		let l = [];
		for (let [n, i] of e.uploads.entries()) {
			let c = a.get(n);
			if (c) {
				l.push(c);
				continue;
			}
			let u = await this.readBytes("payload/" + e.id + "/" + i.id);
			if (!u) throw Error("A local attachment could not be recovered.");
			let d = new File([u], i.name, { type: i.mime });
			try {
				l.push(await Ee(r.id, d, i.voice, i.uploadKey ?? i.id, t));
			} catch (i) {
				if (!(i instanceof we) || o.has(n)) throw i;
				await s(/* @__PURE__ */ new Map([[n, i.uploadId]]));
				let a = e.uploads[n];
				l.push(await Ee(r.id, d, a.voice, a.uploadKey ?? a.id, t));
			}
		}
		c.uploadIds = l, await this.save({
			...e,
			preparedArgs: c
		}), await L("chat.send", c, e.id, t), await this.remove(e);
	}
};
// src/features/messages/offline-entry.ts
w();
var H = document.getElementById("work"), U = 0, W, G, K = /* @__PURE__ */ new Set();
function q() {
	U++, W = void 0, G &&= (G.onstop = null, G.stream.getTracks().forEach((e) => e.stop()), G.state !== "inactive" && G.stop(), void 0);
	for (let e of K) URL.revokeObjectURL(e);
	K.clear(), H.replaceChildren();
}
function J(e, t, n = H) {
	let r = document.createElement(e);
	return t !== void 0 && (r.textContent = t), n.append(r), r;
}
function Y(e) {
	J("p", e instanceof Error ? e.message : "Cached chat is unavailable.").setAttribute("role", "alert");
}
function X(e, t, n = H) {
	let r = J("button", e, n);
	return r.type = "button", r.onclick = () => {
		r.disabled = !0, Promise.resolve().then(t).catch(Y).finally(() => {
			r.disabled = !1;
		});
	}, r;
}
async function Z(e) {
	if (!W || e !== U || document.hidden) throw Error("Open Messages again to verify this device.");
	if (await b(W.session, W.account), e !== U || document.hidden) throw Error("The session changed.");
}
function Ae() {
	J("h1", "Messages"), J("p", "Offline · cached on this device"), X("Reconnect to ERP", () => location.reload());
}
async function je(e, t, n, r) {
	X(t.filename, async () => {
		await Z(n);
		let i = await e.readBytes("cache/" + t.conversationId + "/media/" + e.session + "/" + t.id);
		if (!i) throw Error("This file has not been downloaded on this device.");
		await Z(n);
		let a = URL.createObjectURL(new Blob([i], { type: t.mime }));
		if (K.add(a), ["audio", "voice"].includes(t.kind)) {
			let e = J("audio", void 0, r);
			e.controls = !0, e.src = a;
		} else if (t.kind === "video") {
			let e = J("video", void 0, r);
			e.controls = !0, e.src = a;
		} else if (t.kind === "image") {
			let e = J("img", void 0, r);
			e.alt = t.filename, e.src = a;
		} else {
			let e = J("a", "Save cached file", r);
			e.href = a, e.download = t.filename, e.click();
		}
	}, r);
}
async function Q(e, t, n) {
	await Z(n);
	let [r, i, a] = await Promise.all([
		e.get("cache/" + t.id + "/history"),
		e.get("policy"),
		e.intents(t.id)
	]);
	if (await Z(n), !r || r.session !== e.session) throw Error("Open this conversation online before using it offline.");
	H.replaceChildren(), Ae(), X("Back to inbox", () => $(!1)), J("h2", t.title);
	for (let t of r.messages) {
		let r = J("article");
		J("strong", t.senderName ?? "System notice", r), J("small", " · " + new Date(t.sentAt).toLocaleString(), r), t.reply && J("blockquote", t.reply.deleted ? "Message deleted" : t.reply.body ?? "Reply to attachment", r);
		let i = J("p", t.deleted ? "Message deleted" : t.body, r);
		if (i.dir = "auto", !t.deleted) for (let i of t.attachments) await je(e, i, n, r);
	}
	for (let t of a) {
		let n = J("article");
		J("strong", t.state === "queued" && t.session === e.session ? "Pending delivery" : "Device draft · review online before sending", n), J("p", t.body, n), J("p", t.uploads.map((e) => e.name).join(", "), n);
	}
	if (i?.session !== e.session || !i.policy.accepted || !i.policy.currentVersion) {
		J("p", "Connect to ERP to check the current communication terms before sending.");
		return;
	}
	let o = i.policy.currentVersion, s = J("fieldset");
	J("legend", "Queue a message", s);
	let c = J("textarea", void 0, J("label", "Message", s));
	c.dir = "auto", c.maxLength = 32e3;
	let l = "cold-compose/" + t.id;
	c.value = await e.get(l) ?? "";
	let u = Promise.resolve();
	c.oninput = () => {
		let t = c.value;
		u = u.catch(() => {}).then(() => e.put(l, t)).catch(Y);
	};
	let d = J("input", void 0, J("label", "Attachments · 50 MiB each", s));
	d.type = "file", d.multiple = !0;
	let f, p = X("Record voice note", async () => {
		if (G?.state === "recording") {
			G.stop();
			return;
		}
		if (await Z(n), typeof MediaRecorder > "u" || !navigator.mediaDevices?.getUserMedia) throw Error("Voice recording is unavailable here.");
		let e = ["audio/webm", "audio/mp4"].find((e) => MediaRecorder.isTypeSupported(e));
		if (!e) throw Error("No supported recording format.");
		let t = await navigator.mediaDevices.getUserMedia({ audio: !0 });
		try {
			await Z(n), G = new MediaRecorder(t, { mimeType: e });
		} catch (e) {
			throw t.getTracks().forEach((e) => e.stop()), e;
		}
		let r = G, i = [], a = 0;
		p.textContent = "Stop recording", r.ondataavailable = (e) => {
			a += e.data.size, a > 52428800 ? r.state === "recording" && r.stop() : i.push(e.data);
		}, r.onstop = () => {
			t.getTracks().forEach((e) => e.stop()), G = void 0, n === U && (p.textContent = "Record voice note", a > 52428800 || !a ? Y(Error("Recording unavailable or over 50 MiB.")) : (f = new File(i, e === "audio/webm" ? "Voice note.webm" : "Voice note.m4a", { type: e }), J("p", "Voice note attached.", s)));
		}, r.start(1e3);
	}, s);
	X("Queue on this device", async () => {
		if (await Z(n), G) throw Error("Stop recording before queuing this message.");
		await u;
		let r = Array.from(d.files ?? []);
		if (f && r.push(f), !c.value.trim() && !r.length) throw Error("Write a message or attach a file.");
		let i = {
			id: crypto.randomUUID(),
			session: e.session,
			conversationId: t.id,
			body: c.value.trim(),
			mentions: [],
			termsVersion: o,
			state: "queued",
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			uploads: r.map((e) => ({
				id: crypto.randomUUID(),
				name: e.name,
				mime: e.type || "application/octet-stream",
				voice: e === f
			}))
		};
		await e.persistIntent(i, r, l), await Q(e, t, n);
	}, s);
}
async function $(e = !0) {
	q();
	let t = U;
	Ae();
	try {
		let n = await ye();
		if (t !== U || document.hidden) return;
		W = n.binding, be(W.session), xe(W.account, W.session, n.key);
		let r = new ke(W.account, W.session, W.expectedProfile, !0), i = await Promise.all([!1, !0].map((e) => r.get("cache/inbox/" + e)));
		await Z(t);
		let a = i.flatMap((e) => e?.session === r.session ? e.items : []), o = new URL(location.href).searchParams.get("conversationId"), s = e && a.find((e) => e.id === o);
		if (s) {
			await Q(r, s, t);
			return;
		}
		J("h2", "Cached conversations");
		for (let e of a) X(e.title + (e.archived ? " · Archived" : ""), () => Q(r, e, t));
		a.length || J("p", "No conversations are cached for this session.");
	} catch (e) {
		t === U && Y(e);
	}
}
function Me() {
	q(), Ce(), J("p", "Your ERP account or session changed. Reconnect to continue.");
}
window.addEventListener("storage", (e) => {
	W && e.key === "algt-chat-retired/" + W.session && Me();
});
var Ne = typeof BroadcastChannel < "u" ? new BroadcastChannel("algt-auth-state") : null;
Ne && (Ne.onmessage = Me), document.addEventListener("visibilitychange", () => {
	document.hidden ? (q(), J("p", "Messages locked while this window is hidden.")) : $();
}), window.addEventListener("online", () => {
	q(), location.reload();
}), location.pathname === "/messages" ? $() : location.replace("/messages");
